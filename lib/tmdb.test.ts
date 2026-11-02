import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASE_BACKOFF_MS,
  DEFAULT_MAX_RETRY_DELAY_MS,
  MAX_COOLDOWN_MS,
  MAX_RETRY_JITTER_MS,
  parseRetryAfter,
  resetTmdbCooldown,
  TmdbError,
  tmdbFetch,
} from "./tmdb";

function response(
  status: number,
  body: unknown = {},
  headers: Record<string, string> = {},
) {
  return {
    ok: status === 200,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers(headers),
    body: { cancel: vi.fn(async () => {}) },
    json: async () => body,
  } as unknown as Response;
}

describe("parseRetryAfter", () => {
  it("reads seconds", () => {
    expect(parseRetryAfter("3")).toBe(3000);
    expect(parseRetryAfter("0")).toBe(0);
  });

  it("reads an HTTP date relative to now", () => {
    const now = Date.parse("2026-11-02T10:00:00Z");
    expect(parseRetryAfter("Mon, 02 Nov 2026 10:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfter("Mon, 02 Nov 2026 09:00:00 GMT", now)).toBe(0);
  });

  it("returns null when absent or unparseable", () => {
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter(" ")).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
  });

  it("rejects number forms the spec doesn't allow", () => {
    expect(parseRetryAfter("1e3")).toBeNull();
    expect(parseRetryAfter("0x3C")).toBeNull();
    expect(parseRetryAfter("1.5")).toBeNull();
    expect(parseRetryAfter("-5")).toBeNull();
  });
});

describe("tmdbFetch", () => {
  beforeEach(() => {
    process.env.TMDB_API_KEY = "test-token";
    vi.stubGlobal("fetch", vi.fn());
    resetTmdbCooldown();
    // No jitter, so the timings below are exact; one test turns it back on.
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    delete process.env.TMDB_API_KEY;
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function fetchMock() {
    return fetch as unknown as ReturnType<typeof vi.fn>;
  }

  it("builds the URL from the path and params and returns the JSON body", async () => {
    fetchMock().mockResolvedValueOnce(response(200, { id: 1 }));

    expect(
      await tmdbFetch("/find/tt1", { external_source: "imdb_id" }),
    ).toEqual({ id: 1 });
    expect(fetchMock().mock.calls[0][0]).toBe(
      "https://api.themoviedb.org/3/find/tt1?external_source=imdb_id",
    );
  });

  it("passes the caller's abort signal through, and none by default", async () => {
    fetchMock().mockResolvedValue(response(200));
    const signal = new AbortController().signal;

    await tmdbFetch("/a", {}, { signal });
    await tmdbFetch("/b");

    expect(fetchMock().mock.calls[0][1].signal).toBe(signal);
    expect(fetchMock().mock.calls[1][1].signal).toBeUndefined();
  });

  it("throws a TmdbError carrying the HTTP status, without retrying a 404", async () => {
    fetchMock().mockResolvedValueOnce(response(404));

    const error = await tmdbFetch("/movie/1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TmdbError);
    expect((error as TmdbError).status).toBe(404);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("throws without a token, before any request", async () => {
    delete process.env.TMDB_API_KEY;

    await expect(tmdbFetch("/movie/1")).rejects.toThrow(/TMDB_API_KEY/);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("retries a 5xx with exponential backoff", async () => {
    vi.useFakeTimers();
    fetchMock()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(502))
      .mockResolvedValueOnce(response(200, { id: 1 }));

    const result = tmdbFetch("/movie/1");
    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS - 1);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS * 2);

    expect(await result).toEqual({ id: 1 });
    expect(fetchMock()).toHaveBeenCalledTimes(3);
  });

  it("gives up after maxRetries", async () => {
    vi.useFakeTimers();
    fetchMock().mockResolvedValue(response(500));

    const result = tmdbFetch("/movie/1", {}, { maxRetries: 1 }).catch(
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS);

    expect(((await result) as TmdbError).status).toBe(500);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it("retries a network error, but not the caller's own abort", async () => {
    vi.useFakeTimers();
    fetchMock()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(response(200, { id: 1 }));

    const result = tmdbFetch("/movie/1");
    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS);
    expect(await result).toEqual({ id: 1 });

    const controller = new AbortController();
    controller.abort(new Error("timed out"));
    fetchMock().mockRejectedValueOnce(new Error("timed out"));
    await expect(
      tmdbFetch("/movie/2", {}, { signal: controller.signal }),
    ).rejects.toThrow(/timed out/);
    expect(fetchMock()).toHaveBeenCalledTimes(3);
  });

  it("waits out a 429's Retry-After, then retries", async () => {
    vi.useFakeTimers();
    fetchMock()
      .mockResolvedValueOnce(response(429, {}, { "Retry-After": "2" }))
      .mockResolvedValueOnce(response(200, { id: 1 }));

    const result = tmdbFetch("/movie/1");
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await result).toEqual({ id: 1 });
  });

  it("fails at once when the wait is longer than the caller allows", async () => {
    fetchMock().mockResolvedValueOnce(
      response(503, {}, { "Retry-After": "30" }),
    );

    await expect(
      tmdbFetch("/movie/1", {}, { maxRetryDelayMs: 1000 }),
    ).rejects.toThrow(/503/);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("after a 429, holds every caller off until the cooldown ends", async () => {
    vi.useFakeTimers();
    fetchMock().mockResolvedValueOnce(
      response(429, {}, { "Retry-After": "30" }),
    );

    // A render-path caller won't wait 30s: it fails, but starts the cooldown.
    await expect(
      tmdbFetch("/movie/1", {}, { maxRetryDelayMs: 1000 }),
    ).rejects.toMatchObject({ status: 429 });

    // Another impatient caller fails without a request.
    await expect(
      tmdbFetch("/movie/2", {}, { maxRetryDelayMs: 1000 }),
    ).rejects.toThrow(/cooling down for 30s/);
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    // A patient one (the seed script's default) waits, then goes ahead.
    fetchMock().mockResolvedValueOnce(response(200, { id: 3 }));
    await vi.advanceTimersByTimeAsync(25_000);
    const patient = tmdbFetch("/movie/3");
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await patient).toEqual({ id: 3 });
  });

  it("adds random jitter to retry waits", async () => {
    vi.useFakeTimers();
    vi.mocked(Math.random).mockReturnValue(0.5);
    fetchMock()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, { id: 1 }));

    const result = tmdbFetch("/movie/1");
    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MAX_RETRY_JITTER_MS / 2);

    expect(await result).toEqual({ id: 1 });
  });

  it("never retries sooner than the backoff, even on Retry-After: 0", async () => {
    vi.useFakeTimers();
    fetchMock()
      .mockResolvedValueOnce(response(429, {}, { "Retry-After": "0" }))
      .mockResolvedValueOnce(response(200, { id: 1 }));

    const result = tmdbFetch("/movie/1");
    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS - 1);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(await result).toEqual({ id: 1 });
  });

  it("keeps jitter on a wait right at the caller's cap", async () => {
    vi.useFakeTimers();
    vi.mocked(Math.random).mockReturnValue(0.5);
    fetchMock()
      .mockResolvedValueOnce(response(503, {}, { "Retry-After": "1" }))
      .mockResolvedValueOnce(response(200, { id: 1 }));

    const result = tmdbFetch("/movie/1", {}, { maxRetryDelayMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(MAX_RETRY_JITTER_MS / 2);

    expect(await result).toEqual({ id: 1 });
  });

  it("caps the cooldown a huge Retry-After imposes on other callers", async () => {
    vi.useFakeTimers();
    fetchMock().mockResolvedValueOnce(
      response(429, {}, { "Retry-After": "3600" }),
    );
    await expect(
      tmdbFetch("/movie/1", {}, { maxRetryDelayMs: 1000 }),
    ).rejects.toMatchObject({ status: 429 });

    // A patient caller waits out the capped cooldown instead of failing.
    fetchMock().mockResolvedValueOnce(response(200, { id: 2 }));
    const next = tmdbFetch("/movie/2");
    await vi.advanceTimersByTimeAsync(MAX_COOLDOWN_MS);

    expect(await next).toEqual({ id: 2 });
  });

  it("by default retries after the capped wait, not giving up on a huge Retry-After", async () => {
    vi.useFakeTimers();
    fetchMock()
      .mockResolvedValueOnce(response(429, {}, { "Retry-After": "120" }))
      .mockResolvedValueOnce(response(200, { id: 1 }));

    const result = tmdbFetch("/movie/1");
    await vi.advanceTimersByTimeAsync(MAX_COOLDOWN_MS);

    expect(await result).toEqual({ id: 1 });
  });

  it("retries a 200 whose body isn't valid JSON", async () => {
    vi.useFakeTimers();
    const garbled = {
      ...response(200),
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as Response;
    fetchMock()
      .mockResolvedValueOnce(garbled)
      .mockResolvedValueOnce(response(200, { id: 1 }));

    const result = tmdbFetch("/movie/1");
    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS);

    expect(await result).toEqual({ id: 1 });
  });

  it("releases a failed response's body", async () => {
    vi.useFakeTimers();
    const failed = response(503);
    const notFound = response(404);
    fetchMock().mockResolvedValueOnce(failed).mockResolvedValueOnce(notFound);

    const result = tmdbFetch("/movie/1").catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS);
    await result;

    expect(failed.body!.cancel).toHaveBeenCalled();
    expect(notFound.body!.cancel).toHaveBeenCalled();
  });

  it("doesn't back off from a network error for longer than the caller allows", async () => {
    vi.useFakeTimers();
    fetchMock().mockRejectedValue(new TypeError("fetch failed"));

    const result = tmdbFetch(
      "/movie/1",
      {},
      { maxRetries: 5, maxRetryDelayMs: BASE_BACKOFF_MS * 2 },
    ).catch((e: unknown) => e);
    // Waits 500ms, then 1s; the next backoff (2s) is over the cap.
    await vi.advanceTimersByTimeAsync(BASE_BACKOFF_MS * 3);

    expect(await result).toBeInstanceOf(TypeError);
    expect(fetchMock()).toHaveBeenCalledTimes(3);
  });

  it("by default waits out a long Retry-After, up to a minute", async () => {
    vi.useFakeTimers();
    const seconds = DEFAULT_MAX_RETRY_DELAY_MS / 1000;
    fetchMock()
      .mockResolvedValueOnce(
        response(429, {}, { "Retry-After": String(seconds) }),
      )
      .mockResolvedValueOnce(response(200, { id: 1 }));

    const waited = tmdbFetch("/movie/1");
    await vi.advanceTimersByTimeAsync(DEFAULT_MAX_RETRY_DELAY_MS);
    expect(await waited).toEqual({ id: 1 });
  });

  it("stops waiting between retries when the caller aborts", async () => {
    vi.useFakeTimers();
    fetchMock().mockResolvedValue(response(503));
    const controller = new AbortController();

    const result = tmdbFetch(
      "/movie/1",
      {},
      { signal: controller.signal },
    ).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(100);
    controller.abort(new Error("timed out"));

    expect(await result).toMatchObject({ message: "timed out" });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });
});

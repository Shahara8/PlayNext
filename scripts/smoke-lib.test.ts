import { describe, expect, it, vi } from "vitest";
import {
  CdpClient,
  chromeCandidates,
  normalizeBaseUrl,
  pickLegacyTitle,
  parseDevToolsUrl,
  parseSmokeArgs,
  PRODUCTION_URL,
  screenshotName,
  summarize,
} from "./smoke-lib";

describe("pickLegacyTitle", () => {
  const movie = (tmdb_id: number) => ({
    media_type: "movie" as const,
    tmdb_id,
  });
  const tv = (tmdb_id: number) => ({ media_type: "tv" as const, tmdb_id });

  it("picks the first legacy title that is live", () => {
    expect(
      pickLegacyTitle([tv(1), movie(2), tv(3)], [tv(3), movie(2)]),
    ).toEqual(movie(2));
  });

  it("needs the media type to match too", () => {
    expect(pickLegacyTitle([tv(7)], [movie(7)])).toBeNull();
  });

  it("is null when nothing old is live", () => {
    expect(pickLegacyTitle([tv(1)], [])).toBeNull();
    expect(pickLegacyTitle([], [tv(1)])).toBeNull();
  });
});

describe("parseSmokeArgs", () => {
  it("defaults to production, .smoke and signed-in checks", () => {
    expect(parseSmokeArgs([])).toEqual({
      baseUrl: PRODUCTION_URL,
      outDir: ".smoke",
      signedOutOnly: false,
    });
  });

  it("reads --url, --out and --signed-out", () => {
    expect(
      parseSmokeArgs([
        "--url",
        "http://localhost:3000/",
        "--out",
        "shots",
        "--signed-out",
      ]),
    ).toEqual({
      baseUrl: "http://localhost:3000",
      outDir: "shots",
      signedOutOnly: true,
    });
  });

  it("rejects unknown flags and missing values", () => {
    expect(() => parseSmokeArgs(["--nope"])).toThrow(/Unknown argument/);
    expect(() => parseSmokeArgs(["--url"])).toThrow(/needs a value/);
    expect(() => parseSmokeArgs(["--out", "--signed-out"])).toThrow(
      /needs a value/,
    );
  });
});

describe("normalizeBaseUrl", () => {
  it("drops a bare trailing slash", () => {
    expect(normalizeBaseUrl("https://x.vercel.app/")).toBe(
      "https://x.vercel.app",
    );
  });

  it("rejects a path or query instead of silently dropping it", () => {
    for (const url of [
      "https://x.vercel.app/preview",
      "https://x.vercel.app/?q=1",
    ])
      expect(() => normalizeBaseUrl(url)).toThrow(/origin only/);
  });

  it("rejects non-URLs and non-http schemes", () => {
    expect(() => normalizeBaseUrl("localhost:3000")).toThrow();
    expect(() => normalizeBaseUrl("not a url")).toThrow(/Not a URL/);
    expect(() => normalizeBaseUrl("file:///c:/x")).toThrow(/http/);
  });
});

describe("chromeCandidates", () => {
  it("puts CHROME_PATH first", () => {
    expect(chromeCandidates("linux", { CHROME_PATH: "/opt/chrome" })[0]).toBe(
      "/opt/chrome",
    );
  });

  it("builds Windows paths from the environment", () => {
    expect(
      chromeCandidates("win32", {
        PROGRAMFILES: "C:\\Program Files",
        LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local",
      }),
    ).toEqual([
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Users\\u\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
    ]);
  });

  it("knows the macOS app path", () => {
    expect(chromeCandidates("darwin", {})).toEqual([
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]);
  });
});

describe("parseDevToolsUrl", () => {
  it("finds the URL in Chrome's stderr", () => {
    expect(
      parseDevToolsUrl(
        "[123:WARNING] noise\n\nDevTools listening on ws://127.0.0.1:51234/devtools/browser/abc-123\n",
      ),
    ).toBe("ws://127.0.0.1:51234/devtools/browser/abc-123");
  });

  it("returns null until it's printed", () => {
    expect(parseDevToolsUrl("DevTools listen")).toBeNull();
  });
});

describe("screenshotName", () => {
  it("slugs the viewport and label", () => {
    expect(
      screenshotName("phone", "signed-in reset password (password session)"),
    ).toBe("phone-signed-in-reset-password-password-session.png");
  });
});

describe("summarize", () => {
  it("passes when every check passed", () => {
    const { ok, text } = summarize([
      { name: "a", ok: true },
      { name: "b", ok: true, detail: "/title/1" },
    ]);
    expect(ok).toBe(true);
    expect(text).toContain("PASS  b — /title/1");
    expect(text).toContain("All 2 checks passed.");
  });

  it("fails when any check failed", () => {
    const { ok, text } = summarize([
      { name: "a", ok: true },
      { name: "b", ok: false, detail: "overflow" },
    ]);
    expect(ok).toBe(false);
    expect(text).toContain("FAIL  b — overflow");
    expect(text).toContain("1 of 2 checks failed.");
  });

  it("treats no checks at all as a failure", () => {
    expect(summarize([]).ok).toBe(false);
  });
});

describe("CdpClient", () => {
  function client() {
    const sent: { id: number; method: string; params: unknown }[] = [];
    const cdp = new CdpClient((data) => sent.push(JSON.parse(data)));
    return { cdp, sent };
  }

  it("numbers requests and matches responses by id", async () => {
    const { cdp, sent } = client();
    const first = cdp.send("Page.enable");
    const second = cdp.send("Runtime.evaluate", { expression: "1" });
    expect(sent.map((m) => [m.id, m.method])).toEqual([
      [1, "Page.enable"],
      [2, "Runtime.evaluate"],
    ]);

    cdp.receive(JSON.stringify({ id: 2, result: { value: 1 } }));
    cdp.receive(JSON.stringify({ id: 1, result: {} }));
    await expect(second).resolves.toEqual({ value: 1 });
    await expect(first).resolves.toEqual({});
  });

  it("rejects on a protocol error", async () => {
    const { cdp } = client();
    const req = cdp.send("Nope.method");
    cdp.receive(JSON.stringify({ id: 1, error: { message: "not found" } }));
    await expect(req).rejects.toThrow("not found");
  });

  it("ignores responses nobody is waiting for", () => {
    const { cdp } = client();
    expect(() =>
      cdp.receive(JSON.stringify({ id: 99, result: {} })),
    ).not.toThrow();
  });

  it("waits for the named event only", async () => {
    const { cdp } = client();
    const loaded = cdp.waitForEvent("Page.loadEventFired", 1000);
    cdp.receive(JSON.stringify({ method: "Page.frameNavigated", params: {} }));
    cdp.receive(
      JSON.stringify({ method: "Page.loadEventFired", params: { t: 5 } }),
    );
    await expect(loaded).resolves.toEqual({ t: 5 });
  });

  it("times out waiting for an event", async () => {
    vi.useFakeTimers();
    try {
      const { cdp } = client();
      const loaded = cdp.waitForEvent("Page.loadEventFired", 500);
      vi.advanceTimersByTime(501);
      await expect(loaded).rejects.toThrow(/Timed out after 500ms/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails in-flight requests on close", async () => {
    const { cdp } = client();
    const req = cdp.send("Page.enable");
    cdp.close("socket closed");
    await expect(req).rejects.toThrow("socket closed");
  });

  it("times out a request Chrome never answers", async () => {
    vi.useFakeTimers();
    try {
      const { cdp } = client();
      const req = cdp.send("Runtime.evaluate", {}, 1000);
      vi.advanceTimersByTime(1001);
      await expect(req).rejects.toThrow(
        "Runtime.evaluate: no answer after 1000ms",
      );
      // A late answer is ignored.
      expect(() =>
        cdp.receive(JSON.stringify({ id: 1, result: {} })),
      ).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects when the frame can't be sent", async () => {
    const cdp = new CdpClient(() => {
      throw new Error("socket is closed");
    });
    await expect(cdp.send("Page.enable")).rejects.toThrow("socket is closed");
  });
});

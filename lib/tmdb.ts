// Shared TMDB API client: used by lib/tmdb-resolve.ts (seed/ingestion) and
// lib/tmdb-related.ts (recommendations).

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

// Worth retrying: rate limited, or TMDB/its CDN having a bad moment.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
export const DEFAULT_MAX_RETRIES = 2;
// The longest any one Retry-After is honored for (and so the longest cooldown
// one 429 can impose on the instance), so a huge or bogus value can't block
// every TMDB call for an hour.
export const MAX_COOLDOWN_MS = 60_000;
// Batch callers (the seed script) wait out even a long Retry-After: the
// default cap is the longest wait there ever is (see MAX_COOLDOWN_MS).
export const DEFAULT_MAX_RETRY_DELAY_MS = MAX_COOLDOWN_MS;
// Backoff when TMDB sends no Retry-After: 500ms, then 1s, ...
export const BASE_BACKOFF_MS = 500;
// Up to this much random extra wait, so callers that failed together (e.g.
// one page view's seed lookups, all waiting out one cooldown) don't all
// retry in the same instant and trip the rate limit again.
export const MAX_RETRY_JITTER_MS = 250;

export interface TmdbFetchOptions {
  // Callers on a page's render path pass one (e.g. AbortSignal.timeout) so a
  // hung TMDB request fails instead of holding the page; batch jobs don't.
  // It also cuts short any wait between retries.
  signal?: AbortSignal;
  /** Retries after the first attempt, for 429s, 5xx and network errors. */
  maxRetries?: number;
  /**
   * The longest this caller will wait before a retry (or for a rate-limit
   * cooldown to end). A longer wait fails the request at once instead, so a
   * page can fall back while a batch job, with a higher cap, just waits.
   * Jitter (up to MAX_RETRY_JITTER_MS) comes on top: clamping it to the cap
   * would line waiters back up whenever the wait is right at the cap.
   */
  maxRetryDelayMs?: number;
}

// After a 429, every request from this server instance holds off until the
// rate limit should have reset, so concurrent callers (e.g. one page view's
// 20 seed lookups) don't keep hammering TMDB into more 429s.
let cooldownUntil = 0;

/** Clears the rate-limit cooldown. Module state, so tests reset it. */
export function resetTmdbCooldown(): void {
  cooldownUntil = 0;
}

/**
 * Retry-After in ms, or null if absent/invalid. The spec allows only whole
 * seconds or an HTTP date, so anything else ("1e3", "0x3C") is ignored
 * rather than read as a huge cooldown.
 */
export function parseRetryAfter(
  header: string | null,
  now = Date.now(),
): number | null {
  const value = header?.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) * 1000;
  // An HTTP date ends in GMT; checked first because Date.parse also accepts
  // loose strings like "1".
  if (!/GMT$/.test(value)) return null;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

function backoff(attempt: number): number {
  return BASE_BACKOFF_MS * 2 ** attempt;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
  {
    signal,
    maxRetries = DEFAULT_MAX_RETRIES,
    maxRetryDelayMs = DEFAULT_MAX_RETRY_DELAY_MS,
  }: TmdbFetchOptions = {},
): Promise<T> {
  // TMDB_API_KEY holds the v4 Read Access Token (a JWT), sent as a bearer
  // token — not the legacy v3 api_key query param.
  const token = process.env.TMDB_API_KEY;
  if (!token) throw new Error("TMDB_API_KEY is not set");

  const query = new URLSearchParams(params);
  const url = `${TMDB_BASE_URL}${path}?${query.toString()}`;

  const wait = (ms: number) =>
    sleep(ms + Math.random() * MAX_RETRY_JITTER_MS, signal);

  for (let attempt = 0; ; attempt++) {
    const cooldown = cooldownUntil - Date.now();
    if (cooldown > 0) {
      if (cooldown > maxRetryDelayMs)
        throw new TmdbError(
          `TMDB request skipped: ${path} (rate limited, cooling down for ${Math.ceil(cooldown / 1000)}s)`,
          429,
        );
      await wait(cooldown);
    }

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal,
      });
      if (res.ok) return (await res.json()) as T;
    } catch (error) {
      // A network failure or a garbled body is retried; the caller's own
      // abort is final.
      if (
        signal?.aborted ||
        attempt >= maxRetries ||
        backoff(attempt) > maxRetryDelayMs
      )
        throw error;
      await wait(backoff(attempt));
      continue;
    }

    // Unread, a failed response's body holds its connection until GC.
    await res.body?.cancel().catch(() => {});
    const error = new TmdbError(
      `TMDB request failed: ${path} -> ${res.status} ${res.statusText}`,
      res.status,
    );
    if (!RETRYABLE_STATUSES.has(res.status)) throw error;

    // Never below the backoff: a "Retry-After: 0" would otherwise send every
    // waiting caller back at once.
    const delay = Math.min(
      Math.max(
        parseRetryAfter(res.headers.get("retry-after")) ?? 0,
        backoff(attempt),
      ),
      MAX_COOLDOWN_MS,
    );
    // Set even when this caller gives up, so other callers back off too.
    if (res.status === 429)
      cooldownUntil = Math.max(cooldownUntil, Date.now() + delay);
    if (attempt >= maxRetries || delay > maxRetryDelayMs) throw error;
    // After a 429 the cooldown check above does the waiting.
    if (res.status !== 429) await wait(delay);
  }
}

// TMDB matching for the daily pipeline (docs/INGESTION.md Section 3): each
// feed imdb_id gets its title key (media_type, tmdb_id), or null, through the
// imdb_tmdb_map cache, so daily TMDB traffic stays bounded to new titles, the
// ~30-day retries of unresolved ones and a capped ~7-day metadata refresh.
//
// TMDB being down never blocks the availability update: a failed lookup is
// not "no match" (nothing is cached, the id is retried next run), the title
// just goes in with a null key today. After a few outage-like failures in a
// row the run stops calling TMDB altogether. Only the database reads may throw: the same
// database takes the availability writes, so the run can't proceed without it.
//
// The matching itself is lib/tmdb-resolve.ts, shared with the mock seed.

import {
  fetchTitleDetails,
  resolveImdbToTmdb,
  type FeedMediaType,
  type ResolvedTitle,
} from "../../../lib/tmdb-resolve";
import { inPool } from "../../../lib/in-pool";
import { TmdbError } from "../../../lib/tmdb";
import { titleKey, type TitleRef } from "../../../lib/title-ref";

export type ResolutionStatus = "resolved" | "unresolved" | "ambiguous";

/** One imdb_tmdb_map row. */
export interface MapEntry {
  imdb_id: string;
  media_type: TitleRef["media_type"] | null;
  tmdb_id: number | null;
  resolution_status: ResolutionStatus;
  last_attempted_at: string;
  attempt_count: number;
}

/** Where the cache lives: ./store.ts (Supabase), or an in-memory fake in tests. */
export interface ResolutionStore {
  loadMapEntries(imdbIds: readonly string[]): Promise<MapEntry[]>;
  /** title_cache.last_refreshed_at for the refs that have a row. */
  loadRefreshTimes(
    refs: readonly TitleRef[],
  ): Promise<{ ref: TitleRef; last_refreshed_at: string }[]>;
  /**
   * Upserts a newly resolved title_cache row, stamping last_refreshed_at.
   * Throws TitleConflictError when another title holds its imdb_id.
   */
  saveTitle(title: ResolvedTitle, refreshedAt: string): Promise<void>;
  /** Updates an existing row's metadata, leaving its imdb_id alone. */
  refreshTitle(title: ResolvedTitle, refreshedAt: string): Promise<void>;
  /** Stamps last_refreshed_at only (TMDB had nothing for it). */
  markRefreshed(ref: TitleRef, refreshedAt: string): Promise<void>;
  saveMapEntry(entry: MapEntry): Promise<void>;
}

/** title_cache.imdb_id is unique: the store's signal for that clash. */
export class TitleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TitleConflictError";
  }
}

/**
 * TMDB answered that it has no such title (404), as opposed to TMDB failing
 * (5xx, 429 past its retries, the network) or refusing us (401, or a 403
 * from a firewall), which say nothing about the title and count toward
 * giving up.
 */
function isNotFound(error: unknown): boolean {
  return error instanceof TmdbError && error.status === 404;
}

/** The TMDB calls, injectable for tests. */
export interface TmdbLookups {
  resolve(imdbId: string, type: FeedMediaType): Promise<ResolvedTitle | null>;
  details(ref: TitleRef, imdbId: string): Promise<ResolvedTitle>;
}

/**
 * The longest one TMDB call may take, retries included. tmdbFetch has no
 * timeout of its own, and a hung connection would otherwise hold a worker
 * (and the run) forever; a timeout counts toward giving up on TMDB.
 */
export const TMDB_CALL_TIMEOUT_MS = 180_000;

export const LIVE_TMDB: TmdbLookups = {
  resolve: (imdbId, type) =>
    resolveImdbToTmdb(imdbId, type, {
      signal: AbortSignal.timeout(TMDB_CALL_TIMEOUT_MS),
    }),
  details: (ref, imdbId) =>
    fetchTitleDetails(ref, imdbId, {
      signal: AbortSignal.timeout(TMDB_CALL_TIMEOUT_MS),
    }),
};

/** Unresolved (or ambiguous) ids are asked about again after this long. */
export const RETRY_UNRESOLVED_DAYS = 30;
/** title_cache rows older than this get their metadata refreshed. */
export const REFRESH_AFTER_DAYS = 7;
/** Refreshes per run (oldest first), so a big catalog spreads them out. */
export const MAX_REFRESHES_PER_RUN = 300;
/** This many failed TMDB calls in a row: TMDB is down, stop asking this run. */
export const MAX_CONSECUTIVE_FAILURES = 5;
/**
 * A partial outage: once at least FAILURE_RATE_MIN_CALLS calls were made,
 * stop when this share or more of them failed. An occasional success resets
 * the run of failures, not this.
 */
export const MAX_FAILURE_RATE = 0.5;
export const FAILURE_RATE_MIN_CALLS = 20;
/** TMDB calls in flight at once (tmdbFetch handles 429 cooldowns). */
export const TMDB_CONCURRENCY = 4;
export const MAX_RECORDED_ERRORS = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResolveOptions {
  now?: Date;
  maxRefreshes?: number;
  maxConsecutiveFailures?: number;
  concurrency?: number;
}

export interface ResolutionError {
  imdb_id: string;
  stage: "lookup" | "refresh" | "save";
  message: string;
}

export interface ResolutionStats {
  /** Distinct imdb_ids asked about. */
  ids: number;
  /** Keyed from the cache, no lookup. */
  cached: number;
  /** Looked up on TMDB, matched and stored (keyed). */
  resolved: number;
  /** Looked up, not found, and cached as unresolved. */
  unresolved: number;
  /** Matched a title whose imdb_id another title holds; cached, no key. */
  ambiguous: number;
  /** Known unresolved, not retried yet. */
  waiting: number;
  refreshed: number;
  /** TMDB calls that failed (an outage, or a 4xx about one title). */
  tmdbFailures: number;
  /**
   * Lookups and refreshes not attempted because TMDB was given up on. Given
   * up before the refresh stage, its candidates aren't even read or counted.
   */
  skipped: number;
  /** Whether this run gave up on TMDB. */
  tmdbDown: boolean;
  saveFailures: number;
}

export interface ResolutionResult {
  /** Every distinct imdb_id → its title key, or null (stored with no key). */
  keys: Map<string, TitleRef | null>;
  stats: ResolutionStats;
  /** The first MAX_RECORDED_ERRORS failures (stats has the counts). */
  errors: ResolutionError[];
}

/**
 * Title keys for a provider's matched rows. Returns a key only when its
 * title_cache row exists, so staging can always reference it.
 */
export async function resolveTitleKeys(
  rows: readonly { imdb_id: string; type: FeedMediaType }[],
  store: ResolutionStore,
  tmdb: TmdbLookups = LIVE_TMDB,
  options: ResolveOptions = {},
): Promise<ResolutionResult> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const maxRefreshes = options.maxRefreshes ?? MAX_REFRESHES_PER_RUN;
  const maxFailures =
    options.maxConsecutiveFailures ?? MAX_CONSECUTIVE_FAILURES;
  const concurrency = options.concurrency ?? TMDB_CONCURRENCY;

  // One lookup per imdb_id; the first row's type is the hint.
  const types = new Map<string, FeedMediaType>();
  for (const row of rows)
    if (!types.has(row.imdb_id)) types.set(row.imdb_id, row.type);
  const ids = [...types.keys()];

  const keys = new Map<string, TitleRef | null>();
  const errors: ResolutionError[] = [];
  const stats: ResolutionStats = {
    ids: ids.length,
    cached: 0,
    resolved: 0,
    unresolved: 0,
    ambiguous: 0,
    waiting: 0,
    refreshed: 0,
    tmdbFailures: 0,
    skipped: 0,
    tmdbDown: false,
    saveFailures: 0,
  };
  const record = (error: ResolutionError) => {
    if (errors.length < MAX_RECORDED_ERRORS) errors.push(error);
  };

  // --- What the cache already knows ---------------------------------
  const entries = new Map(
    (await store.loadMapEntries(ids)).map((e) => [e.imdb_id, e]),
  );
  const toLookUp: string[] = [];
  const cachedRefs: { imdbId: string; ref: TitleRef }[] = [];
  for (const imdbId of ids) {
    const entry = entries.get(imdbId);
    keys.set(imdbId, null);
    if (!entry) {
      toLookUp.push(imdbId);
    } else if (
      entry.resolution_status === "resolved" &&
      entry.media_type &&
      entry.tmdb_id !== null
    ) {
      const ref = { media_type: entry.media_type, tmdb_id: entry.tmdb_id };
      keys.set(imdbId, ref);
      cachedRefs.push({ imdbId, ref });
      stats.cached++;
    } else if (
      // Due after RETRY_UNRESOLVED_DAYS; a stamp that won't parse (NaN) is
      // due too, rather than waiting forever.
      !(
        now.getTime() - Date.parse(entry.last_attempted_at) <
        RETRY_UNRESOLVED_DAYS * DAY_MS
      )
    ) {
      toLookUp.push(imdbId);
    } else {
      stats.waiting++;
    }
  }

  // --- TMDB calls, with the give-up rule -----------------------------
  let consecutiveFailures = 0;
  let calls = 0;
  let outageFailures = 0;
  /**
   * Runs one TMDB call. `notFound`: TMDB answered that it has nothing for
   * this title (a 404), which says nothing about TMDB being down.
   * undefined: TMDB was already given up on.
   */
  const callTmdb = async <T>(
    imdbId: string,
    stage: "lookup" | "refresh",
    call: () => Promise<T>,
  ): Promise<
    { ok: true; value: T } | { ok: false; notFound: boolean } | undefined
  > => {
    if (stats.tmdbDown) {
      stats.skipped++;
      return undefined;
    }
    calls++;
    try {
      const value = await call();
      consecutiveFailures = 0;
      return { ok: true, value };
    } catch (error) {
      stats.tmdbFailures++;
      record({ imdb_id: imdbId, stage, message: errorMessage(error) });
      if (isNotFound(error)) {
        consecutiveFailures = 0; // TMDB answered: it's up.
        return { ok: false, notFound: true };
      }
      consecutiveFailures++;
      outageFailures++;
      // A rejected token fails every call the same way: no point going on.
      const authFailure = error instanceof TmdbError && error.status === 401;
      const mostlyFailing =
        calls >= FAILURE_RATE_MIN_CALLS &&
        outageFailures / calls >= MAX_FAILURE_RATE;
      if (authFailure || consecutiveFailures >= maxFailures || mostlyFailing)
        stats.tmdbDown = true;
      return { ok: false, notFound: false };
    }
  };

  /** Runs one write; a failure is logged and handed back, never thrown. */
  const save = async (
    imdbId: string,
    write: () => Promise<void>,
  ): Promise<{ ok: true } | { ok: false; error: unknown }> => {
    try {
      await write();
      return { ok: true };
    } catch (error) {
      stats.saveFailures++;
      record({ imdb_id: imdbId, stage: "save", message: errorMessage(error) });
      return { ok: false, error };
    }
  };

  // New and retried ids first: a title with no key shows no poster at all,
  // while a stale one only shows last week's rating.
  await inPool(toLookUp, concurrency, async (imdbId) => {
    const outcome = await callTmdb(imdbId, "lookup", () =>
      tmdb.resolve(imdbId, types.get(imdbId)!),
    );
    // Skipped, or TMDB failing: nothing cached, asked again next run.
    if (!outcome || (!outcome.ok && !outcome.notFound)) return;
    const previous = entries.get(imdbId);
    const attempt = {
      imdb_id: imdbId,
      last_attempted_at: nowIso,
      attempt_count: (previous?.attempt_count ?? 0) + 1,
    };
    /** Cached with no key, so it waits RETRY_UNRESOLVED_DAYS. */
    const cacheWithoutKey = async (
      resolution_status: "unresolved" | "ambiguous",
    ) => {
      const saved = await save(imdbId, () =>
        store.saveMapEntry({
          ...attempt,
          media_type: null,
          tmdb_id: null,
          resolution_status,
        }),
      );
      if (saved.ok) stats[resolution_status]++;
    };

    // A 404 (e.g. /find's hit has no details) is a miss too.
    const match = outcome.ok ? outcome.value : null;
    if (!match) return cacheWithoutKey("unresolved");
    const ref = { media_type: match.media_type, tmdb_id: match.tmdb_id };
    // title_cache first: the map's foreign key needs the row, and so does
    // the key returned for staging.
    const saved = await save(imdbId, async () => {
      try {
        await store.saveTitle(match, nowIso);
      } catch (error) {
        // TMDB's own IMDb id for the match is held by another row; the
        // feed's (an alias TMDB doesn't list) may not be.
        if (!(error instanceof TitleConflictError) || match.imdb_id === imdbId)
          throw error;
        await store.saveTitle({ ...match, imdb_id: imdbId }, nowIso);
      }
    });
    if (!saved.ok) {
      // Another title already holds this IMDb id (e.g. a movie and a series
      // under one id): a lasting clash, so it waits like a miss rather than
      // asking TMDB again every day. Other errors may pass: retried.
      if (saved.error instanceof TitleConflictError)
        await cacheWithoutKey("ambiguous");
      return;
    }
    stats.resolved++;
    keys.set(imdbId, ref);
    await save(imdbId, () =>
      store.saveMapEntry({
        ...attempt,
        ...ref,
        resolution_status: "resolved",
      }),
    );
  });

  // --- The ~7-day metadata refresh, oldest first, capped --------------
  // (With TMDB given up on, every refresh would be skipped: no need to read.)
  if (cachedRefs.length > 0 && maxRefreshes > 0 && !stats.tmdbDown) {
    const refreshedAt = new Map(
      (await store.loadRefreshTimes(cachedRefs.map((c) => c.ref))).map((r) => [
        titleKey(r.ref),
        Date.parse(r.last_refreshed_at),
      ]),
    );
    // Several imdb_ids can share a key (TMDB merged duplicates): once each.
    const byKey = new Map<string, { imdbId: string; ref: TitleRef }>();
    for (const c of cachedRefs) byKey.set(titleKey(c.ref), c);
    const stale = [...byKey.entries()]
      // No row, or a stamp that won't parse: oldest, so refreshed first.
      .map(([key, c]) => ({ ...c, at: refreshedAt.get(key) || 0 }))
      .filter((c) => now.getTime() - c.at >= REFRESH_AFTER_DAYS * DAY_MS)
      .sort((a, b) => a.at - b.at)
      .slice(0, maxRefreshes);

    await inPool(stale, concurrency, async ({ imdbId, ref }) => {
      const outcome = await callTmdb(imdbId, "refresh", () =>
        tmdb.details(ref, imdbId),
      );
      // TMDB failing: the cached metadata stays, and so does the key.
      if (!outcome || (!outcome.ok && !outcome.notFound)) return;
      // Guard: details for a key must describe that key.
      const mismatch = outcome.ok && titleKey(outcome.value) !== titleKey(ref);
      if (outcome.ok && mismatch)
        record({
          imdb_id: imdbId,
          stage: "refresh",
          message: `details for ${titleKey(ref)} returned ${titleKey(outcome.value)}`,
        });
      if (!outcome.ok || mismatch) {
        // TMDB no longer has this key (deleted, or merged into another
        // title). The id keeps the key and its last good metadata (moving it
        // would clash: the old row holds its imdb_id); the 404 is logged, and
        // the title goes to the back of the queue so it can't hold the front
        // of every run's refresh batch.
        await save(imdbId, () => store.markRefreshed(ref, nowIso));
        return;
      }
      const saved = await save(imdbId, () =>
        store.refreshTitle(outcome.value, nowIso),
      );
      if (saved.ok) stats.refreshed++;
    });
  }

  return { keys, stats, errors };
}

/**
 * For step 4's staging rows: each matched row with its title key, or both
 * columns null (provider_availability's both-or-neither check).
 */
export function withTitleKeys<R extends { imdb_id: string }>(
  rows: readonly R[],
  keys: ReadonlyMap<string, TitleRef | null>,
): (R & {
  media_type: TitleRef["media_type"] | null;
  tmdb_id: number | null;
})[] {
  return rows.map((row) => {
    const key = keys.get(row.imdb_id) ?? null;
    return {
      ...row,
      media_type: key?.media_type ?? null,
      tmdb_id: key?.tmdb_id ?? null,
    };
  });
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

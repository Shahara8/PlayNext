import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCatalogTitlesByIds,
  getTrendingTitles,
  type CatalogTitle,
} from "./catalog";
import { getRelatedTmdbIds } from "./tmdb-related";
import type { Sentiment } from "./user-titles";

// Content-based recommendations, computed on demand (docs/MVP.md Section 6).

export const MAX_SEEDS = 20;
export const SEED_MIN_RATING = 7;
// Weight of the genre-overlap fraction (0-1): it breaks ties between
// candidates with the same seed count, but can never outrank an extra seed.
export const GENRE_BOOST = 0.5;
export const MAX_RECOMMENDATIONS = 20;

export interface FeedbackRow {
  tmdb_id: number;
  is_favorite: boolean;
  sentiment: Sentiment | null;
  rating: number | null;
  updated_at: string;
  title_cache: Pick<CatalogTitle, "media_type" | "genres"> | null;
}

export interface Seed {
  tmdbId: number;
  mediaType: CatalogTitle["media_type"];
  genreIds: number[];
}

export interface RecommendedTitle extends CatalogTitle {
  /** "seeds": picked from the viewer's likes; "trending": cold-start/top-up filler. */
  source: "seeds" | "trending";
}

export interface Recommendations {
  /** Whether the viewer has any seeds (favorite, like, or rating >= 7). */
  hasSeeds: boolean;
  /** At least one seed's TMDB lookup failed, so picks may be missing (an outage, not a catalog gap). */
  seedLookupsFailed: boolean;
  /** Seed-based picks first, then trending titles up to the limit. */
  titles: RecommendedTitle[];
}

/** A favorite, a like, or a high rating: the signal recommendations start from. */
export function isSeed(row: FeedbackRow): boolean {
  return (
    row.is_favorite ||
    row.sentiment === "like" ||
    (row.rating !== null && row.rating >= SEED_MIN_RATING)
  );
}

/**
 * Whether the viewer has said anything about a title. Those titles are never
 * recommended: favorites/likes are already known, dislikes and low ratings are
 * unwanted. An all-empty row (every field cleared) doesn't count.
 */
export function hasOpinion(row: FeedbackRow): boolean {
  return row.is_favorite || row.sentiment !== null || row.rating !== null;
}

/** The most recently updated seeds, newest first, at most MAX_SEEDS. */
export function pickSeeds(rows: FeedbackRow[]): Seed[] {
  return (
    rows
      .filter((row) => row.title_cache && isSeed(row))
      // Parsed, not string-compared: Postgres trims trailing zeros from
      // fractional seconds, so the strings don't all have the same shape.
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
      .slice(0, MAX_SEEDS)
      .map((row) => ({
        tmdbId: row.tmdb_id,
        mediaType: row.title_cache!.media_type,
        genreIds: (row.title_cache!.genres ?? []).map((g) => g.id),
      }))
  );
}

function candidateKey(mediaType: string, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

/**
 * Ranks catalog titles by how many seeds TMDB relates them to, plus a small
 * boost for the share of their genres the seeds also have. `related[i]` is
 * seed i's related ids (same media type as the seed), or null if that lookup
 * failed. Titles not related to any seed, or in `excluded`, are dropped.
 */
export function scoreCandidates(
  seeds: Seed[],
  related: (number[] | null)[],
  catalog: CatalogTitle[],
  excluded: ReadonlySet<number>,
): CatalogTitle[] {
  // TMDB ids are only unique per media type, so candidates key on both.
  const seedCounts = new Map<string, number>();
  seeds.forEach((seed, i) => {
    for (const id of new Set(related[i] ?? [])) {
      const key = candidateKey(seed.mediaType, id);
      seedCounts.set(key, (seedCounts.get(key) ?? 0) + 1);
    }
  });
  const seedGenres = new Set(seeds.flatMap((seed) => seed.genreIds));

  const scored = catalog.flatMap((title) => {
    const count = seedCounts.get(candidateKey(title.media_type, title.tmdb_id));
    if (!count || excluded.has(title.tmdb_id)) return [];
    const genres = title.genres ?? [];
    const overlap =
      genres.length === 0
        ? 0
        : genres.filter((g) => seedGenres.has(g.id)).length / genres.length;
    return [{ title, score: count + GENRE_BOOST * overlap }];
  });

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.title.popularity ?? 0) - (a.title.popularity ?? 0) ||
        a.title.tmdb_id - b.title.tmdb_id,
    )
    .map(({ title }) => title);
}

// Matches PostgREST's default max-rows, so a short page means the last one.
export const USER_ROWS_PAGE_SIZE = 1000;

// All of a viewer's rows from one table, a page at a time, so a long history
// can't be silently cut off at PostgREST's max-rows cap. `order` must be a
// total order for pages not to overlap.
async function selectAllUserRows<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  userId: string,
  order: string[],
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += USER_ROWS_PAGE_SIZE) {
    let query = supabase.from(table).select(columns).eq("user_id", userId);
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(
      from,
      from + USER_ROWS_PAGE_SIZE - 1,
    );
    if (error)
      throw new Error(
        `getRecommendations: ${table} read failed: ${error.message}`,
      );
    rows.push(...(data as unknown as T[]));
    if (data.length < USER_ROWS_PAGE_SIZE) return rows;
  }
}

function getFeedbackRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<FeedbackRow[]> {
  return selectAllUserRows<FeedbackRow>(
    supabase,
    "user_title_feedback",
    "tmdb_id,is_favorite,sentiment,rating,updated_at,title_cache(media_type,genres)",
    userId,
    ["tmdb_id"],
  );
}

async function getWatchlistIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<number[]> {
  const rows = await selectAllUserRows<{ tmdb_id: number }>(
    supabase,
    "user_watchlist",
    "tmdb_id",
    userId,
    ["tmdb_id"],
  );
  return rows.map((row) => row.tmdb_id);
}

async function recommendFromSeeds(
  seeds: Seed[],
  excluded: ReadonlySet<number>,
): Promise<{ titles: CatalogTitle[]; anyFailed: boolean }> {
  // One seed's TMDB failure shouldn't cost the viewer the rest.
  const lookups = await Promise.allSettled(
    seeds.map((seed) => getRelatedTmdbIds(seed.mediaType, seed.tmdbId)),
  );
  const related = lookups.map((lookup) => {
    if (lookup.status === "fulfilled") return lookup.value;
    console.error(lookup.reason);
    return null;
  });

  const anyFailed = related.some((ids) => ids === null);

  const candidateIds = related
    .flatMap((ids) => ids ?? [])
    .filter((id) => !excluded.has(id));
  if (candidateIds.length === 0) return { titles: [], anyFailed };

  return {
    titles: scoreCandidates(
      seeds,
      related,
      await getCatalogTitlesByIds(candidateIds),
      excluded,
    ),
    anyFailed,
  };
}

function withSource(
  titles: CatalogTitle[],
  source: RecommendedTitle["source"],
): RecommendedTitle[] {
  return titles.map((title) => ({ ...title, source }));
}

/** A signed-in viewer, with a client that reads their rows under RLS. */
export interface Viewer {
  supabase: SupabaseClient;
  userId: string;
}

/**
 * Up to `limit` titles for the viewer. Signed out (`viewer` null) or without
 * seeds, that's the trending list; otherwise seed-based picks, topped up with
 * trending titles when the catalog carries too few of TMDB's suggestions.
 * Titles the viewer has an opinion on or has watchlisted are always excluded.
 */
export async function getRecommendations(
  viewer: Viewer | null,
  limit: number = MAX_RECOMMENDATIONS,
): Promise<Recommendations> {
  if (!viewer)
    return {
      hasSeeds: false,
      seedLookupsFailed: false,
      titles: withSource(await getTrendingTitles(limit), "trending"),
    };

  const [feedback, watchlist] = await Promise.all([
    getFeedbackRows(viewer.supabase, viewer.userId),
    getWatchlistIds(viewer.supabase, viewer.userId),
  ]);
  const excluded = new Set([
    ...feedback.filter(hasOpinion).map((row) => row.tmdb_id),
    ...watchlist,
  ]);
  const seeds = pickSeeds(feedback);

  // Trending runs alongside the TMDB lookups instead of after them. `limit`
  // non-excluded titles always leave enough once picks are removed, since
  // there are at most `limit` picks.
  const [fromSeeds, trending] = await Promise.all([
    seeds.length > 0
      ? recommendFromSeeds(seeds, excluded)
      : Promise.resolve({ titles: [], anyFailed: false }),
    getTrendingTitles(limit, excluded),
  ]);
  const picks = fromSeeds.titles.slice(0, limit);
  const pickIds = new Set(picks.map((title) => title.tmdb_id));
  const filler = trending
    .filter((title) => !pickIds.has(title.tmdb_id))
    .slice(0, limit - picks.length);

  return {
    hasSeeds: feedback.some(isSeed),
    seedLookupsFailed: fromSeeds.anyFailed,
    titles: [...withSource(picks, "seeds"), ...withSource(filler, "trending")],
  };
}

/** `?limit=` for the API: a whole number clamped to 1..MAX_RECOMMENDATIONS. */
export function parseLimit(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return MAX_RECOMMENDATIONS;
  return Math.min(Math.max(Number(value), 1), MAX_RECOMMENDATIONS);
}

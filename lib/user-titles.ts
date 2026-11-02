import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogRow } from "./catalog";
import { chunkIds } from "./id-chunks";

export type Sentiment = "like" | "dislike";

// One viewer's combined user_title_feedback + user_watchlist state for a title.
export interface TitleUserState {
  isFavorite: boolean;
  sentiment: Sentiment | null;
  rating: number | null;
  inWatchlist: boolean;
}

export const EMPTY_TITLE_STATE: TitleUserState = {
  isFavorite: false,
  sentiment: null,
  rating: null,
  inWatchlist: false,
};

// The fields a title card renders — available from both v_catalog and an
// embedded title_cache row, so My List can reuse the browse page's card.
export type TitleSummary = Pick<
  CatalogRow,
  "tmdb_id" | "title" | "poster_path" | "release_date" | "media_type"
>;

const TITLE_SUMMARY_EMBED =
  "title_cache(tmdb_id,title,poster_path,release_date,media_type)";

export const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Clicking the active sentiment clears it; clicking the other one switches. */
export function nextSentiment(
  current: Sentiment | null,
  clicked: Sentiment,
): Sentiment | null {
  return current === clicked ? null : clicked;
}

/** A rating <select>'s value: "" clears the rating, anything off-scale is rejected. */
export function parseRating(value: string): number | null {
  const rating = Number(value);
  return RATING_VALUES.includes(rating) ? rating : null;
}

/** Stable key for a title's controls: changes whenever its saved state does. */
export function titleStateKey(tmdbId: number, state: TitleUserState): string {
  return [
    tmdbId,
    state.isFavorite,
    state.sentiment,
    state.rating,
    state.inWatchlist,
  ].join(":");
}

async function selectForIds<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  userId: string,
  tmdbIds: number[],
): Promise<T[]> {
  const results = await Promise.all(
    chunkIds(tmdbIds).map((chunk) =>
      supabase
        .from(table)
        .select(columns)
        .eq("user_id", userId)
        .in("tmdb_id", chunk),
    ),
  );

  return results.flatMap(({ data, error }) => {
    if (error) throw new Error(`getTitleStates failed: ${error.message}`);
    return data as T[];
  });
}

/** The viewer's state per title, keyed by tmdb_id; titles with no rows are absent. */
export async function getTitleStates(
  supabase: SupabaseClient,
  userId: string,
  tmdbIds: number[],
): Promise<Map<number, TitleUserState>> {
  const states = new Map<number, TitleUserState>();
  if (tmdbIds.length === 0) return states;

  const [feedback, watchlist] = await Promise.all([
    selectForIds<{
      tmdb_id: number;
      is_favorite: boolean;
      sentiment: Sentiment | null;
      rating: number | null;
    }>(
      supabase,
      "user_title_feedback",
      "tmdb_id,is_favorite,sentiment,rating",
      userId,
      tmdbIds,
    ),
    selectForIds<{ tmdb_id: number }>(
      supabase,
      "user_watchlist",
      "tmdb_id",
      userId,
      tmdbIds,
    ),
  ]);

  for (const row of feedback) {
    states.set(row.tmdb_id, {
      isFavorite: row.is_favorite,
      sentiment: row.sentiment,
      rating: row.rating,
      inWatchlist: false,
    });
  }
  for (const row of watchlist) {
    states.set(row.tmdb_id, {
      ...(states.get(row.tmdb_id) ?? EMPTY_TITLE_STATE),
      inWatchlist: true,
    });
  }
  return states;
}

// Upserts only the given columns, so setting one field never resets the
// others on an existing row. updated_at/favorited_at are set by a trigger
// (supabase/migrations/0006_feedback_timestamps.sql), not the client clock.
async function upsertFeedback(
  supabase: SupabaseClient,
  userId: string,
  tmdbId: number,
  fields: {
    is_favorite?: boolean;
    sentiment?: Sentiment | null;
    rating?: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("user_title_feedback")
    .upsert(
      { user_id: userId, tmdb_id: tmdbId, ...fields },
      { onConflict: "user_id,tmdb_id" },
    );
  if (error) throw new Error(`upsertFeedback failed: ${error.message}`);
}

export function setFavorite(
  supabase: SupabaseClient,
  userId: string,
  tmdbId: number,
  isFavorite: boolean,
): Promise<void> {
  return upsertFeedback(supabase, userId, tmdbId, { is_favorite: isFavorite });
}

export function setSentiment(
  supabase: SupabaseClient,
  userId: string,
  tmdbId: number,
  sentiment: Sentiment | null,
): Promise<void> {
  return upsertFeedback(supabase, userId, tmdbId, { sentiment });
}

export function setRating(
  supabase: SupabaseClient,
  userId: string,
  tmdbId: number,
  rating: number | null,
): Promise<void> {
  return upsertFeedback(supabase, userId, tmdbId, { rating });
}

export async function setInWatchlist(
  supabase: SupabaseClient,
  userId: string,
  tmdbId: number,
  inWatchlist: boolean,
): Promise<void> {
  const table = supabase.from("user_watchlist");
  // ignoreDuplicates: adding a title already on the list (e.g. from another
  // tab) is a no-op, and keeps its original created_at.
  const { error } = inWatchlist
    ? await table.upsert(
        { user_id: userId, tmdb_id: tmdbId },
        { onConflict: "user_id,tmdb_id", ignoreDuplicates: true },
      )
    : await table.delete().eq("user_id", userId).eq("tmdb_id", tmdbId);
  if (error) throw new Error(`setInWatchlist failed: ${error.message}`);
}

/** Watchlisted titles, most recently added first. */
export async function getWatchlistTitles(
  supabase: SupabaseClient,
  userId: string,
): Promise<TitleSummary[]> {
  const { data, error } = await supabase
    .from("user_watchlist")
    .select(TITLE_SUMMARY_EMBED)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getWatchlistTitles failed: ${error.message}`);
  return (data as unknown as { title_cache: TitleSummary }[]).map(
    (row) => row.title_cache,
  );
}

/** Favorited titles, most recently favorited first. */
export async function getFavoriteTitles(
  supabase: SupabaseClient,
  userId: string,
): Promise<TitleSummary[]> {
  const { data, error } = await supabase
    .from("user_title_feedback")
    .select(TITLE_SUMMARY_EMBED)
    .eq("user_id", userId)
    .eq("is_favorite", true)
    .order("favorited_at", { ascending: false });

  if (error) throw new Error(`getFavoriteTitles failed: ${error.message}`);
  return (data as unknown as { title_cache: TitleSummary }[]).map(
    (row) => row.title_cache,
  );
}

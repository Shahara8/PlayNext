import { createPublicClient } from "./supabase";
import type { MediaType } from "./title-ref";

// Mirrors public.search_titles()'s return row (supabase/migrations/0007_title_key_media_type.sql).
export interface SearchResultProvider {
  provider: string;
  availability_type: "subscription" | "rent" | "buy" | "free";
  watch_url: string | null;
}

export interface SearchResultRow {
  tmdb_id: number;
  media_type: MediaType;
  title: string;
  poster_path: string | null;
  release_date: string | null;
  vote_average: number | null;
  similarity: number;
  providers: SearchResultProvider[];
}

const RESULT_LIMIT = 20;

/** Typo-tolerant title search with live providers aggregated per result (search_titles RPC). */
export async function searchTitles(query: string): Promise<SearchResultRow[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("search_titles", {
    search_query: trimmed,
    result_limit: RESULT_LIMIT,
  });

  if (error) throw new Error(`searchTitles failed: ${error.message}`);
  return data as SearchResultRow[];
}

/** Lowercase, with accents, punctuation and spaces dropped. */
function normalizeForMatch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * Whether the search page should add "Showing closest matches": no result's
 * title contains the query, so every result came from typo tolerance. (Not
 * just the best match: the database ranks by trigram similarity, which can
 * put a short near-miss above a longer title that contains the query.)
 * Case, accents, punctuation and spaces don't count, so "spider man" matches
 * "Spider-Man" and "Spiderman". False for no results, or a query with
 * nothing to compare (only punctuation).
 */
export function showsClosestMatches(
  query: string,
  results: readonly Pick<SearchResultRow, "title">[],
): boolean {
  if (results.length === 0) return false;
  const q = normalizeForMatch(query);
  if (!q) return false;
  return !results.some((row) => normalizeForMatch(row.title).includes(q));
}

/**
 * The line above the results: "1 result for “q”", "12 results for “q”". At
 * the result limit there may be more, so it says "Top 20 results".
 */
export function resultsLine(count: number, query: string): string {
  const quoted = `“${query}”`;
  if (count >= RESULT_LIMIT) return `Top ${RESULT_LIMIT} results for ${quoted}`;
  return `${count} ${count === 1 ? "result" : "results"} for ${quoted}`;
}

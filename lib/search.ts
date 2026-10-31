import { createPublicClient } from "./supabase";

// Mirrors public.search_titles()'s return row (supabase/migrations/0001_user_data_and_views.sql).
export interface SearchResultProvider {
  provider: string;
  availability_type: "subscription" | "rent" | "buy" | "free";
  watch_url: string | null;
}

export interface SearchResultRow {
  tmdb_id: number;
  media_type: "movie" | "tv";
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

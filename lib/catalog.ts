import { createPublicClient } from "./supabase";
import { REGION } from "./providers";

// Mirrors public.v_catalog (supabase/migrations/0001_user_data_and_views.sql).
export interface CatalogRow {
  availability_id: number;
  provider: string;
  region: string;
  type: "movie" | "tv_series";
  availability_type: "subscription" | "rent" | "buy" | "free";
  watch_url: string | null;
  seasons_available: number[] | null;
  first_seen_date: string;
  last_verified: string | null;
  tmdb_id: number;
  media_type: "movie" | "tv";
  imdb_id: string | null;
  title: string;
  original_title: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  genres: { id: number; name: string }[] | null;
  vote_average: number | null;
  popularity: number | null;
}

/** Titles currently available on a given provider, trending-sorted (M3 adds real sort control). */
export async function getCatalogByProvider(
  providerCode: string,
): Promise<CatalogRow[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("v_catalog")
    .select("*")
    .eq("provider", providerCode)
    .eq("region", REGION)
    .order("popularity", { ascending: false, nullsFirst: false });

  if (error) throw new Error(`getCatalogByProvider failed: ${error.message}`);
  return data as CatalogRow[];
}

/** All live provider rows for one title (same tmdb_id can appear under multiple providers). */
export async function getCatalogByTmdbId(
  tmdbId: number,
): Promise<CatalogRow[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("v_catalog")
    .select("*")
    .eq("tmdb_id", tmdbId);

  if (error) throw new Error(`getCatalogByTmdbId failed: ${error.message}`);
  return data as CatalogRow[];
}

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

export type SortKey = "trending" | "newest" | "rating" | "alphabetical";

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Rating" },
  { value: "alphabetical", label: "A–Z" },
];

const SORT_COLUMNS: Record<SortKey, { column: string; ascending: boolean }> = {
  trending: { column: "popularity", ascending: false },
  newest: { column: "release_date", ascending: false },
  rating: { column: "vote_average", ascending: false },
  alphabetical: { column: "title", ascending: true },
};

export const TYPE_OPTIONS: { value: CatalogRow["type"]; label: string }[] = [
  { value: "movie", label: "Movies" },
  { value: "tv_series", label: "TV Series" },
];

export const AVAILABILITY_OPTIONS: {
  value: CatalogRow["availability_type"];
  label: string;
}[] = [
  { value: "subscription", label: "Subscription" },
  { value: "rent", label: "Rent" },
  { value: "buy", label: "Buy" },
  { value: "free", label: "Free" },
];

export interface CatalogFilters {
  type?: CatalogRow["type"];
  availabilityType?: CatalogRow["availability_type"];
  /** Genre name (as stored in title_cache.genres[].name), e.g. "Drama". */
  genre?: string;
}

/** Titles currently available on a given provider, sorted/filtered per `options`. */
export async function getCatalogByProvider(
  providerCode: string,
  options: { sort?: SortKey; filters?: CatalogFilters } = {},
): Promise<CatalogRow[]> {
  const { sort = "trending", filters = {} } = options;
  const supabase = createPublicClient();
  let query = supabase
    .from("v_catalog")
    .select("*")
    .eq("provider", providerCode)
    .eq("region", REGION);

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.availabilityType)
    query = query.eq("availability_type", filters.availabilityType);
  if (filters.genre)
    // Passed as a JSON string, not a JS array/object: supabase-js's .contains()
    // treats a JS array as a Postgres array literal (joins elements with `,`,
    // breaking on objects) rather than a jsonb array — a string is forwarded
    // as-is after the `cs.` operator, which is what a jsonb array needs here.
    query = query.contains("genres", JSON.stringify([{ name: filters.genre }]));

  const { column, ascending } = SORT_COLUMNS[sort];
  const { data, error } = await query.order(column, {
    ascending,
    nullsFirst: false,
  });

  if (error) throw new Error(`getCatalogByProvider failed: ${error.message}`);
  return data as CatalogRow[];
}

/** Distinct genre names available on a provider — populates the genre filter's options. */
export async function getProviderGenres(
  providerCode: string,
): Promise<string[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("v_catalog")
    .select("genres")
    .eq("provider", providerCode)
    .eq("region", REGION);

  if (error) throw new Error(`getProviderGenres failed: ${error.message}`);

  const names = new Set<string>();
  for (const row of data as {
    genres: { id: number; name: string }[] | null;
  }[]) {
    for (const g of row.genres ?? []) names.add(g.name);
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
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

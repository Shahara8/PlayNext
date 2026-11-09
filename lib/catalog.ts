import { createPublicClient } from "./supabase";
import { chunkIds } from "./id-chunks";
import { REGION } from "./providers";
import {
  idsByMediaType,
  titleKey,
  type MediaType,
  type TitleRef,
} from "./title-ref";

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
  media_type: MediaType;
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

export const DEFAULT_SORT: SortKey = "trending";

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

// The Type filter's options (the feed's labels, kept for stable URLs) to the
// TMDB media type they select. A Record, so a new label must be mapped here.
const TYPE_MEDIA_TYPES: Record<CatalogRow["type"], MediaType> = {
  movie: "movie",
  tv_series: "tv",
};

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
  const { sort = DEFAULT_SORT, filters = {} } = options;
  const supabase = createPublicClient();
  let query = supabase
    .from("v_catalog")
    .select("*")
    .eq("provider", providerCode)
    .eq("region", REGION);

  // On TMDB's media type, not the feed's `type` label: that's what the card
  // shows and links by, and the two can differ (migration 0007).
  if (filters.type)
    query = query.eq("media_type", TYPE_MEDIA_TYPES[filters.type]);
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

/** All live provider rows for one title (a title can be on several providers). */
export async function getCatalogByTitle(ref: TitleRef): Promise<CatalogRow[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("v_catalog")
    .select("*")
    .eq("media_type", ref.media_type)
    .eq("tmdb_id", ref.tmdb_id)
    // A stable order, so the page and its metadata list providers the same
    // way on every request.
    .order("provider")
    .order("availability_type");

  if (error) throw new Error(`getCatalogByTitle failed: ${error.message}`);
  return data as CatalogRow[];
}

// What recommendations need per title: enough to render a card, plus the
// fields scoring uses (genres for overlap, popularity for tie-breaks).
export type CatalogTitle = Pick<
  CatalogRow,
  | "tmdb_id"
  | "media_type"
  | "title"
  | "poster_path"
  | "release_date"
  | "genres"
  | "popularity"
  | "vote_average"
>;

const CATALOG_TITLE_COLUMNS =
  "tmdb_id,media_type,title,poster_path,release_date,genres,popularity,vote_average";

// Rows per page when walking v_catalog in trending order. Kept well below
// PostgREST's max-rows cap (1000 by default), so a short page reliably means
// the end of the catalog rather than a truncated response.
export const TRENDING_PAGE_SIZE = 100;

// v_catalog has one row per provider a title is on; callers want one per title.
// `seen` (title keys to skip) is updated in place, so it can carry across pages.
function uniqueTitles(
  rows: CatalogTitle[],
  seen: Set<string> = new Set(),
): CatalogTitle[] {
  return rows.filter((row) => {
    const key = titleKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The most popular titles across every provider (the browse page's
 * "Trending" order), skipping `excludeKeys` (see titleKey). Recommendations'
 * cold-start fallback and top-up.
 */
export async function getTrendingTitles(
  limit: number,
  excludeKeys: ReadonlySet<string> = new Set(),
): Promise<CatalogTitle[]> {
  const supabase = createPublicClient();
  const { column, ascending } = SORT_COLUMNS.trending;
  const seen = new Set(excludeKeys);
  const titles: CatalogTitle[] = [];

  // Pages until there are `limit` distinct titles, since how many rows that
  // takes depends on how many providers carry each title and on exclusions.
  for (let from = 0; titles.length < limit; from += TRENDING_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("v_catalog")
      .select(CATALOG_TITLE_COLUMNS)
      .eq("region", REGION)
      .order(column, { ascending, nullsFirst: false })
      // A total order, so pages never overlap or skip rows.
      .order("tmdb_id", { ascending: true })
      .order("availability_id", { ascending: true })
      .range(from, from + TRENDING_PAGE_SIZE - 1);

    if (error) throw new Error(`getTrendingTitles failed: ${error.message}`);
    titles.push(...uniqueTitles(data as CatalogTitle[], seen));
    if (data.length < TRENDING_PAGE_SIZE) break;
  }

  return titles.slice(0, limit);
}

/** The given titles that are currently available in the region, one row each. */
export async function getCatalogTitlesByRefs(
  refs: readonly TitleRef[],
): Promise<CatalogTitle[]> {
  const supabase = createPublicClient();
  const results = await Promise.all(
    idsByMediaType(refs).flatMap(([mediaType, ids]) =>
      chunkIds(ids).map((chunk) =>
        supabase
          .from("v_catalog")
          .select(CATALOG_TITLE_COLUMNS)
          .eq("region", REGION)
          .eq("media_type", mediaType)
          .in("tmdb_id", chunk),
      ),
    ),
  );

  return uniqueTitles(
    results.flatMap(({ data, error }) => {
      if (error)
        throw new Error(`getCatalogTitlesByRefs failed: ${error.message}`);
      return data as CatalogTitle[];
    }),
  );
}

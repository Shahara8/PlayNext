import { cacheLife } from "next/cache";
import { TmdbError, tmdbFetch } from "./tmdb";

interface TmdbListResponse {
  results: { id: number }[];
}

// Fewer /recommendations results than this and /similar is fetched too.
export const SPARSE_RECOMMENDATIONS = 10;

// One budget for a seed's whole lookup (both calls), since recommendations
// render on the page: a hung TMDB fails the seed rather than the page.
export const RELATED_TIMEOUT_MS = 5000;

/**
 * TMDB ids related to one title (same media type as the title): its
 * /recommendations, topped up with /similar when that list is sparse.
 * Cached for hours via `use cache` instead of a TTL table (docs/MVP.md
 * Section 6, step 7). Errors are never cached, so a title TMDB no longer
 * has (404) returns an empty list instead of failing on every view.
 */
export async function getRelatedTmdbIds(
  mediaType: "movie" | "tv",
  tmdbId: number,
): Promise<number[]> {
  "use cache";
  cacheLife("hours");

  const base = `/${mediaType}/${tmdbId}`;
  const signal = AbortSignal.timeout(RELATED_TIMEOUT_MS);
  try {
    const recommendations = await tmdbFetch<TmdbListResponse>(
      `${base}/recommendations`,
      {},
      signal,
    );
    const ids = recommendations.results.map((r) => r.id);
    if (ids.length >= SPARSE_RECOMMENDATIONS) return ids;

    const similar = await tmdbFetch<TmdbListResponse>(
      `${base}/similar`,
      {},
      signal,
    );
    return Array.from(new Set([...ids, ...similar.results.map((r) => r.id)]));
  } catch (error) {
    if (error instanceof TmdbError && error.status === 404) return [];
    throw error;
  }
}

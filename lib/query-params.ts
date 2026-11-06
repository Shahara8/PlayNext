/** First value of a Next.js searchParams entry (it's an array when a key repeats in the URL). */
export function firstSearchParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

// Postgres `integer`, title_cache.tmdb_id's type: a larger id would fail the
// query (a 500) instead of being not-found.
export const MAX_TMDB_ID = 2_147_483_647;

/**
 * A title URL's TMDB id segment (`/title/[media_type]/[tmdb_id]`, or the old
 * `/title/<id>` links) as an id, or null for anything else. Canonical digits
 * only (no "0x52b", "1.3e3" or "007"), so one title has one URL.
 */
export function parseTmdbId(raw: string): number | null {
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const tmdbId = Number(raw);
  return tmdbId <= MAX_TMDB_ID ? tmdbId : null;
}

/**
 * The path (optionally with a `?query`) after setting/clearing one param on top of
 * `currentSearch`, preserving every other param — shared by every client component
 * that persists its state in the URL query string (sort/filter selects, search input).
 */
export function withUpdatedParam(
  currentSearch: string,
  pathname: string,
  key: string,
  value: string,
): string {
  const params = new URLSearchParams(currentSearch);
  if (value) params.set(key, value);
  else params.delete(key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

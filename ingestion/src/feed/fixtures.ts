// Test fixtures for the feed schema and reader (not imported by app code).

export const FIXTURE_TODAY = "2026-11-06";

/** A valid row in docs/FEED_REQUIREMENTS.md's shape. */
export function feedRow(overrides: Record<string, unknown> = {}) {
  return {
    provider: "YES",
    region: "IL",
    title: "פאודה",
    original_title: "Fauda",
    type: "tv_series",
    release_year: 2015,
    imdb_id: "tt4565380",
    tmdb_id: 69557,
    match_source: "tmdb_search",
    availability_type: "subscription",
    watch_url: "https://www.yes.co.il/vod/fauda",
    seasons_available: [1, 2, 3, 4],
    added_date: null,
    removed_date: null,
    last_verified: FIXTURE_TODAY,
    ...overrides,
  };
}

// Old title links were /title/<tmdb_id>, before titles were keyed on media
// type too (supabase/migrations/0007_title_key_media_type.sql). Back then
// each id was one title; 0007 froze which in public.legacy_title_ids, and this
// is a copy of that table (it never changes), so the redirects are static
// next.config redirects: real HTTP 308s, query string kept, with no database
// on the request path. `npm run smoke` checks this copy still matches the DB.

import { titlePath, type MediaType } from "./title-ref";

export const LEGACY_TITLE_IDS: readonly (readonly [number, MediaType])[] = [
  [456, "tv"],
  [1396, "tv"],
  [51157, "tv"],
  [65494, "tv"],
  [66732, "tv"],
  [68595, "tv"],
  [69557, "tv"],
  [70796, "tv"],
  [71446, "tv"],
  [71912, "tv"],
  [73375, "tv"],
  [73586, "tv"],
  [76479, "tv"],
  [79720, "tv"],
  [82856, "tv"],
  [84773, "tv"],
  [84958, "tv"],
  [85271, "tv"],
  [91752, "tv"],
  [103913, "tv"],
  [109428, "movie"],
  [118357, "tv"],
  [119051, "tv"],
  [136315, "tv"],
  [299534, "movie"],
  [400617, "movie"],
  [512195, "movie"],
  [545609, "movie"],
  [568124, "movie"],
  [687163, "movie"],
  [858024, "movie"],
  [1289936, "movie"],
];

/**
 * next.config redirects for the old links. `permanent: true` is a 308. A
 * title no longer on any provider lands on its new URL's not-found, the same
 * answer its old URL gave.
 */
export function legacyTitleRedirects() {
  return LEGACY_TITLE_IDS.map(([tmdb_id, media_type]) => ({
    source: `/title/${tmdb_id}`,
    destination: titlePath({ media_type, tmdb_id }),
    permanent: true,
  }));
}

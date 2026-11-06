// A title's identity: TMDB ids are only unique per media type (movie 1396 and
// tv 1396 are different titles), so every title is keyed on both, matching
// title_cache's primary key (supabase/migrations/0007_title_key_media_type.sql).

import { parseTmdbId } from "./query-params";

export type MediaType = "movie" | "tv";

export const MEDIA_TYPES: readonly MediaType[] = ["movie", "tv"];

export interface TitleRef {
  media_type: MediaType;
  tmdb_id: number;
}

/** One string per title, for Map/Set keys and React keys: "movie:603". */
export function titleKey(ref: TitleRef): string {
  return `${ref.media_type}:${ref.tmdb_id}`;
}

/** The title page's path: /title/movie/603, /title/tv/1396 (TMDB's own shape). */
export function titlePath(ref: TitleRef): string {
  return `/title/${ref.media_type}/${ref.tmdb_id}`;
}

export function parseMediaType(raw: string): MediaType | null {
  return (MEDIA_TYPES as readonly string[]).includes(raw)
    ? (raw as MediaType)
    : null;
}

/** A `/title/[media_type]/[tmdb_id]` route's params as a ref, or null. */
export function parseTitleRef(
  mediaType: string,
  tmdbId: string,
): TitleRef | null {
  const media_type = parseMediaType(mediaType);
  const tmdb_id = parseTmdbId(tmdbId);
  return media_type && tmdb_id !== null ? { media_type, tmdb_id } : null;
}

/** Ids per media type (deduplicated), for `.eq("media_type").in("tmdb_id")` queries. */
export function idsByMediaType(
  refs: readonly TitleRef[],
): [MediaType, number[]][] {
  return MEDIA_TYPES.flatMap((mediaType) => {
    const ids = Array.from(
      new Set(
        refs.filter((r) => r.media_type === mediaType).map((r) => r.tmdb_id),
      ),
    );
    return ids.length > 0 ? [[mediaType, ids] as [MediaType, number[]]] : [];
  });
}

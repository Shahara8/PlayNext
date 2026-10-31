/** Four-digit release year from a `YYYY-MM-DD` date string, or null if unknown. */
export function releaseYear(releaseDate: string | null): string | null {
  return releaseDate ? releaseDate.slice(0, 4) : null;
}

/** Human-readable label for `title_cache.media_type`. */
export function mediaTypeLabel(mediaType: "movie" | "tv"): string {
  return mediaType === "tv" ? "TV Series" : "Movie";
}

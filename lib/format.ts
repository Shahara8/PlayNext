/** Four-digit release year from a `YYYY-MM-DD` date string, or null if unknown. */
export function releaseYear(releaseDate: string | null): string | null {
  return releaseDate ? releaseDate.slice(0, 4) : null;
}

/** "Title (year)", or just the title when the year is unknown. */
export function titleWithYear(title: {
  title: string;
  release_date: string | null;
}): string {
  const year = releaseYear(title.release_date);
  return year ? `${title.title} (${year})` : title.title;
}

/** Human-readable label for `title_cache.media_type`. */
export function mediaTypeLabel(mediaType: "movie" | "tv"): string {
  return mediaType === "tv" ? "TV Series" : "Movie";
}

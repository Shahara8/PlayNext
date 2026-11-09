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

/**
 * A TMDB vote average as shown on the ★ rating badge ("7.8"), or null when
 * there's nothing to show: unknown, or 0 (TMDB's value for a title nobody has
 * voted on yet, not a real score).
 */
export function ratingLabel(voteAverage: number | null): string | null {
  if (voteAverage == null || !Number.isFinite(voteAverage)) return null;
  const label = voteAverage.toFixed(1);
  return voteAverage > 0 && label !== "0.0" ? label : null;
}

/** "1 title", "1,234 titles"; "No titles yet" for none (a service tile). */
export function titleCountLabel(count: number): string {
  if (count === 0) return "No titles yet";
  return count === 1 ? "1 title" : `${count.toLocaleString("en-US")} titles`;
}

/**
 * A browse page's count: "8 titles" (titleCountLabel of the provider's whole
 * catalog, `total`) without filters, and "3 of 8 titles" with them, where
 * `shown` is the titles that match. The two come from separate reads, so
 * `total` is never shown below `shown`.
 */
export function browseCountLabel(
  shown: number,
  total: number,
  filtered: boolean,
): string {
  const all = Math.max(total, shown);
  if (!filtered) return titleCountLabel(all);
  const n = (count: number) => count.toLocaleString("en-US");
  return `${n(shown)} of ${n(all)} ${all === 1 ? "title" : "titles"}`;
}

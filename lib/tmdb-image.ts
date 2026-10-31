const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function posterUrl(
  posterPath: string | null,
  size: "w185" | "w342" | "w500" = "w342",
): string | null {
  return posterPath ? `${TMDB_IMAGE_BASE}/${size}${posterPath}` : null;
}

export function backdropUrl(
  backdropPath: string | null,
  size: "w780" | "w1280" = "w1280",
): string | null {
  return backdropPath ? `${TMDB_IMAGE_BASE}/${size}${backdropPath}` : null;
}

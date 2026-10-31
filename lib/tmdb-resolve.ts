// Shared imdb_id -> tmdb_id -> metadata resolver.
// Used by scripts/seed-mock-data.ts today; the real ingestion pipeline
// (docs/INGESTION.md Section 3) will import this same module so mock and
// real data go through one matching codepath that can never drift.

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export type FeedMediaType = "movie" | "tv_series";

export interface ResolvedTitle {
  tmdb_id: number;
  media_type: "movie" | "tv";
  imdb_id: string;
  title: string;
  original_title: string | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string | null;
  genres: { id: number; name: string }[];
  vote_average: number | null;
  popularity: number | null;
}

interface FindResponse {
  movie_results: { id: number }[];
  tv_results: { id: number }[];
}

interface MovieDetails {
  id: number;
  imdb_id: string | null;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genres: { id: number; name: string }[];
  vote_average: number;
  popularity: number;
}

interface TvDetails {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  genres: { id: number; name: string }[];
  vote_average: number;
  popularity: number;
  external_ids?: { imdb_id: string | null };
}

async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  // TMDB_API_KEY holds the v4 Read Access Token (a JWT), sent as a bearer
  // token — not the legacy v3 api_key query param.
  const token = process.env.TMDB_API_KEY;
  if (!token) throw new Error("TMDB_API_KEY is not set");

  const query = new URLSearchParams(params);
  const res = await fetch(`${TMDB_BASE_URL}${path}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `TMDB request failed: ${path} -> ${res.status} ${res.statusText}`,
    );
  }
  return res.json() as Promise<T>;
}

/**
 * Resolves an IMDb id to full TMDB metadata.
 * `expectedType`, when the caller already knows it (e.g. from a feed row),
 * disambiguates the rare id that matches both a movie_results and tv_results hit.
 * Returns null when TMDB has no match at all (orphan — caller decides how to record it).
 */
export async function resolveImdbToTmdb(
  imdbId: string,
  expectedType?: FeedMediaType,
): Promise<ResolvedTitle | null> {
  const found = await tmdbFetch<FindResponse>(`/find/${imdbId}`, {
    external_source: "imdb_id",
  });

  const preferMovie = expectedType !== "tv_series";
  const movieHit = found.movie_results[0];
  const tvHit = found.tv_results[0];

  let mediaType: "movie" | "tv";
  let tmdbId: number;
  if (preferMovie && movieHit) {
    mediaType = "movie";
    tmdbId = movieHit.id;
  } else if (!preferMovie && tvHit) {
    mediaType = "tv";
    tmdbId = tvHit.id;
  } else if (movieHit) {
    mediaType = "movie";
    tmdbId = movieHit.id;
  } else if (tvHit) {
    mediaType = "tv";
    tmdbId = tvHit.id;
  } else {
    return null;
  }

  if (mediaType === "movie") {
    const details = await tmdbFetch<MovieDetails>(`/movie/${tmdbId}`);
    return {
      tmdb_id: details.id,
      media_type: "movie",
      imdb_id: details.imdb_id ?? imdbId,
      title: details.title,
      original_title: details.original_title || null,
      overview: details.overview || null,
      poster_path: details.poster_path,
      backdrop_path: details.backdrop_path,
      release_date: details.release_date || null,
      genres: details.genres ?? [],
      vote_average: details.vote_average ?? null,
      popularity: details.popularity ?? null,
    };
  }

  const details = await tmdbFetch<TvDetails>(`/tv/${tmdbId}`, {
    append_to_response: "external_ids",
  });
  return {
    tmdb_id: details.id,
    media_type: "tv",
    imdb_id: details.external_ids?.imdb_id ?? imdbId,
    title: details.name,
    original_title: details.original_name || null,
    overview: details.overview || null,
    poster_path: details.poster_path,
    backdrop_path: details.backdrop_path,
    release_date: details.first_air_date || null,
    genres: details.genres ?? [],
    vote_average: details.vote_average ?? null,
    popularity: details.popularity ?? null,
  };
}

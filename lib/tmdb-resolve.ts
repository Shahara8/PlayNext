// Shared imdb_id -> tmdb_id -> metadata resolver.
// Used by scripts/seed-mock-data.ts and the ingestion pipeline
// (ingestion/src/tmdb/resolve.ts, docs/INGESTION.md Section 3), so mock and
// real data go through one matching codepath that can never drift.

import { tmdbFetch, type TmdbFetchOptions } from "./tmdb";
import type { MediaType, TitleRef } from "./title-ref";

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

/**
 * Resolves an IMDb id to full TMDB metadata.
 * `expectedType`, when the caller already knows it (e.g. from a feed row),
 * disambiguates the rare id that matches both a movie_results and tv_results hit.
 * Returns null when TMDB has no match at all (orphan — caller decides how to record it).
 */
export async function resolveImdbToTmdb(
  imdbId: string,
  expectedType?: FeedMediaType,
  options?: TmdbFetchOptions,
): Promise<ResolvedTitle | null> {
  const found = await tmdbFetch<FindResponse>(
    `/find/${imdbId}`,
    { external_source: "imdb_id" },
    options,
  );

  const preferMovie = expectedType !== "tv_series";
  const movieHit = found.movie_results[0];
  const tvHit = found.tv_results[0];

  let mediaType: MediaType;
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

  return fetchTitleDetails(
    { media_type: mediaType, tmdb_id: tmdbId },
    imdbId,
    options,
  );
}

/**
 * A known TMDB title's current metadata, by its key: the ingestion
 * pipeline's ~7-day title_cache refresh (no /find needed). `imdbId` fills in
 * when TMDB's details lack one (null or ""), so a refresh never blanks a stored id.
 */
export async function fetchTitleDetails(
  ref: TitleRef,
  imdbId: string,
  options?: TmdbFetchOptions,
): Promise<ResolvedTitle> {
  if (ref.media_type === "movie") {
    const details = await tmdbFetch<MovieDetails>(
      `/movie/${ref.tmdb_id}`,
      {},
      options,
    );
    return {
      tmdb_id: details.id,
      media_type: "movie",
      imdb_id: details.imdb_id || imdbId,
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

  const details = await tmdbFetch<TvDetails>(
    `/tv/${ref.tmdb_id}`,
    { append_to_response: "external_ids" },
    options,
  );
  return {
    tmdb_id: details.id,
    media_type: "tv",
    imdb_id: details.external_ids?.imdb_id || imdbId,
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

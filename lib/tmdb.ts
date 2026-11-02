// Shared TMDB API client: used by lib/tmdb-resolve.ts (seed/ingestion) and
// lib/tmdb-related.ts (recommendations).

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export class TmdbError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TmdbError";
  }
}

export async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
  // Callers on a page's render path pass one (e.g. AbortSignal.timeout) so a
  // hung TMDB request fails instead of holding the page; batch jobs don't.
  signal?: AbortSignal,
): Promise<T> {
  // TMDB_API_KEY holds the v4 Read Access Token (a JWT), sent as a bearer
  // token — not the legacy v3 api_key query param.
  const token = process.env.TMDB_API_KEY;
  if (!token) throw new Error("TMDB_API_KEY is not set");

  const query = new URLSearchParams(params);
  const res = await fetch(`${TMDB_BASE_URL}${path}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new TmdbError(
      `TMDB request failed: ${path} -> ${res.status} ${res.statusText}`,
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

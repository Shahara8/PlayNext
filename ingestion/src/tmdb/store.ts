// The resolution cache in Supabase: imdb_tmdb_map (service role only,
// migration 0008) and title_cache. The pipeline runs with the service key.

import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkIds } from "../../../lib/id-chunks";
import { inPool } from "../../../lib/in-pool";
import {
  idsByMediaType,
  titleKey,
  type TitleRef,
} from "../../../lib/title-ref";
import type { ResolvedTitle } from "../../../lib/tmdb-resolve";
import {
  TitleConflictError,
  type MapEntry,
  type ResolutionStore,
} from "./resolve";

const MAP_COLUMNS =
  "imdb_id, media_type, tmdb_id, resolution_status, last_attempted_at, attempt_count";

/** Chunk queries in flight at once. */
export const READ_CONCURRENCY = 4;

const UNIQUE_VIOLATION = "23505";

/** A title's metadata columns: everything but its key and imdb_id. */
function metadataOf(title: ResolvedTitle) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { imdb_id, media_type, tmdb_id, ...metadata } = title;
  return metadata;
}

export function supabaseResolutionStore(
  supabase: SupabaseClient,
): ResolutionStore {
  /** Updates one title_cache row by key; whether the row exists. */
  const updateTitle = async (
    ref: TitleRef,
    values: Record<string, unknown>,
    what: string,
  ): Promise<boolean> => {
    const { data, error } = await supabase
      .from("title_cache")
      .update(values)
      .eq("media_type", ref.media_type)
      .eq("tmdb_id", ref.tmdb_id)
      .select("tmdb_id");
    if (error)
      throw new Error(
        `title_cache ${what} failed (${titleKey(ref)}): ${error.message}`,
      );
    return (data ?? []).length > 0;
  };

  /** Each chunk's query, a few at a time: bounded load on PostgREST. */
  const inChunks = async <T, R>(
    chunks: T[],
    query: (chunk: T) => Promise<R[]>,
  ): Promise<R[]> => {
    const results: R[][] = [];
    await inPool(chunks, READ_CONCURRENCY, async (chunk, i) => {
      results[i] = await query(chunk);
    });
    return results.flat();
  };

  /** A row the caller knows exists (it holds a resolved key): else an error. */
  const updateExisting = async (
    ref: TitleRef,
    values: Record<string, unknown>,
    what: string,
  ) => {
    if (!(await updateTitle(ref, values, what)))
      throw new Error(`title_cache ${what} found no row (${titleKey(ref)})`);
  };

  return {
    async loadMapEntries(imdbIds) {
      return inChunks(chunkIds(imdbIds), async (chunk) => {
        const { data, error } = await supabase
          .from("imdb_tmdb_map")
          .select(MAP_COLUMNS)
          .in("imdb_id", chunk);
        if (error)
          throw new Error(`imdb_tmdb_map read failed: ${error.message}`);
        return (data ?? []) as MapEntry[];
      });
    },

    async loadRefreshTimes(refs) {
      const chunks = idsByMediaType(refs).flatMap(([mediaType, ids]) =>
        chunkIds(ids).map((chunk) => ({ mediaType, chunk })),
      );
      return inChunks(chunks, async ({ mediaType, chunk }) => {
        const { data, error } = await supabase
          .from("title_cache")
          .select("tmdb_id, last_refreshed_at")
          .eq("media_type", mediaType)
          .in("tmdb_id", chunk);
        if (error) throw new Error(`title_cache read failed: ${error.message}`);
        return (
          (data ?? []) as { tmdb_id: number; last_refreshed_at: string }[]
        ).map((row) => ({
          ref: { media_type: mediaType, tmdb_id: row.tmdb_id },
          last_refreshed_at: row.last_refreshed_at,
        }));
      });
    },

    async saveTitle(title: ResolvedTitle, refreshedAt: string) {
      // A new key (the usual case) is one insert.
      const { error } = await supabase
        .from("title_cache")
        .insert({ ...title, last_refreshed_at: refreshedAt });
      if (!error) return;
      const message = `title_cache insert failed (${titleKey(title)}): ${error.message}`;
      if (error.code !== UNIQUE_VIOLATION) throw new Error(message);
      // A unique violation: the key is stored already (a second IMDb id for
      // one TMDB title, or a parallel lookup that just inserted it), so its
      // metadata is updated and it keeps the imdb_id it has; or no row has
      // this key, and another title holds the imdb_id.
      const values = { ...metadataOf(title), last_refreshed_at: refreshedAt };
      if (await updateTitle(title, values, "update")) return;
      throw /imdb_id/.test(`${error.message} ${error.details ?? ""}`)
        ? new TitleConflictError(message)
        : new Error(message);
    },

    async refreshTitle(title: ResolvedTitle, refreshedAt: string) {
      // Metadata only: the row's imdb_id stays as first stored, so a refresh
      // can't clash with another title's.
      await updateExisting(
        title,
        { ...metadataOf(title), last_refreshed_at: refreshedAt },
        "refresh",
      );
    },

    async markRefreshed(ref: TitleRef, refreshedAt: string) {
      await updateExisting(ref, { last_refreshed_at: refreshedAt }, "stamp");
    },

    async saveMapEntry(entry: MapEntry) {
      const { error } = await supabase
        .from("imdb_tmdb_map")
        .upsert(entry, { onConflict: "imdb_id" });
      if (error)
        throw new Error(
          `imdb_tmdb_map upsert failed (${entry.imdb_id}): ${error.message}`,
        );
    },
  };
}

/** A title_cache row's names. */
export interface TitleNames {
  ref: TitleRef;
  title: string;
  original_title: string | null;
}

/**
 * title_cache's names for `refs` (rows that exist), for the wrong-id
 * safeguard (../pipeline/match-check.ts). Chunked like the other reads.
 */
export async function loadTitleNames(
  supabase: SupabaseClient,
  refs: readonly TitleRef[],
): Promise<TitleNames[]> {
  const chunks = idsByMediaType(refs).flatMap(([mediaType, ids]) =>
    chunkIds(ids).map((chunk) => ({ mediaType, chunk })),
  );
  const results: TitleNames[][] = [];
  await inPool(chunks, READ_CONCURRENCY, async ({ mediaType, chunk }, i) => {
    const { data, error } = await supabase
      .from("title_cache")
      .select("tmdb_id, title, original_title")
      .eq("media_type", mediaType)
      .in("tmdb_id", chunk);
    if (error) throw new Error(`title_cache read failed: ${error.message}`);
    results[i] = (
      (data ?? []) as {
        tmdb_id: number;
        title: string;
        original_title: string | null;
      }[]
    ).map((row) => ({
      ref: { media_type: mediaType, tmdb_id: row.tmdb_id },
      title: row.title,
      original_title: row.original_title,
    }));
  });
  return results.flat();
}

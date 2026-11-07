// The pipeline's writes for one provider's run (docs/INGESTION.md Section 4):
// its ingestion_runs row, the staging load, and the call to
// apply_ingestion_run (migration 0009), which does the upsert, the anti-join
// and the run's bookkeeping in one transaction. The pipeline runs with the
// service key; these tables and the function are service-role only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkIds } from "../../../lib/id-chunks";
import type { TitleRef } from "../../../lib/title-ref";
import type { MatchedFeedRow } from "../feed/read";

export type Coverage = "complete" | "partial";

/** A staged row: a matched feed row with its title key (withTitleKeys). */
export type StagingInput = MatchedFeedRow & {
  media_type: TitleRef["media_type"] | null;
  tmdb_id: number | null;
};

export interface NewRun {
  provider: string;
  region: string;
  /** The run's feed date, YYYY-MM-DD (UTC): last_seen_date for its rows. */
  run_date: string;
  coverage: Coverage | null;
  file_path: string | null;
  received_at: string | null;
}

/** Fields a run row is updated with as it goes. */
export interface RunUpdate {
  status?: "processing" | "completed" | "failed" | "rejected_suspicious";
  total_lines?: number;
  valid_lines?: number;
  invalid_lines?: number;
  unmatched_lines?: number;
  error_summary?: unknown;
  finished_at?: string;
}

/** apply_ingestion_run's result. */
export interface ApplyResult {
  staged: number;
  new: number;
  returned: number;
  /** Listed before and now, with a changed offer, link, title or seasons. */
  updated: number;
  unchanged: number;
  removed: number;
  /** Listed today on invalid lines: kept, last_seen_date moved to today. */
  kept_invalid: number;
  /** Whether missing rows were removed at once (a trusted complete run). */
  immediate_removals: boolean;
  /** Otherwise: rows last seen before this date were removed (null: none). */
  removal_cutoff: string | null;
}

export interface ApplyOptions {
  /** imdb_ids listed on today's invalid lines (FeedReadResult.invalidImdbIds). */
  listedImdbIds: readonly string[];
  /** False when some invalid line had no readable imdb_id. */
  trustMissing: boolean;
}

export interface IngestionStore {
  /**
   * Matched-row counts of the provider's `limit` latest completed runs of
   * this coverage, for the circuit breaker's baselineFrom.
   */
  recentRuns(
    provider: string,
    region: string,
    coverage: Coverage,
    limit: number,
  ): Promise<{ matched: number; finishedAt: string }[]>;
  /** Inserts the run as `processing`, started now (database clock); its id. */
  createRun(run: NewRun): Promise<number>;
  /**
   * Updates a run that is still `processing` (a finished run is left alone);
   * whether it was.
   */
  updateRun(runId: number, update: RunUpdate): Promise<boolean>;
  stageRows(
    runId: number,
    provider: string,
    region: string,
    rows: readonly StagingInput[],
  ): Promise<void>;
  /** Upsert + anti-join + `completed`, atomically (migration 0009). */
  applyRun(runId: number, options: ApplyOptions): Promise<ApplyResult>;
  /** Drops a run's staged rows (after a failure; apply clears its own). */
  clearStaging(runId: number): Promise<void>;
  /**
   * Marks runs still `processing` that started before `startedBefore` as
   * failed (the job died mid-run) and drops their staged rows; their ids.
   */
  abandonStaleRuns(startedBefore: string): Promise<number[]>;
}

/** The counts every apply_ingestion_run result carries. */
const COUNT_FIELDS = [
  "staged",
  "new",
  "returned",
  "updated",
  "unchanged",
  "removed",
  "kept_invalid",
] as const;

/** Staging rows per insert request. */
export const STAGING_CHUNK_SIZE = 500;

export function supabaseIngestionStore(
  supabase: SupabaseClient,
): IngestionStore {
  return {
    async recentRuns(provider, region, coverage, limit) {
      const { data, error } = await supabase
        .from("ingestion_runs")
        .select("valid_lines, unmatched_lines, finished_at")
        .eq("provider", provider)
        .eq("region", region)
        .eq("coverage", coverage)
        .eq("status", "completed")
        .not("finished_at", "is", null)
        .order("finished_at", { ascending: false })
        .limit(limit);
      if (error)
        throw new Error(`ingestion_runs read failed: ${error.message}`);
      return (
        (data ?? []) as {
          valid_lines: number | null;
          unmatched_lines: number | null;
          finished_at: string;
        }[]
      ).map((run) => ({
        matched: (run.valid_lines ?? 0) - (run.unmatched_lines ?? 0),
        finishedAt: run.finished_at,
      }));
    },

    async createRun(run) {
      const { data, error } = await supabase
        .from("ingestion_runs")
        // started_at: the column's default, the database's clock.
        .insert({ ...run, status: "processing" })
        .select("id")
        .single();
      if (error || !data)
        throw new Error(
          `ingestion_runs insert failed (${run.provider}): ${error?.message ?? "no row returned"}`,
        );
      return (data as { id: number }).id;
    },

    async updateRun(runId, update) {
      // Only while processing: if apply_ingestion_run committed but its reply
      // was lost, the caller's "failed" must not overwrite `completed`.
      const { data, error } = await supabase
        .from("ingestion_runs")
        .update(update)
        .eq("id", runId)
        .eq("status", "processing")
        .select("id");
      if (error)
        throw new Error(
          `ingestion_runs update failed (run ${runId}): ${error.message}`,
        );
      return (data ?? []).length > 0;
    },

    async stageRows(runId, provider, region, rows) {
      // Sequential chunks: one request in flight, and a failure stops the
      // load (the caller then clears what was staged).
      for (const rowChunk of chunkIds(rows, STAGING_CHUNK_SIZE)) {
        const chunk = rowChunk.map((row) => ({
          run_id: runId,
          provider,
          region,
          imdb_id: row.imdb_id,
          type: row.type,
          media_type: row.media_type,
          tmdb_id: row.tmdb_id,
          title: row.title,
          original_title: row.original_title ?? null,
          release_year: row.release_year ?? null,
          availability_type: row.availability_type,
          watch_url: row.watch_url ?? null,
          seasons_available: row.seasons_available ?? null,
          last_verified: row.last_verified,
        }));
        const { error } = await supabase
          .from("staging_availability")
          .insert(chunk);
        if (error)
          throw new Error(
            `staging_availability insert failed (run ${runId}): ${error.message}`,
          );
      }
    },

    async applyRun(runId, options) {
      const { data, error } = await supabase.rpc("apply_ingestion_run", {
        p_run_id: runId,
        p_listed_imdb_ids: options.listedImdbIds,
        p_trust_missing: options.trustMissing,
      });
      if (error)
        throw new Error(
          `apply_ingestion_run failed (run ${runId}): ${error.message}`,
        );
      const result = data as Record<string, unknown> | null;
      if (
        !result ||
        typeof result !== "object" ||
        !COUNT_FIELDS.every((field) => typeof result[field] === "number") ||
        typeof result.immediate_removals !== "boolean"
      )
        throw new Error(
          `apply_ingestion_run returned an unexpected result (run ${runId}): ${String(JSON.stringify(data)).slice(0, 200)}`,
        );
      return result as unknown as ApplyResult;
    },

    async clearStaging(runId) {
      const { error } = await supabase
        .from("staging_availability")
        .delete()
        .eq("run_id", runId);
      if (error)
        throw new Error(
          `staging_availability delete failed (run ${runId}): ${error.message}`,
        );
    },

    async abandonStaleRuns(startedBefore) {
      const { data, error } = await supabase
        .from("ingestion_runs")
        .select("id")
        .eq("status", "processing")
        .lt("started_at", startedBefore);
      if (error)
        throw new Error(`ingestion_runs sweep failed: ${error.message}`);
      const ids = ((data ?? []) as { id: number }[]).map((run) => run.id);
      if (ids.length === 0) return [];
      // Staging first: if marking them failed went first and this then
      // failed, no later sweep (processing runs only) would find the rows.
      const { error: deleteError } = await supabase
        .from("staging_availability")
        .delete()
        .in("run_id", ids);
      if (deleteError)
        throw new Error(
          `staging_availability sweep failed: ${deleteError.message}`,
        );
      const { data: marked, error: updateError } = await supabase
        .from("ingestion_runs")
        .update({
          status: "failed",
          error_summary: {
            error: "abandoned: still processing at a later run",
          },
          finished_at: new Date().toISOString(),
        })
        .in("id", ids)
        .eq("status", "processing")
        .select("id");
      if (updateError)
        throw new Error(`ingestion_runs sweep failed: ${updateError.message}`);
      // A run that finished in between isn't counted as abandoned.
      return ((marked ?? []) as { id: number }[]).map((run) => run.id);
    },
  };
}

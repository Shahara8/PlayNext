// One daily run over the collector's output (docs/INGESTION.md Sections 2-4):
// every provider in the manifest gets an ingestion_runs row; each file is
// validated and put through the circuit breaker; the accepted providers'
// rows are resolved against TMDB in one pass (resolveTitleKeys' refresh cap
// is per call, so per run); then each accepted provider is staged and applied
// on its own (apply_ingestion_run, atomic per provider).
//
// A rejected or failed provider never reaches the apply, so its
// provider_availability rows stay exactly as they were. One provider failing
// doesn't stop the others.

import { join } from "node:path";
import { REGION } from "../../../lib/providers";
import type { ApplyResult, IngestionStore, RunUpdate } from "../db/staging";
import { readFeedFile, type FeedReadResult } from "../feed/read";
import type { Manifest } from "../feed/schema";
import {
  LIVE_TMDB,
  resolveTitleKeys,
  withTitleKeys,
  type ResolutionResult,
  type ResolutionStore,
  type ResolveOptions,
  type TmdbLookups,
} from "../tmdb/resolve";
import {
  BASELINE_RUNS,
  baselineFrom,
  evaluateBreaker,
} from "./circuit-breaker";

export type ProviderOutcome =
  | {
      provider: string;
      runId: number;
      status: "completed";
      result: ApplyResult;
    }
  | {
      provider: string;
      runId: number;
      status: "rejected_suspicious";
      reason: string;
    }
  | {
      provider: string;
      /** Null when even the run row couldn't be written. */
      runId: number | null;
      status: "failed";
      error: string;
    };

export interface RunReport {
  /** Each manifest provider's outcome, in the manifest's order. */
  outcomes: ProviderOutcome[];
  /** Earlier runs found stuck in `processing` and marked failed. */
  abandonedRuns: number[];
  /** Why that sweep failed, if it did (the run goes on without it). */
  sweepError?: string;
}

export interface RunOptions {
  /** The folder holding the manifest's files. */
  dir: string;
  manifest: Manifest;
  /** The run's date, YYYY-MM-DD (UTC): validation's "today" and run_date. */
  today: string;
  /** When the files reached our storage (our clock), if known. */
  receivedAt?: string | null;
  /**
   * Where the files were archived (e.g. "raw-feeds/2026-11-07/030012345Z"):
   * each run's file_path is then `${archivePrefix}/${file}`, not the local
   * path, which is gone once the job ends. Null: archiving was meant to
   * happen and failed, so file_path is null. Left out: the local path.
   */
  archivePrefix?: string | null;
  /** The archived files' names: a file that failed to archive gets null. */
  archivedFiles?: readonly string[];
  /**
   * Providers this run is meant to cover. One the manifest leaves out gets a
   * failed run: otherwise its catalog would silently stop updating.
   */
  expectedProviders?: readonly string[];
  /**
   * Why the collector's manifest couldn't be used (the caller then passes an
   * empty one): each expected provider's failed run says so.
   */
  manifestError?: string;
  ingestion: IngestionStore;
  resolution: ResolutionStore;
  tmdb?: TmdbLookups;
  resolveOptions?: ResolveOptions;
  /** For finished_at stamps and the stale-run cutoff; tests pin it. */
  now?: () => Date;
}

/**
 * A run still `processing` this long after it started is dead: GitHub
 * Actions stops a job after 6 hours.
 */
export const STALE_RUN_HOURS = 6;

/** What error_summary records for a run (jsonb). */
interface RunSummary {
  /** The manifest's: "mock" marks a stand-in run (deleted at the cutover). */
  collector_version?: string | null;
  line_errors?: FeedReadResult["errors"];
  duplicates?: number;
  baseline?: number | null;
  /** Invalid lines with no readable imdb_id: removals then wait (grace rule). */
  unkeyed_invalid?: number;
  reason?: string;
  error?: string;
  /** Resolution covers the whole run (all providers); errors are this provider's. */
  resolution?: {
    stats: ResolutionResult["stats"];
    errors: ResolutionResult["errors"];
  };
}

interface Accepted {
  provider: string;
  runId: number;
  read: FeedReadResult;
  summary: RunSummary;
}

export async function processRun(options: RunOptions): Promise<RunReport> {
  const { manifest, today, ingestion } = options;
  /** On every run's error_summary: "mock" marks a stand-in run. */
  const collector_version = manifest.collector_version ?? null;
  const now = options.now ?? (() => new Date());
  const region = REGION;
  const missing = (options.expectedProviders ?? []).filter(
    (code, i, all) =>
      !Object.hasOwn(manifest.providers, code) && all.indexOf(code) === i,
  );
  const providers = [...Object.keys(manifest.providers), ...missing];
  /** Indexed like `providers`, so the report keeps the manifest's order. */
  const outcomes: ProviderOutcome[] = [];
  const accepted: Accepted[] = [];
  const record = (outcome: ProviderOutcome) => {
    outcomes[providers.indexOf(outcome.provider)] = outcome;
  };

  // A job that died mid-run left its run `processing` and maybe staged rows.
  // Housekeeping only: if it fails, today's run still goes ahead.
  let abandonedRuns: number[] = [];
  let sweepError: string | undefined;
  try {
    abandonedRuns = await ingestion.abandonStaleRuns(
      new Date(
        now().getTime() - STALE_RUN_HOURS * 60 * 60 * 1000,
      ).toISOString(),
    );
  } catch (error) {
    sweepError = errorMessage(error);
  }

  /** An update the run must take: one no longer processing is an error. */
  const mustUpdate = async (runId: number, update: RunUpdate) => {
    if (!(await ingestion.updateRun(runId, update)))
      throw new Error(`run ${runId} is no longer processing`);
  };

  /**
   * Marks a run failed (only while it's still processing, see
   * IngestionStore.updateRun), then drops its staged rows. In that order: an
   * apply the client gave up on may still be running, and it holds the run
   * row's lock, so the mark waits for it; clearing first could empty staging
   * under it. A failure here is added to the outcome's error, never thrown:
   * the other providers go on.
   */
  const fail = async (
    provider: string,
    runId: number | null,
    error: unknown,
    summary: RunSummary = {},
  ) => {
    let message = errorMessage(error);
    if (runId !== null) {
      let marked = false;
      try {
        marked = await ingestion.updateRun(runId, {
          status: "failed",
          error_summary: { collector_version, ...summary, error: message },
          finished_at: now().toISOString(),
        });
        if (!marked)
          message +=
            "; the run was no longer processing, so it may have completed (check ingestion_runs)";
      } catch (e) {
        message += `; marking the run failed also failed: ${errorMessage(e)}`;
      }
      // Only a run now marked failed: nothing can be applying it any more.
      if (marked)
        try {
          await ingestion.clearStaging(runId);
        } catch (e) {
          message += `; clearing staging also failed: ${errorMessage(e)}`;
        }
    }
    record({ provider, runId, status: "failed", error: message });
  };

  // An expected provider the manifest leaves out: recorded as failed.
  for (const provider of missing) {
    let runId: number | null = null;
    try {
      runId = await ingestion.createRun({
        provider,
        region,
        run_date: today,
        coverage: null,
        file_path: null,
        received_at: options.receivedAt ?? null,
      });
    } catch (error) {
      await fail(provider, null, error);
      continue;
    }
    await fail(
      provider,
      runId,
      options.manifestError
        ? `manifest.json unusable: ${options.manifestError}`
        : "missing from the collector's manifest",
    );
  }

  // 1. Validate each provider's file and judge it.
  for (const [provider, entry] of Object.entries(manifest.providers)) {
    const path = entry.status === "ok" ? join(options.dir, entry.file) : null;
    const storedPath =
      entry.status !== "ok" || options.archivePrefix === undefined
        ? path
        : options.archivePrefix !== null &&
            (options.archivedFiles?.includes(entry.file) ?? true)
          ? `${options.archivePrefix}/${entry.file}`
          : null;
    let runId: number | null = null;
    let summary: RunSummary = {};
    try {
      runId = await ingestion.createRun({
        provider,
        region,
        run_date: today,
        coverage: entry.status === "ok" ? entry.coverage : null,
        file_path: storedPath,
        // Only a file that did reach our storage has a receipt time.
        received_at:
          options.archivePrefix === undefined || storedPath !== null
            ? (options.receivedAt ?? null)
            : null,
      });
      if (entry.status !== "ok" || path === null) {
        await fail(
          provider,
          runId,
          `collector reported failure: ${(entry.status !== "ok" && entry.error) || "no error given"}`,
        );
        continue;
      }

      const read = await readFeedFile(path, { provider, today });
      const counts: RunUpdate = {
        total_lines: read.total,
        valid_lines: read.valid,
        invalid_lines: read.invalid,
        unmatched_lines: read.unmatched,
      };
      summary = {
        collector_version,
        line_errors: read.errors,
        duplicates: read.duplicates,
        unkeyed_invalid: read.unkeyedInvalid,
      };
      const baseline = baselineFrom(
        await ingestion.recentRuns(
          provider,
          region,
          entry.coverage,
          BASELINE_RUNS,
        ),
      );
      summary.baseline = baseline;
      const verdict = evaluateBreaker({
        total: read.total,
        valid: read.valid,
        invalid: read.invalid,
        matched: read.rows.length,
        baseline,
      });
      if (!verdict.ok) {
        await mustUpdate(runId, {
          ...counts,
          status: "rejected_suspicious",
          error_summary: { ...summary, reason: verdict.reason },
          finished_at: now().toISOString(),
        });
        record({
          provider,
          runId,
          status: "rejected_suspicious",
          reason: verdict.reason,
        });
        continue;
      }
      await mustUpdate(runId, { ...counts, error_summary: summary });
      accepted.push({ provider, runId, read, summary });
    } catch (error) {
      await fail(provider, runId, error, summary);
    }
  }

  // 2. One TMDB resolution pass over every accepted provider's rows. It only
  // throws when the database can't be read, and then nothing can be applied.
  let resolution: ResolutionResult | null = null;
  if (accepted.length > 0)
    try {
      resolution = await resolveTitleKeys(
        accepted.flatMap((a) => a.read.rows),
        options.resolution,
        options.tmdb ?? LIVE_TMDB,
        options.resolveOptions,
      );
    } catch (error) {
      for (const a of accepted)
        await fail(
          a.provider,
          a.runId,
          `title resolution failed: ${errorMessage(error)}`,
          a.summary,
        );
    }

  // 3. Stage and apply each accepted provider on its own.
  if (resolution)
    for (const a of accepted) {
      const ids = new Set(a.read.rows.map((row) => row.imdb_id));
      const summary: RunSummary = {
        ...a.summary,
        resolution: {
          stats: resolution.stats,
          errors: resolution.errors.filter((e) => ids.has(e.imdb_id)),
        },
      };
      try {
        await mustUpdate(a.runId, { error_summary: summary });
        await ingestion.stageRows(
          a.runId,
          a.provider,
          region,
          withTitleKeys(a.read.rows, resolution.keys),
        );
        const result = await ingestion.applyRun(a.runId, {
          listedImdbIds: a.read.invalidImdbIds,
          trustMissing: a.read.unkeyedInvalid === 0,
        });
        record({
          provider: a.provider,
          runId: a.runId,
          status: "completed",
          result,
        });
      } catch (error) {
        await fail(a.provider, a.runId, error, summary);
      }
    }

  return {
    outcomes: outcomes.filter(Boolean),
    abandonedRuns,
    ...(sweepError ? { sweepError } : {}),
  };
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

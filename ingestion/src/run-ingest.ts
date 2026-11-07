// The daily run's entry point (docs/INGESTION.md step 5):
//
//   npm run ingest -- --dir <collector output> [--expect YES,PARTNER_TV]
//                     [--today YYYY-MM-DD] [--no-archive]
//
// Validates the collector's manifest.json, archives the folder to the
// private raw-feeds bucket, runs processRun with the service key, prints one
// line per provider, and exits non-zero if anything wasn't completed, so the
// GitHub Action fails loudly (and emails) on a bad day.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TMDB_API_KEY
// (GitHub secrets in the Action; .env.local when run locally).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { archiveFolderFor, archiveRun, type ArchiveResult } from "./db/archive";
import { supabaseIngestionStore } from "./db/staging";
import {
  FEED_PROVIDER_CODES,
  manifestSchema,
  type Manifest,
} from "./feed/schema";
import { processRun, type RunReport } from "./pipeline/process-run";
import { supabaseResolutionStore } from "./tmdb/store";

export interface IngestArgs {
  dir: string;
  /** YYYY-MM-DD (UTC); today by default. */
  today: string;
  expect: string[];
  archive: boolean;
}

/** Parses the command line; throws a usage error on anything unexpected. */
export function parseArgs(
  argv: readonly string[],
  now = new Date(),
): IngestArgs {
  const args: IngestArgs = {
    dir: "",
    today: now.toISOString().slice(0, 10),
    expect: [],
    archive: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new Error(`${flag} needs a value`);
      return v;
    };
    if (flag === "--dir") args.dir = value();
    else if (flag === "--today") args.today = value();
    else if (flag === "--expect")
      args.expect = [
        ...new Set(
          value()
            .split(",")
            .map((code) => code.trim())
            .filter(Boolean),
        ),
      ];
    else if (flag === "--no-archive") args.archive = false;
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!args.dir) throw new Error("--dir is required");
  const day = new Date(`${args.today}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(args.today) ||
    Number.isNaN(day.getTime()) ||
    day.toISOString().slice(0, 10) !== args.today
  )
    throw new Error(
      `--today must be a real YYYY-MM-DD date, got ${args.today}`,
    );
  const unknown = args.expect.filter((c) => !FEED_PROVIDER_CODES.includes(c));
  if (unknown.length)
    throw new Error(`--expect: unknown ${unknown.join(", ")}`);
  return args;
}

/** One line per provider, plus the run-level problems. */
export function formatReport(report: RunReport, archiveError?: string): string {
  const lines = report.outcomes.map((o) => {
    if (o.status === "completed") {
      const r = o.result;
      const removals = r.immediate_removals
        ? "immediate"
        : `grace, cutoff ${r.removal_cutoff ?? "none"}`;
      return `${o.provider}: completed (run ${o.runId}) — ${r.staged} listed: ${r.new} new, ${r.returned} returned, ${r.updated} updated, ${r.unchanged} unchanged, ${r.removed} removed, ${r.kept_invalid} kept from invalid lines; removals ${removals}`;
    }
    if (o.status === "rejected_suspicious")
      return `${o.provider}: REJECTED (run ${o.runId}) — ${o.reason}`;
    return `${o.provider}: FAILED (run ${o.runId ?? "none"}) — ${o.error}`;
  });
  if (report.abandonedRuns.length)
    lines.push(`abandoned earlier runs: ${report.abandonedRuns.join(", ")}`);
  if (report.sweepError)
    lines.push(`stale-run sweep FAILED: ${report.sweepError}`);
  if (archiveError) lines.push(`archive FAILED: ${archiveError}`);
  if (report.outcomes.length === 0) lines.push("no providers in the manifest");
  return lines.join("\n");
}

/** 0 only when every provider completed and nothing else went wrong. */
export function exitCodeFor(report: RunReport, archiveError?: string): number {
  const allCompleted =
    report.outcomes.length > 0 &&
    report.outcomes.every((o) => o.status === "completed");
  return allCompleted && !report.sweepError && !archiveError ? 0 : 1;
}

/**
 * The collector's manifest, or an empty one and why it couldn't be used
 * (missing, not JSON, or failing manifestSchema).
 */
export function readManifest(dir: string): {
  manifest: Manifest;
  manifestError?: string;
} {
  const empty: Manifest = {
    generated_at: new Date().toISOString(),
    providers: {},
  };
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  } catch (error) {
    return {
      manifest: empty,
      manifestError: error instanceof Error ? error.message : String(error),
    };
  }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success)
    return { manifest: empty, manifestError: parsed.error.message };
  return { manifest: parsed.data };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main() {
  // Locally: .env.local (never overrides what the Action's env already set).
  const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url));
  if (existsSync(envFile)) config({ path: envFile, quiet: true });

  const args = parseArgs(process.argv.slice(2));
  requireEnv("TMDB_API_KEY");
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  // Archived first, before anything is validated: a bad day is kept too.
  let archive: ArchiveResult | null | undefined;
  let archiveError: string | undefined;
  /** Our clock: when the files reached our storage (null if they didn't). */
  let receivedAt: string | null = null;
  if (args.archive)
    try {
      archive = await archiveRun(
        supabase,
        args.dir,
        archiveFolderFor(new Date()),
      );
      if (archive.archived.length) receivedAt = new Date().toISOString();
      if (archive.errors.length) archiveError = archive.errors.join("; ");
    } catch (error) {
      // Loud (non-zero exit), but today's availability still updates.
      archive = null;
      archiveError = error instanceof Error ? error.message : String(error);
    }

  // An unusable manifest: nothing to process, but each expected provider
  // still gets a failed run saying why.
  const { manifest, manifestError } = readManifest(args.dir);

  const report = await processRun({
    dir: args.dir,
    manifest,
    today: args.today,
    receivedAt,
    manifestError,
    // undefined: not archiving (local paths); null: archiving failed.
    archivePrefix:
      archive === undefined ? undefined : (archive?.prefix ?? null),
    archivedFiles: archive?.archived,
    expectedProviders: args.expect,
    ingestion: supabaseIngestionStore(supabase),
    resolution: supabaseResolutionStore(supabase),
  });

  console.log(formatReport(report, archiveError));
  if (manifestError) console.log(`manifest.json unusable: ${manifestError}`);
  if (archive) console.log(`archived to ${archive.prefix}`);
  process.exitCode = manifestError ? 1 : exitCodeFor(report, archiveError);
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}

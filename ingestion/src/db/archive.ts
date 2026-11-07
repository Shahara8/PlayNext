// Keeps every run's raw collector output (docs/INGESTION.md Section 1): the
// manifest and each provider's file go to the private `raw-feeds` bucket
// under our own clock, before processing, so any day can be re-run or
// audited later.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

export const RAW_FEEDS_BUCKET = "raw-feeds";

/** "2026-11-07/030012345Z": one folder per run, by its UTC date and time (ms). */
export function archiveFolderFor(now: Date): string {
  const iso = now.toISOString(); // 2026-11-07T03:00:12.345Z
  return `${iso.slice(0, 10)}/${iso.slice(11, 23).replace(/[:.]/g, "")}Z`;
}

/**
 * What a collector output folder holds that's worth keeping: manifest.json
 * and every `<CODE>.jsonl`, whatever the manifest says (it's archived before
 * it's validated, so a bad day is kept too).
 */
export function filesToArchive(names: readonly string[]): string[] {
  return names
    .filter((n) => n === "manifest.json" || /^[A-Z0-9_]+\.jsonl$/.test(n))
    .sort((a, b) =>
      a === "manifest.json" ? -1 : b === "manifest.json" ? 1 : a < b ? -1 : 1,
    );
}

/** Creates the bucket (private) if it's missing; refuses a public one. */
async function ensurePrivateBucket(supabase: SupabaseClient) {
  const { data, error } = await supabase.storage.getBucket(RAW_FEEDS_BUCKET);
  if (data) {
    if (data.public)
      throw new Error(`storage bucket ${RAW_FEEDS_BUCKET} is public`);
    return;
  }
  // Only a bucket that's really missing is created; any other read error
  // (auth, network) is the error.
  if (error && !/not found/i.test(error.message))
    throw new Error(
      `storage bucket ${RAW_FEEDS_BUCKET} couldn't be read: ${error.message}`,
    );
  const { error: createError } = await supabase.storage.createBucket(
    RAW_FEEDS_BUCKET,
    { public: false },
  );
  if (createError)
    throw new Error(
      `storage bucket ${RAW_FEEDS_BUCKET} missing (${error?.message ?? "not found"}) and couldn't be created: ${createError.message}`,
    );
}

export interface ArchiveResult {
  /** "raw-feeds/<folder>": what the runs record their file_path under. */
  prefix: string;
  archived: string[];
  /** One message per file that couldn't be archived (the others still were). */
  errors: string[];
}

/**
 * Uploads the folder's files (filesToArchive) to `raw-feeds/<folder>/`, one
 * at a time, never overwriting: a folder is one run's. A file that fails is
 * reported and the rest still go up; only a bucket problem throws.
 */
export async function archiveRun(
  supabase: SupabaseClient,
  dir: string,
  folder: string,
): Promise<ArchiveResult> {
  await ensurePrivateBucket(supabase);
  const result: ArchiveResult = {
    prefix: `${RAW_FEEDS_BUCKET}/${folder}`,
    archived: [],
    errors: [],
  };
  for (const file of filesToArchive(await readdir(dir))) {
    try {
      const body = await readFile(join(dir, file));
      const { error } = await supabase.storage
        .from(RAW_FEEDS_BUCKET)
        .upload(`${folder}/${file}`, body, {
          contentType: file.endsWith(".json")
            ? "application/json"
            : "application/x-ndjson",
          upsert: false,
        });
      if (error) throw new Error(error.message);
      result.archived.push(file);
    } catch (error) {
      result.errors.push(
        `${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return result;
}

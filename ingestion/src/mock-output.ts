// A stand-in for the collector until Noam's branch is merged (docs/INGESTION.md
// step 5): writes data/mock-feed.jsonl's rows for the given providers in the
// collector's output format (docs/FEED_REQUIREMENTS.md 2.1), verified today.
//
//   npm run ingest:mock -- --out <dir> [--providers YES,PARTNER_TV]
//
// The rows are the ones already live (the mock seed), so running the
// pipeline on this output should report every title unchanged and nothing
// removed. It does write: the rows' source becomes "feed" and their
// last_seen_date/last_verified move to today, and the runs are recorded
// (collector_version "mock", so they can be deleted at the cutover).

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Manifest } from "./feed/schema";

export const MOCK_FEED_PATH = fileURLToPath(
  new URL("../../data/mock-feed.jsonl", import.meta.url),
);

/** The phase-1 providers (docs/FEED_REQUIREMENTS.md): the default. */
export const DEFAULT_MOCK_PROVIDERS = ["YES", "PARTNER_TV"];

/**
 * Collector-format output for `providers`: each provider's rows (one JSON
 * line each, last_verified set to `today`) and a manifest marking each
 * provider complete. A provider with no rows is left out of both.
 */
export function mockOutput(
  feedLines: readonly string[],
  providers: readonly string[],
  today: string,
  now: Date,
): { files: Record<string, string>; manifest: Manifest } {
  const byProvider = new Map<string, string[]>();
  for (const raw of feedLines) {
    const text = raw.trim();
    if (!text) continue;
    const row = JSON.parse(text) as { provider: string };
    if (!providers.includes(row.provider)) continue;
    const lines = byProvider.get(row.provider) ?? [];
    lines.push(JSON.stringify({ ...row, last_verified: today }));
    byProvider.set(row.provider, lines);
  }
  const files: Record<string, string> = {};
  const manifest: Manifest = {
    generated_at: now.toISOString(),
    collector_version: "mock",
    providers: {},
  };
  for (const [provider, lines] of byProvider) {
    const file = `${provider}.jsonl`;
    files[file] = `${lines.join("\n")}\n`;
    manifest.providers[provider] = {
      status: "ok",
      coverage: "complete",
      file,
      records: lines.length,
    };
  }
  return { files, manifest };
}

function main() {
  const argv = process.argv.slice(2);
  const valueOf = (flag: string) => {
    const i = argv.indexOf(flag);
    if (i < 0) return undefined;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--"))
      throw new Error(`${flag} needs a value`);
    return value;
  };
  const out = valueOf("--out");
  if (!out) throw new Error("--out is required");
  // The whole folder is archived: leftovers would join this run's files.
  if (existsSync(out) && readdirSync(out).length > 0)
    throw new Error(`--out ${out} isn't empty`);
  const providers = (valueOf("--providers") ?? DEFAULT_MOCK_PROVIDERS.join(","))
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const now = new Date();
  const { files, manifest } = mockOutput(
    readFileSync(MOCK_FEED_PATH, "utf8").split("\n"),
    providers,
    now.toISOString().slice(0, 10),
    now,
  );
  mkdirSync(out, { recursive: true });
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(out, name), content);
  writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(
    `wrote ${Object.keys(files).join(", ")} and manifest.json to ${out}`,
  );
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

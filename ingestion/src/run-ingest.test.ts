import type { ApplyResult } from "./db/staging";
import type { MatchWarning } from "./pipeline/match-check";
import type { RunReport } from "./pipeline/process-run";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  exitCodeFor,
  formatReport,
  parseArgs,
  readManifest,
} from "./run-ingest";

const NOW = new Date("2026-11-07T03:00:00Z");

const result: ApplyResult = {
  staged: 6,
  new: 1,
  returned: 0,
  updated: 2,
  unchanged: 3,
  removed: 1,
  kept_invalid: 0,
  immediate_removals: true,
  removal_cutoff: null,
};
const completed = (provider: string) => ({
  provider,
  runId: 1,
  status: "completed" as const,
  result,
  matchCheck: { warnings: [] as MatchWarning[], count: 0, unchecked: 0 },
});
const report = (
  outcomes: RunReport["outcomes"],
  extra: Partial<RunReport> = {},
): RunReport => ({ outcomes, abandonedRuns: [], ...extra });

describe("parseArgs", () => {
  it("reads every flag", () => {
    expect(
      parseArgs(
        [
          "--dir",
          "out",
          "--today",
          "2026-11-06",
          "--expect",
          "YES, PARTNER_TV,YES",
          "--no-archive",
        ],
        NOW,
      ),
    ).toEqual({
      dir: "out",
      today: "2026-11-06",
      expect: ["YES", "PARTNER_TV"],
      archive: false,
    });
  });

  it("defaults to today (UTC), archiving, nothing expected", () => {
    expect(parseArgs(["--dir", "out"], NOW)).toEqual({
      dir: "out",
      today: "2026-11-07",
      expect: [],
      archive: true,
    });
  });

  it.each([
    [[], /--dir is required/],
    [["--dir"], /--dir needs a value/],
    [["--dir", "--today"], /--dir needs a value/],
    [["--dir", "out", "--today", "7/11/2026"], /YYYY-MM-DD/],
    [["--dir", "out", "--today", "2026-02-30"], /real YYYY-MM-DD/],
    [["--dir", "out", "--today", "2026-13-01"], /real YYYY-MM-DD/],
    [["--dir", "out", "--expect", "YES,HBO"], /unknown HBO/],
    [["--dir", "out", "--force"], /unknown argument --force/],
  ])("refuses %j", (argv, message) => {
    expect(() => parseArgs(argv, NOW)).toThrow(message);
  });
});

describe("formatReport", () => {
  it("gives one line per provider, then run-level problems", () => {
    const text = formatReport(
      report(
        [
          completed("YES"),
          {
            provider: "PARTNER_TV",
            runId: 2,
            status: "rejected_suspicious",
            reason: "empty file",
          },
          {
            provider: "HOT",
            runId: null,
            status: "failed",
            error: "insert failed",
          },
        ],
        { abandonedRuns: [7], sweepError: "timeout" },
      ),
      "upload failed",
    );

    expect(text.split("\n")).toEqual([
      "YES: completed (run 1) — 6 listed: 1 new, 0 returned, 2 updated, 3 unchanged, 1 removed, 0 kept from invalid lines; removals immediate",
      "PARTNER_TV: REJECTED (run 2) — empty file",
      "HOT: FAILED (run none) — insert failed",
      "abandoned earlier runs: 7",
      "stale-run sweep FAILED: timeout",
      "archive FAILED: upload failed",
    ]);
  });

  it("says when removals waited", () => {
    const waited = {
      ...completed("YES"),
      result: {
        ...result,
        immediate_removals: false,
        removal_cutoff: "2026-11-01",
      },
    };
    expect(formatReport(report([waited]))).toMatch(
      /removals grace, cutoff 2026-11-01$/,
    );
  });

  it("lists suspicious matches under their provider", () => {
    const text = formatReport(
      report([
        {
          ...completed("YES"),
          matchCheck: {
            count: 52,
            unchecked: 1,
            error: "timeout",
            warnings: [
              {
                imdb_id: "tt5776858",
                feed_type: "tv_series",
                feed_title: "Shtisel",
                feed_original_title: "שטיסל",
                tmdb: {
                  media_type: "movie",
                  tmdb_id: 400617,
                  title: "Phantom Thread",
                  original_title: "Phantom Thread",
                },
              },
            ],
          },
        },
      ]),
    );
    expect(text.split("\n").slice(1)).toEqual([
      '  suspicious match: tt5776858 "Shtisel" (tv_series) is TMDB movie 400617 "Phantom Thread"',
      "  ...and 51 more suspicious matches (error_summary has the count)",
      "  1 type-mismatched titles couldn't be checked (no TMDB names)",
      "  wrong-id check FAILED, ids not checked: timeout",
    ]);
  });

  it("flags a manifest with no providers", () => {
    expect(formatReport(report([]))).toBe("no providers in the manifest");
  });
});

describe("exitCodeFor", () => {
  it("is 0 only when every provider completed and nothing else failed", () => {
    expect(
      exitCodeFor(report([completed("YES"), completed("PARTNER_TV")])),
    ).toBe(0);
  });

  it.each([
    [
      "a rejected provider",
      report([
        completed("YES"),
        {
          provider: "PARTNER_TV",
          runId: 2,
          status: "rejected_suspicious",
          reason: "x",
        },
      ]),
    ],
    [
      "a failed provider",
      report([{ provider: "YES", runId: 1, status: "failed", error: "x" }]),
    ],
    ["no providers", report([])],
    ["a sweep error", report([completed("YES")], { sweepError: "x" })],
  ])("is 1 with %s", (_name, r) => {
    expect(exitCodeFor(r)).toBe(1);
  });

  it("is 1 when archiving failed", () => {
    expect(exitCodeFor(report([completed("YES")]), "upload failed")).toBe(1);
  });
});

describe("readManifest", () => {
  const dir = mkdtempSync(join(tmpdir(), "playnext-manifest-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  it("returns a valid manifest", () => {
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({ generated_at: "2026-11-07T03:00:00Z", providers: {} }),
    );
    expect(readManifest(dir)).toEqual({
      manifest: { generated_at: "2026-11-07T03:00:00Z", providers: {} },
    });
  });

  it("reports a manifest that isn't JSON", () => {
    writeFileSync(join(dir, "manifest.json"), '{"generated_at":');
    const { manifest, manifestError } = readManifest(dir);
    expect(manifest.providers).toEqual({});
    expect(manifestError).toMatch(/JSON/);
  });

  it("reports a manifest that fails the schema", () => {
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({ providers: {} }),
    );
    expect(readManifest(dir).manifestError).toMatch(/generated_at/);
  });

  it("reports a missing manifest", () => {
    expect(readManifest(join(dir, "nope")).manifestError).toMatch(/ENOENT/);
  });
});

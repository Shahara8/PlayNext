import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type {
  ApplyOptions,
  ApplyResult,
  IngestionStore,
  NewRun,
  RunUpdate,
  StagingInput,
} from "../db/staging";
import { feedRow, FIXTURE_TODAY } from "../feed/fixtures";
import type { Manifest } from "../feed/schema";
import type { MapEntry, ResolutionStore, TmdbLookups } from "../tmdb/resolve";
import type { TitleRef } from "../../../lib/title-ref";
import { BASELINE_RUNS } from "./circuit-breaker";
import { processRun, STALE_RUN_HOURS } from "./process-run";

const NOW = new Date(`${FIXTURE_TODAY}T03:00:00Z`);

const dir = mkdtempSync(join(tmpdir(), "playnext-run-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let fileCounter = 0;
/** Writes rows as a JSONL file in its own folder; returns the folder. */
function feedDir(files: Record<string, unknown[]>): string {
  const folder = join(dir, String(fileCounter++));
  mkdirSync(folder);
  for (const [name, rows] of Object.entries(files))
    writeFileSync(
      join(folder, name),
      rows
        .map((row) => (typeof row === "string" ? row : JSON.stringify(row)))
        .join("\n"),
    );
  return folder;
}

const yesRows = [
  feedRow({
    imdb_id: "tt0000001",
    title: "A",
    type: "movie",
    seasons_available: null,
  }),
  feedRow({ imdb_id: "tt0000002", title: "B" }),
];
const partnerRows = [
  feedRow({ provider: "PARTNER_TV", imdb_id: "tt0000002", title: "B" }),
  feedRow({ provider: "PARTNER_TV", imdb_id: "tt0000003", title: "C" }),
];

const ok = (code: string, coverage: "complete" | "partial" = "complete") => ({
  status: "ok" as const,
  coverage,
  file: `${code}.jsonl`,
  records: 2,
});
const manifest = (providers: Manifest["providers"]): Manifest => ({
  generated_at: NOW.toISOString(),
  providers,
});

interface Run extends NewRun, RunUpdate {
  id: number;
  status: NonNullable<RunUpdate["status"]>;
}

/** ingestion_runs + staging in memory; apply reports what was staged. */
function memoryIngestion() {
  const runs = new Map<number, Run>();
  const staged = new Map<number, StagingInput[]>();
  let nextId = 1;
  const store = {
    runs,
    staged,
    recentRuns: vi.fn(
      async () => [] as { matched: number; finishedAt: string }[],
    ),
    createRun: vi.fn(async (run: NewRun) => {
      const id = nextId++;
      runs.set(id, { ...run, id, status: "processing" });
      return id;
    }),
    updateRun: vi.fn(async (id: number, update: RunUpdate) => {
      const run = runs.get(id)!;
      if (run.status !== "processing") return false;
      runs.set(id, { ...run, ...update });
      return true;
    }),
    stageRows: vi.fn(
      async (
        id: number,
        _p: string,
        _r: string,
        rows: readonly StagingInput[],
      ) => {
        staged.set(id, [...(staged.get(id) ?? []), ...rows]);
      },
    ),
    // The options are asserted through mock.calls.
    applyRun: vi.fn(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async (id: number, _options: ApplyOptions): Promise<ApplyResult> => {
        const rows = staged.get(id) ?? [];
        staged.delete(id);
        runs.set(id, { ...runs.get(id)!, status: "completed" });
        return {
          staged: rows.length,
          new: rows.length,
          returned: 0,
          updated: 0,
          unchanged: 0,
          removed: 0,
          kept_invalid: 0,
          immediate_removals: true,
          removal_cutoff: null,
        };
      },
    ),
    clearStaging: vi.fn(async (id: number) => {
      staged.delete(id);
    }),
    abandonStaleRuns: vi.fn(async () => [] as number[]),
  } satisfies IngestionStore & Record<string, unknown>;
  return store;
}

/** Every id resolved to a movie key whose title_cache row is fresh. */
function resolvedCache(): ResolutionStore & {
  loadMapEntries: ReturnType<typeof vi.fn>;
} {
  return {
    loadMapEntries: vi.fn(async (ids: readonly string[]) =>
      ids.map((imdb_id): MapEntry => ({
        imdb_id,
        media_type: "movie",
        tmdb_id: Number(imdb_id.slice(2)),
        resolution_status: "resolved",
        last_attempted_at: NOW.toISOString(),
        attempt_count: 1,
      })),
    ),
    loadRefreshTimes: vi.fn(async (refs: readonly TitleRef[]) =>
      refs.map((ref) => ({ ref, last_refreshed_at: NOW.toISOString() })),
    ),
    saveTitle: vi.fn(),
    refreshTitle: vi.fn(),
    markRefreshed: vi.fn(),
    saveMapEntry: vi.fn(),
  };
}

const noTmdb: TmdbLookups = {
  resolve: vi.fn(async () => {
    throw new Error("TMDB must not be called");
  }),
  details: vi.fn(async () => {
    throw new Error("TMDB must not be called");
  }),
};

async function run(
  folder: string,
  m: Manifest,
  ingestion: IngestionStore,
  resolution: ResolutionStore = resolvedCache(),
) {
  return (await report(folder, m, ingestion, resolution)).outcomes;
}

function report(
  folder: string,
  m: Manifest,
  ingestion: IngestionStore,
  resolution: ResolutionStore = resolvedCache(),
) {
  return processRun({
    dir: folder,
    manifest: m,
    today: FIXTURE_TODAY,
    receivedAt: NOW.toISOString(),
    ingestion,
    resolution,
    tmdb: noTmdb,
    resolveOptions: { now: NOW },
    now: () => NOW,
  });
}

describe("processRun", () => {
  it("applies each provider, resolving every provider's rows in one pass", async () => {
    const folder = feedDir({
      "YES.jsonl": yesRows,
      "PARTNER_TV.jsonl": partnerRows,
    });
    const ingestion = memoryIngestion();
    const resolution = resolvedCache();

    const outcomes = await run(
      folder,
      manifest({ YES: ok("YES"), PARTNER_TV: ok("PARTNER_TV", "partial") }),
      ingestion,
      resolution,
    );

    expect(outcomes.map((o) => [o.provider, o.status])).toEqual([
      ["YES", "completed"],
      ["PARTNER_TV", "completed"],
    ]);
    // One resolution over both files (tt0000002 is on both).
    expect(resolution.loadMapEntries).toHaveBeenCalledTimes(1);
    expect(resolution.loadMapEntries.mock.calls[0][0]).toEqual([
      "tt0000001",
      "tt0000002",
      "tt0000003",
    ]);

    const yes = ingestion.runs.get(1)!;
    expect(yes).toMatchObject({
      provider: "YES",
      region: "IL",
      run_date: FIXTURE_TODAY,
      coverage: "complete",
      file_path: join(folder, "YES.jsonl"),
      received_at: NOW.toISOString(),
      status: "completed",
      total_lines: 2,
      valid_lines: 2,
      invalid_lines: 0,
      unmatched_lines: 0,
    });
    expect(ingestion.runs.get(2)!.coverage).toBe("partial");
    // The baseline is asked for with the run's own coverage.
    expect(ingestion.recentRuns.mock.calls).toEqual([
      ["YES", "IL", "complete", BASELINE_RUNS],
      ["PARTNER_TV", "IL", "partial", BASELINE_RUNS],
    ]);

    const stagedYes = ingestion.stageRows.mock.calls[0];
    expect(stagedYes.slice(0, 3)).toEqual([1, "YES", "IL"]);
    expect(
      stagedYes[3].map((r) => [r.imdb_id, r.media_type, r.tmdb_id]),
    ).toEqual([
      ["tt0000001", "movie", 1],
      ["tt0000002", "movie", 2],
    ]);
    const result = outcomes[0].status === "completed" && outcomes[0].result;
    expect(result).toMatchObject({ staged: 2, new: 2 });
  });

  it("records a provider the collector reports failed, and touches nothing", async () => {
    const folder = feedDir({ "YES.jsonl": yesRows });
    const ingestion = memoryIngestion();

    const outcomes = await run(
      folder,
      manifest({
        YES: ok("YES"),
        PARTNER_TV: { status: "failed", error: "HTTP 503" },
      }),
      ingestion,
    );

    expect(outcomes[1]).toEqual({
      provider: "PARTNER_TV",
      runId: 2,
      status: "failed",
      error: "collector reported failure: HTTP 503",
    });
    expect(ingestion.runs.get(2)).toMatchObject({
      status: "failed",
      coverage: null,
      file_path: null,
      finished_at: NOW.toISOString(),
    });
    expect(ingestion.stageRows).toHaveBeenCalledTimes(1);
    expect(ingestion.applyRun).toHaveBeenCalledTimes(1);
    expect(ingestion.applyRun).toHaveBeenCalledWith(1, {
      listedImdbIds: [],
      trustMissing: true,
    });
  });

  it("rejects a suspicious file before any write, and applies the others", async () => {
    const folder = feedDir({
      "YES.jsonl": ["not json", "{}", JSON.stringify(yesRows[0])],
      "PARTNER_TV.jsonl": partnerRows,
    });
    const ingestion = memoryIngestion();

    const outcomes = await run(
      folder,
      manifest({ YES: ok("YES"), PARTNER_TV: ok("PARTNER_TV") }),
      ingestion,
    );

    expect(outcomes[0]).toMatchObject({
      provider: "YES",
      status: "rejected_suspicious",
      reason: expect.stringMatching(/2 of 3 entries invalid/),
    });
    const yes = ingestion.runs.get(1)!;
    expect(yes).toMatchObject({
      status: "rejected_suspicious",
      total_lines: 3,
      invalid_lines: 2,
      finished_at: NOW.toISOString(),
    });
    expect(
      (yes.error_summary as { line_errors: unknown[] }).line_errors,
    ).toHaveLength(2);
    expect(ingestion.stageRows.mock.calls.map((c) => c[0])).toEqual([2]);
    expect(ingestion.applyRun.mock.calls.map((c) => c[0])).toEqual([2]);
    expect(outcomes[1].status).toBe("completed");
  });

  it("rejects a file far below the provider's baseline", async () => {
    const folder = feedDir({ "YES.jsonl": yesRows });
    const ingestion = memoryIngestion();
    ingestion.recentRuns.mockResolvedValue([
      { matched: 100, finishedAt: "2026-11-05T03:00:00Z" },
    ]);

    const outcomes = await run(folder, manifest({ YES: ok("YES") }), ingestion);

    expect(outcomes[0]).toMatchObject({
      status: "rejected_suspicious",
      reason: expect.stringMatching(/recent baseline \(100\)/),
    });
    expect(
      (ingestion.runs.get(1)!.error_summary as { baseline: number }).baseline,
    ).toBe(100);
    expect(ingestion.applyRun).not.toHaveBeenCalled();
  });

  it("fails a provider whose file is missing", async () => {
    const folder = feedDir({});
    const ingestion = memoryIngestion();

    const outcomes = await run(folder, manifest({ YES: ok("YES") }), ingestion);

    expect(outcomes[0]).toMatchObject({ status: "failed", runId: 1 });
    expect(ingestion.runs.get(1)!.status).toBe("failed");
    expect(ingestion.applyRun).not.toHaveBeenCalled();
  });

  it("fails a provider whose apply fails, clearing its staging, and goes on", async () => {
    const folder = feedDir({
      "YES.jsonl": yesRows,
      "PARTNER_TV.jsonl": partnerRows,
    });
    const ingestion = memoryIngestion();
    const apply = ingestion.applyRun.getMockImplementation()!;
    ingestion.applyRun.mockImplementation(async (id: number) => {
      if (id === 1) throw new Error("apply_ingestion_run failed (run 1)");
      return apply(id, { listedImdbIds: [], trustMissing: true });
    });

    const outcomes = await run(
      folder,
      manifest({ YES: ok("YES"), PARTNER_TV: ok("PARTNER_TV") }),
      ingestion,
    );

    expect(outcomes[0]).toEqual({
      provider: "YES",
      runId: 1,
      status: "failed",
      error: "apply_ingestion_run failed (run 1)",
    });
    expect(ingestion.clearStaging).toHaveBeenCalledWith(1);
    // Marked failed first (that waits for an apply still running), then cleared.
    const marks = ingestion.updateRun.mock.calls
      .map(
        (call, i) =>
          [call, ingestion.updateRun.mock.invocationCallOrder[i]] as const,
      )
      .filter(([call]) => call[0] === 1 && call[1].status === "failed");
    expect(marks[0][1]).toBeLessThan(
      ingestion.clearStaging.mock.invocationCallOrder[0],
    );
    expect(ingestion.staged.has(1)).toBe(false);
    const yes = ingestion.runs.get(1)!;
    expect(yes.status).toBe("failed");
    expect(yes.error_summary).toMatchObject({
      error: "apply_ingestion_run failed (run 1)",
      resolution: { stats: { ids: 3 } },
    });
    expect(outcomes[1]).toMatchObject({
      provider: "PARTNER_TV",
      status: "completed",
    });
  });

  it("never marks a run failed once it completed (a lost reply)", async () => {
    const folder = feedDir({ "YES.jsonl": yesRows });
    const ingestion = memoryIngestion();
    ingestion.applyRun.mockImplementation(async (id: number) => {
      // The function committed; the reply never arrived.
      ingestion.runs.set(id, {
        ...ingestion.runs.get(id)!,
        status: "completed",
      });
      throw new Error("fetch failed");
    });

    const outcomes = await run(folder, manifest({ YES: ok("YES") }), ingestion);

    expect(outcomes[0]).toMatchObject({
      status: "failed",
      error: expect.stringMatching(
        /^fetch failed; the run was no longer processing, so it may have completed/,
      ),
    });
    // The store only updates processing runs: the committed run stays
    // completed, and its staging (cleared by the apply) isn't touched.
    expect(ingestion.runs.get(1)!.status).toBe("completed");
    expect(ingestion.clearStaging).not.toHaveBeenCalled();
  });

  it("fails every accepted provider when title resolution can't read the cache", async () => {
    const folder = feedDir({
      "YES.jsonl": yesRows,
      "PARTNER_TV.jsonl": partnerRows,
    });
    const ingestion = memoryIngestion();
    const resolution = resolvedCache();
    resolution.loadMapEntries.mockRejectedValue(
      new Error("imdb_tmdb_map read failed: timeout"),
    );

    const outcomes = await run(
      folder,
      manifest({ YES: ok("YES"), PARTNER_TV: ok("PARTNER_TV") }),
      ingestion,
      resolution,
    );

    expect(outcomes.map((o) => o.status)).toEqual(["failed", "failed"]);
    expect(outcomes[0]).toMatchObject({
      error: "title resolution failed: imdb_tmdb_map read failed: timeout",
    });
    expect(ingestion.stageRows).not.toHaveBeenCalled();
    expect(ingestion.applyRun).not.toHaveBeenCalled();
    // The read counts are kept on the failed run.
    expect(ingestion.runs.get(1)).toMatchObject({
      status: "failed",
      valid_lines: 2,
    });
  });

  it("reports a provider whose run row can't be written", async () => {
    const folder = feedDir({ "YES.jsonl": yesRows });
    const ingestion = memoryIngestion();
    ingestion.createRun.mockRejectedValue(
      new Error("ingestion_runs insert failed (YES): denied"),
    );

    const outcomes = await run(folder, manifest({ YES: ok("YES") }), ingestion);

    expect(outcomes).toEqual([
      {
        provider: "YES",
        runId: null,
        status: "failed",
        error: "ingestion_runs insert failed (YES): denied",
      },
    ]);
    expect(ingestion.updateRun).not.toHaveBeenCalled();
    expect(ingestion.applyRun).not.toHaveBeenCalled();
  });

  it("adds a failure to mark the run failed to the outcome", async () => {
    const folder = feedDir({});
    const ingestion = memoryIngestion();
    ingestion.updateRun.mockRejectedValue(new Error("update denied"));

    const outcomes = await run(folder, manifest({ YES: ok("YES") }), ingestion);

    expect(outcomes[0].status).toBe("failed");
    expect(outcomes[0].status === "failed" && outcomes[0].error).toMatch(
      /; marking the run failed also failed: update denied$/,
    );
  });
  it("passes titles listed on invalid lines to the apply, trusting what's missing", async () => {
    const folder = feedDir({
      "YES.jsonl": [
        ...yesRows,
        feedRow({ imdb_id: "tt0000009", availability_type: "ads" }),
        feedRow({ imdb_id: null, type: "film" }),
        feedRow({ imdb_id: "tt0000001", type: "movie", watch_url: "ftp://x" }),
        ...Array.from({ length: 15 }, (_, i) =>
          feedRow({ imdb_id: `tt10000${String(i).padStart(2, "0")}` }),
        ),
      ],
    });
    const ingestion = memoryIngestion();

    await run(folder, manifest({ YES: ok("YES") }), ingestion);

    const [, options] = ingestion.applyRun.mock.calls[0];
    expect(options).toEqual({
      listedImdbIds: ["tt0000009", "tt0000001"],
      trustMissing: true,
    });
  });

  it("doesn't trust what's missing when an invalid line has no readable imdb_id", async () => {
    const folder = feedDir({
      "YES.jsonl": [
        ...yesRows,
        "{not json",
        ...Array.from({ length: 7 }, (_, i) =>
          feedRow({ imdb_id: `tt10000${String(i).padStart(2, "0")}` }),
        ),
      ],
    });
    const ingestion = memoryIngestion();

    await run(folder, manifest({ YES: ok("YES") }), ingestion);

    expect(ingestion.applyRun.mock.calls[0][1]).toEqual({
      listedImdbIds: [],
      trustMissing: false,
    });
    expect(ingestion.runs.get(1)!.error_summary).toMatchObject({
      unkeyed_invalid: 1,
    });
  });

  it("keeps the read's summary on a run that fails after reading", async () => {
    const folder = feedDir({ "YES.jsonl": [...yesRows, "{not json"] });
    const ingestion = memoryIngestion();
    ingestion.recentRuns.mockRejectedValue(new Error("read timeout"));

    const outcomes = await run(folder, manifest({ YES: ok("YES") }), ingestion);

    expect(outcomes[0]).toMatchObject({
      status: "failed",
      error: "read timeout",
    });
    const summary = ingestion.runs.get(1)!.error_summary as {
      line_errors: unknown[];
      error: string;
    };
    expect(summary.line_errors).toHaveLength(1);
    expect(summary.error).toBe("read timeout");
  });

  it("first marks runs stuck in processing for 6 hours as abandoned", async () => {
    const folder = feedDir({ "YES.jsonl": yesRows });
    const ingestion = memoryIngestion();
    ingestion.abandonStaleRuns.mockResolvedValue([3, 4]);

    const result = await report(
      folder,
      manifest({ YES: ok("YES") }),
      ingestion,
    );

    expect(ingestion.abandonStaleRuns).toHaveBeenCalledWith(
      new Date(NOW.getTime() - STALE_RUN_HOURS * 3_600_000).toISOString(),
    );
    expect(result.abandonedRuns).toEqual([3, 4]);
    expect(result.outcomes[0].status).toBe("completed");
  });

  it("reports outcomes in the manifest's order", async () => {
    const folder = feedDir({ "PARTNER_TV.jsonl": partnerRows });
    const ingestion = memoryIngestion();

    const outcomes = await run(
      folder,
      manifest({
        PARTNER_TV: ok("PARTNER_TV"),
        YES: { status: "failed" },
      }),
      ingestion,
    );

    expect(outcomes.map((o) => [o.provider, o.status])).toEqual([
      ["PARTNER_TV", "completed"],
      ["YES", "failed"],
    ]);
    expect(outcomes[1]).toMatchObject({
      error: "collector reported failure: no error given",
    });
  });

  it("goes on when the stale-run sweep fails, reporting why", async () => {
    const folder = feedDir({ "YES.jsonl": yesRows });
    const ingestion = memoryIngestion();
    ingestion.abandonStaleRuns.mockRejectedValue(
      new Error("ingestion_runs sweep failed: timeout"),
    );

    const result = await report(
      folder,
      manifest({ YES: ok("YES") }),
      ingestion,
    );

    expect(result.sweepError).toBe("ingestion_runs sweep failed: timeout");
    expect(result.abandonedRuns).toEqual([]);
    expect(result.outcomes[0].status).toBe("completed");
  });

  it("fails a provider whose run stopped being processing under it", async () => {
    const folder = feedDir({ "YES.jsonl": yesRows });
    const ingestion = memoryIngestion();
    const update = ingestion.updateRun.getMockImplementation()!;
    ingestion.updateRun.mockImplementation(async (id, change) =>
      change.status === "failed" ? update(id, change) : false,
    );

    const outcomes = await run(folder, manifest({ YES: ok("YES") }), ingestion);

    expect(outcomes[0]).toMatchObject({
      status: "failed",
      error: expect.stringMatching(/^run 1 is no longer processing/),
    });
    expect(ingestion.applyRun).not.toHaveBeenCalled();
  });

  it("fails an expected provider the manifest leaves out, after the others", async () => {
    const folder = feedDir({ "YES.jsonl": yesRows });
    const ingestion = memoryIngestion();

    const result = await processRun({
      dir: folder,
      manifest: manifest({ YES: ok("YES") }),
      today: FIXTURE_TODAY,
      ingestion,
      resolution: resolvedCache(),
      tmdb: noTmdb,
      resolveOptions: { now: NOW },
      now: () => NOW,
      expectedProviders: ["YES", "PARTNER_TV"],
    });

    expect(result.outcomes.map((o) => [o.provider, o.status])).toEqual([
      ["YES", "completed"],
      ["PARTNER_TV", "failed"],
    ]);
    expect(result.outcomes[1]).toMatchObject({
      error: "missing from the collector's manifest",
    });
    expect(
      [...ingestion.runs.values()].find((r) => r.provider === "PARTNER_TV"),
    ).toMatchObject({ status: "failed", coverage: null, file_path: null });
  });

  it("records the archived path as the run's file_path", async () => {
    const folder = feedDir({ "YES.jsonl": yesRows });
    const ingestion = memoryIngestion();

    await processRun({
      dir: folder,
      manifest: manifest({ YES: ok("YES") }),
      today: FIXTURE_TODAY,
      ingestion,
      resolution: resolvedCache(),
      tmdb: noTmdb,
      resolveOptions: { now: NOW },
      now: () => NOW,
      archivePrefix: "raw-feeds/2026-11-06/030000Z",
    });

    expect(ingestion.runs.get(1)!.file_path).toBe(
      "raw-feeds/2026-11-06/030000Z/YES.jsonl",
    );
  });

  it("records no file_path for a file that couldn't be archived", async () => {
    const folder = feedDir({
      "YES.jsonl": yesRows,
      "PARTNER_TV.jsonl": partnerRows,
    });
    const ingestion = memoryIngestion();
    const base = {
      dir: folder,
      manifest: manifest({ YES: ok("YES"), PARTNER_TV: ok("PARTNER_TV") }),
      today: FIXTURE_TODAY,
      ingestion,
      resolution: resolvedCache(),
      tmdb: noTmdb,
      resolveOptions: { now: NOW },
      now: () => NOW,
    };

    await processRun({
      ...base,
      archivePrefix: "raw-feeds/x",
      archivedFiles: ["manifest.json", "YES.jsonl"],
      receivedAt: NOW.toISOString(),
    });
    expect(ingestion.runs.get(1)!.file_path).toBe("raw-feeds/x/YES.jsonl");
    expect(ingestion.runs.get(2)!.file_path).toBeNull();
    // Only the archived file has a receipt time.
    expect(ingestion.runs.get(1)!.received_at).toBe(NOW.toISOString());
    expect(ingestion.runs.get(2)!.received_at).toBeNull();

    await processRun({ ...base, archivePrefix: null });
    expect(ingestion.runs.get(3)!.file_path).toBeNull();
  });

  it("expects each missing provider once, and records the collector version", async () => {
    const folder = feedDir({ "YES.jsonl": yesRows });
    const ingestion = memoryIngestion();

    const result = await processRun({
      dir: folder,
      manifest: { ...manifest({ YES: ok("YES") }), collector_version: "mock" },
      today: FIXTURE_TODAY,
      ingestion,
      resolution: resolvedCache(),
      tmdb: noTmdb,
      resolveOptions: { now: NOW },
      now: () => NOW,
      expectedProviders: ["PARTNER_TV", "PARTNER_TV", "toString"],
    });

    expect(result.outcomes.map((o) => o.provider)).toEqual([
      "YES",
      "PARTNER_TV",
      "toString",
    ]);
    expect(ingestion.createRun).toHaveBeenCalledTimes(3);
    const yes = [...ingestion.runs.values()].find((r) => r.provider === "YES");
    expect(yes!.error_summary).toMatchObject({ collector_version: "mock" });
  });

  it("marks every run of a mock run, failed ones included", async () => {
    const folder = feedDir({});
    const ingestion = memoryIngestion();

    await processRun({
      dir: folder,
      manifest: {
        ...manifest({ YES: ok("YES"), PARTNER_TV: { status: "failed" } }),
        collector_version: "mock",
      },
      today: FIXTURE_TODAY,
      ingestion,
      resolution: resolvedCache(),
      tmdb: noTmdb,
      now: () => NOW,
      expectedProviders: ["NETFLIX"],
    });

    const runs = [...ingestion.runs.values()];
    expect(runs).toHaveLength(3);
    for (const run of runs)
      expect(run).toMatchObject({
        status: "failed",
        error_summary: { collector_version: "mock" },
      });
  });

  it("fails each expected provider with the manifest's problem", async () => {
    const ingestion = memoryIngestion();

    const result = await processRun({
      dir: feedDir({}),
      manifest: { generated_at: NOW.toISOString(), providers: {} },
      today: FIXTURE_TODAY,
      ingestion,
      resolution: resolvedCache(),
      tmdb: noTmdb,
      now: () => NOW,
      expectedProviders: ["YES", "PARTNER_TV"],
      manifestError: "Unexpected end of JSON input",
    });

    expect(result.outcomes).toEqual([
      expect.objectContaining({
        provider: "YES",
        status: "failed",
        error: "manifest.json unusable: Unexpected end of JSON input",
      }),
      expect.objectContaining({ provider: "PARTNER_TV", status: "failed" }),
    ]);
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  STAGING_CHUNK_SIZE,
  supabaseIngestionStore,
  type StagingInput,
} from "./staging";

type Result = { data?: unknown; error: { message: string } | null };

// The chainable + thenable query stand-in used by ../tmdb/store.test.ts.
function makeBuilder(results: Result[]) {
  let call = 0;
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    in: vi.fn(() => builder),
    then: (
      resolve: (value: Result) => unknown,
      reject?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve(results[Math.min(call++, results.length - 1)]).then(
        resolve,
        reject,
      ),
  };
  return builder;
}

function makeClient(results: Record<string, Result[]>, rpc: Result = ok()) {
  const builders = Object.fromEntries(
    Object.entries(results).map(([table, r]) => [table, makeBuilder(r)]),
  );
  const client = {
    from: vi.fn((table: string) => builders[table]),
    rpc: vi.fn(async () => rpc),
  };
  return { store: supabaseIngestionStore(client as never), builders, client };
}

const ok = (data: unknown = null): Result => ({ data, error: null });
const fail = (message: string): Result => ({ data: null, error: { message } });

function stagingRow(n: number): StagingInput {
  return {
    provider: "YES",
    region: "IL",
    title: `Title ${n}`,
    type: "movie",
    imdb_id: `tt${1000000 + n}`,
    tmdb_id: n,
    media_type: "movie",
    availability_type: "subscription",
    last_verified: "2026-11-07",
  };
}

describe("supabaseIngestionStore", () => {
  it("reads the baseline from completed runs of one coverage, newest first", async () => {
    const { store, builders } = makeClient({
      ingestion_runs: [
        ok([
          {
            valid_lines: 120,
            unmatched_lines: 20,
            finished_at: "2026-11-06T03:00:00Z",
          },
          { valid_lines: 90, unmatched_lines: null, finished_at: "x" },
        ]),
      ],
    });

    const runs = await store.recentRuns("YES", "IL", "partial", 7);

    expect(runs).toEqual([
      { matched: 100, finishedAt: "2026-11-06T03:00:00Z" },
      { matched: 90, finishedAt: "x" },
    ]);
    const b = builders.ingestion_runs;
    expect(b.eq.mock.calls).toEqual([
      ["provider", "YES"],
      ["region", "IL"],
      ["coverage", "partial"],
      ["status", "completed"],
    ]);
    expect(b.order).toHaveBeenCalledWith("finished_at", { ascending: false });
    expect(b.limit).toHaveBeenCalledWith(7);
  });

  it("throws when the baseline can't be read", async () => {
    const { store } = makeClient({ ingestion_runs: [fail("boom")] });
    await expect(store.recentRuns("YES", "IL", "complete", 7)).rejects.toThrow(
      /ingestion_runs read failed: boom/,
    );
  });

  it("creates a run as processing and returns its id", async () => {
    const { store, builders } = makeClient({
      ingestion_runs: [ok({ id: 42 })],
    });

    const id = await store.createRun({
      provider: "YES",
      region: "IL",
      run_date: "2026-11-07",
      coverage: "complete",
      file_path: "out/YES.jsonl",
      received_at: null,
    });

    expect(id).toBe(42);
    const [[inserted]] = builders.ingestion_runs.insert.mock
      .calls as unknown as [Record<string, unknown>][];
    expect(inserted).toMatchObject({
      provider: "YES",
      run_date: "2026-11-07",
      coverage: "complete",
      status: "processing",
    });
    // started_at is the database's (column default).
    expect(inserted).not.toHaveProperty("started_at");
  });

  it("reports a failed run insert", async () => {
    const { store } = makeClient({ ingestion_runs: [fail("denied")] });
    await expect(
      store.createRun({
        provider: "YES",
        region: "IL",
        run_date: "2026-11-07",
        coverage: null,
        file_path: null,
        received_at: null,
      }),
    ).rejects.toThrow(/ingestion_runs insert failed \(YES\): denied/);
  });

  it("updates only a run that is still processing, saying whether it was", async () => {
    const { store, builders } = makeClient({
      ingestion_runs: [ok([{ id: 7 }]), ok([])],
    });

    expect(await store.updateRun(7, { status: "failed" })).toBe(true);
    expect(await store.updateRun(7, { status: "failed" })).toBe(false);

    const b = builders.ingestion_runs;
    expect(b.update).toHaveBeenCalledWith({ status: "failed" });
    expect(b.eq.mock.calls.slice(0, 2)).toEqual([
      ["id", 7],
      ["status", "processing"],
    ]);
  });

  it("stages rows in chunks, tagged with the run's provider and region", async () => {
    const { store, builders } = makeClient({ staging_availability: [ok()] });
    const rows = Array.from({ length: STAGING_CHUNK_SIZE + 1 }, (_, i) =>
      stagingRow(i),
    );

    await store.stageRows(9, "YES", "IL", rows);

    const calls = builders.staging_availability.insert.mock
      .calls as unknown as [Record<string, unknown>[]][];
    expect(calls.map(([chunk]) => chunk.length)).toEqual([
      STAGING_CHUNK_SIZE,
      1,
    ]);
    expect(calls[0][0][0]).toEqual({
      run_id: 9,
      provider: "YES",
      region: "IL",
      imdb_id: "tt1000000",
      type: "movie",
      media_type: "movie",
      tmdb_id: 0,
      title: "Title 0",
      original_title: null,
      release_year: null,
      availability_type: "subscription",
      watch_url: null,
      seasons_available: null,
      last_verified: "2026-11-07",
    });
  });

  it("stops staging at the first failed chunk", async () => {
    const { store, builders } = makeClient({
      staging_availability: [fail("too big"), ok()],
    });
    const rows = Array.from({ length: STAGING_CHUNK_SIZE * 2 }, (_, i) =>
      stagingRow(i),
    );

    await expect(store.stageRows(9, "YES", "IL", rows)).rejects.toThrow(
      /staging_availability insert failed \(run 9\): too big/,
    );
    expect(builders.staging_availability.insert).toHaveBeenCalledTimes(1);
  });

  it("applies a run through the function and returns its counts", async () => {
    const result = {
      staged: 3,
      new: 1,
      returned: 0,
      updated: 0,
      unchanged: 2,
      removed: 1,
      kept_invalid: 1,
      immediate_removals: false,
      removal_cutoff: "2026-11-01",
    };
    const { store, client } = makeClient({}, ok(result));

    expect(
      await store.applyRun(5, {
        listedImdbIds: ["tt0000009"],
        trustMissing: false,
      }),
    ).toEqual(result);
    expect(client.rpc).toHaveBeenCalledWith("apply_ingestion_run", {
      p_run_id: 5,
      p_listed_imdb_ids: ["tt0000009"],
      p_trust_missing: false,
    });
  });

  it("refuses a reply without the counts", async () => {
    const { store } = makeClient({}, ok(null));
    await expect(
      store.applyRun(5, { listedImdbIds: [], trustMissing: true }),
    ).rejects.toThrow(/unexpected result \(run 5\): null/);
  });

  it("reports the function's error", async () => {
    const { store } = makeClient({}, fail("run 5 has no staged rows"));
    await expect(
      store.applyRun(5, { listedImdbIds: [], trustMissing: true }),
    ).rejects.toThrow(
      /apply_ingestion_run failed \(run 5\): run 5 has no staged rows/,
    );
  });

  it("clears a run's staged rows", async () => {
    const { store, builders } = makeClient({ staging_availability: [ok()] });
    await store.clearStaging(5);
    expect(builders.staging_availability.delete).toHaveBeenCalled();
    expect(builders.staging_availability.eq).toHaveBeenCalledWith("run_id", 5);
  });

  it("drops stale processing runs' staged rows, then marks them failed", async () => {
    const { store, builders } = makeClient({
      ingestion_runs: [ok([{ id: 3 }, { id: 4 }]), ok([{ id: 3 }])],
      staging_availability: [ok()],
    });

    // Run 4 finished in between: only 3 was abandoned.
    expect(await store.abandonStaleRuns("2026-11-06T21:00:00Z")).toEqual([3]);

    const runs = builders.ingestion_runs;
    expect(runs.lt).toHaveBeenCalledWith("started_at", "2026-11-06T21:00:00Z");
    expect(builders.staging_availability.in).toHaveBeenCalledWith(
      "run_id",
      [3, 4],
    );
    expect(
      (runs.update.mock.calls as unknown as [unknown][])[0][0],
    ).toMatchObject({ status: "failed" });
    expect(runs.in).toHaveBeenCalledWith("id", [3, 4]);
    // Staging went first.
    expect(
      builders.staging_availability.delete.mock.invocationCallOrder[0],
    ).toBeLessThan(runs.update.mock.invocationCallOrder[0]);
  });

  it("leaves the runs processing when their staging can't be dropped", async () => {
    const { store, builders } = makeClient({
      ingestion_runs: [ok([{ id: 3 }])],
      staging_availability: [fail("timeout")],
    });

    await expect(store.abandonStaleRuns("x")).rejects.toThrow(
      /staging_availability sweep failed: timeout/,
    );
    expect(builders.ingestion_runs.update).not.toHaveBeenCalled();
  });

  it("sweeps nothing when no run is stale", async () => {
    const { store, builders } = makeClient({
      ingestion_runs: [ok([])],
      staging_availability: [ok()],
    });

    expect(await store.abandonStaleRuns("2026-11-06T21:00:00Z")).toEqual([]);
    expect(builders.staging_availability.delete).not.toHaveBeenCalled();
  });
});

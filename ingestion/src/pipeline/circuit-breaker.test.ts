import { describe, expect, it } from "vitest";
import {
  BASELINE_RUNS,
  baselineFrom,
  evaluateBreaker,
  MAX_INVALID_SHARE,
  MIN_MATCHED_SHARE,
} from "./circuit-breaker";

/** A healthy run's counts, overridden per case. */
function counts(
  overrides: Partial<Parameters<typeof evaluateBreaker>[0]> = {},
) {
  return {
    total: 1000,
    valid: 990,
    invalid: 10,
    matched: 950,
    baseline: 1000,
    ...overrides,
  };
}

/** Runs on consecutive days from 2026-11-01, oldest first. */
function runs(matched: number[]) {
  return matched.map((m, i) => ({
    matched: m,
    finishedAt: new Date(Date.UTC(2026, 10, 1 + i)).toISOString(),
  }));
}

describe("baselineFrom", () => {
  it("is null with no history (first run: no size check)", () => {
    expect(baselineFrom([])).toBeNull();
  });

  it("is the median, so one odd day doesn't move it", () => {
    expect(baselineFrom(runs([1000, 10, 1010]))).toBe(1000);
    expect(baselineFrom(runs([100, 200]))).toBe(150);
  });

  it("uses only the BASELINE_RUNS most recent runs, in any input order", () => {
    // 8 old small runs, then BASELINE_RUNS recent big ones; shuffled.
    const all = runs([...Array(8).fill(5), ...Array(BASELINE_RUNS).fill(1000)]);
    expect(baselineFrom([...all].reverse())).toBe(1000);
    expect(baselineFrom(all)).toBe(1000);
  });
});

describe("evaluateBreaker", () => {
  it("passes a healthy file", () => {
    expect(evaluateBreaker(counts())).toEqual({ ok: true });
  });

  it("rejects an empty file (never 'everything was removed')", () => {
    expect(
      evaluateBreaker(
        counts({ total: 0, valid: 0, invalid: 0, matched: 0, baseline: null }),
      ),
    ).toEqual({ ok: false, reason: "empty file" });
  });

  it("rejects when more than 20% of lines are invalid", () => {
    expect(MAX_INVALID_SHARE).toBe(0.2);
    expect(
      evaluateBreaker(
        counts({
          total: 100,
          valid: 80,
          invalid: 20,
          matched: 80,
          baseline: null,
        }),
      ).ok,
    ).toBe(true);
    expect(
      evaluateBreaker(
        counts({
          total: 100,
          valid: 79,
          invalid: 21,
          matched: 79,
          baseline: null,
        }),
      ),
    ).toEqual({
      ok: false,
      reason: "21 of 100 entries invalid (21%, limit 20%)",
    });
  });

  it("rejects a valid file with no imdb_ids, even on a first run", () => {
    // Today's collector output: every row valid, none matched.
    expect(
      evaluateBreaker(
        counts({
          total: 437,
          valid: 437,
          invalid: 0,
          matched: 0,
          baseline: null,
        }),
      ),
    ).toEqual({ ok: false, reason: "no rows with an imdb_id" });
  });

  it("rejects when under half the valid rows have an imdb_id", () => {
    expect(MIN_MATCHED_SHARE).toBe(0.5);
    expect(
      evaluateBreaker(
        counts({
          valid: 400,
          invalid: 0,
          total: 400,
          matched: 199,
          baseline: null,
        }),
      ),
    ).toEqual({
      ok: false,
      reason: "only 199 of 400 valid rows have an imdb_id (49.8%, minimum 50%)",
    });
    expect(
      evaluateBreaker(
        counts({
          valid: 400,
          invalid: 0,
          total: 400,
          matched: 200,
          baseline: null,
        }),
      ).ok,
    ).toBe(true);
  });

  it("rejects matched rows under half the baseline (a truncated file)", () => {
    expect(
      evaluateBreaker(
        counts({ total: 400, valid: 400, invalid: 0, matched: 400 }),
      ),
    ).toEqual({
      ok: false,
      reason: "400 matched rows, under 50% of the recent baseline (1000)",
    });
    expect(
      evaluateBreaker(
        counts({ total: 500, valid: 500, invalid: 0, matched: 500 }),
      ).ok,
    ).toBe(true);
  });

  it("judges size on matched rows, not valid ones", () => {
    // Same line count as the baseline, but most rows lost their imdb_id.
    expect(
      evaluateBreaker(
        counts({ total: 1000, valid: 1000, invalid: 0, matched: 600 }),
      ).ok,
    ).toBe(true);
    expect(
      evaluateBreaker(
        counts({ total: 1000, valid: 1000, invalid: 0, matched: 499 }),
      ),
    ).toMatchObject({ ok: false });
  });

  it("skips the size check without a baseline", () => {
    expect(
      evaluateBreaker(
        counts({ total: 3, valid: 3, invalid: 0, matched: 3, baseline: null }),
      ).ok,
    ).toBe(true);
  });

  it("doesn't let repeated good titles dilute the invalid share", () => {
    // 100 titles listed 3 ways each (200 merged repeats) + 70 bad lines.
    expect(
      evaluateBreaker(
        counts({
          total: 370,
          valid: 100,
          invalid: 70,
          matched: 100,
          baseline: null,
        }),
      ),
    ).toEqual({
      ok: false,
      reason: "70 of 170 entries invalid (41.2%, limit 20%)",
    });
  });
});

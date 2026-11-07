import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  MAX_RECORDED_ERRORS,
  mergeOffers,
  RAW_SNIPPET_LENGTH,
  readFeedFile,
  validateFeedLines,
  type MatchedFeedRow,
} from "./read";
import { FIXTURE_TODAY, feedRow } from "./fixtures";

const OPTIONS = { provider: "YES", today: FIXTURE_TODAY };
const line = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify(feedRow(overrides));

describe("validateFeedLines", () => {
  it("keeps valid matched rows and counts every line", async () => {
    const result = await validateFeedLines(
      [line(), line({ imdb_id: "tt0903747", title: "Breaking Bad" })],
      OPTIONS,
    );

    expect(result).toMatchObject({
      total: 2,
      valid: 2,
      invalid: 0,
      unmatched: 0,
      errors: [],
    });
    expect(result.rows.map((r) => r.imdb_id)).toEqual([
      "tt4565380",
      "tt0903747",
    ]);
  });

  it("counts a row without an imdb_id as valid but unmatched, and doesn't keep it", async () => {
    const result = await validateFeedLines(
      [line(), line({ imdb_id: null, tmdb_id: null, match_source: null })],
      OPTIONS,
    );

    expect(result).toMatchObject({ total: 2, valid: 2, unmatched: 1 });
    expect(result.rows).toHaveLength(1);
  });

  it("skips a bad line with its line number and reason, never aborting", async () => {
    const result = await validateFeedLines(
      [
        line(),
        "{not json",
        line({ imdb_id: "tt12" }),
        line({ imdb_id: "tt0903747" }),
      ],
      OPTIONS,
    );

    expect(result).toMatchObject({ total: 4, valid: 2, invalid: 2 });
    expect(result.errors).toEqual([
      { line: 2, reason: "not valid JSON", raw: "{not json" },
      expect.objectContaining({
        line: 3,
        reason: expect.stringMatching(/^imdb_id: /),
      }),
    ]);
  });

  it("keeps the imdb_ids of invalid lines, counting lines without one", async () => {
    const result = await validateFeedLines(
      [
        line(),
        line({ imdb_id: "tt0903747", availability_type: "ads" }),
        line({ imdb_id: "tt0903747", watch_url: "ftp://x" }),
        // A typo'd provider is still this file's line.
        line({ provider: "Yes", imdb_id: "tt0111161" }),
        line({ imdb_id: null, type: "film" }),
        line({ imdb_id: "tt12" }),
        line({ imdb_id: undefined, type: "film" }),
        "{not json",
        "[1, 2]",
        "null",
      ],
      OPTIONS,
    );

    expect(result.invalid).toBe(9);
    expect(result.invalidImdbIds).toEqual(["tt0903747", "tt0111161"]);
    // tt12, the missing id, the bad JSON, the array and the bare null: any
    // title could be behind them. An explicit null id is unmatched, not unknown.
    expect(result.unkeyedInvalid).toBe(5);
  });

  it("counts lines labeled with another known provider as unknown, keeping no id", async () => {
    const result = await validateFeedLines(
      [
        line(),
        // Valid for NETFLIX, and invalid for anyone.
        line({ provider: "NETFLIX", imdb_id: "tt0068646" }),
        line({ provider: "NETFLIX", imdb_id: "tt0111161", type: "film" }),
      ],
      OPTIONS,
    );

    expect(result.invalid).toBe(2);
    expect(result.invalidImdbIds).toEqual([]);
    expect(result.unkeyedInvalid).toBe(2);
  });

  it("keeps no id from a line saying its title left; stale or other-region lines are unknown", async () => {
    const result = await validateFeedLines(
      [
        line(),
        line({ imdb_id: "tt0000001", removed_date: "2026-10-01" }),
        line({
          imdb_id: "tt0000002",
          added_date: "2026-11-07",
          removed_date: "2026-11-06",
        }),
        line({ imdb_id: "tt0000003", last_verified: "2026-10-01" }),
        line({ imdb_id: "tt0000004", region: "US" }),
        // Zod skips the date rules on a type error: judged all the same.
        line({ imdb_id: "tt0000005", removed_date: "2026-10-01", title: 5 }),
        line({ imdb_id: "tt0000006", last_verified: "2026-10-01", title: 5 }),
        // Only a stale last_verified is unknown: a future one isn't.
        line({ imdb_id: "tt0000007", last_verified: "2026-11-09" }),
      ],
      OPTIONS,
    );

    expect(result.invalid).toBe(7);
    // The inconsistent dates and the future date (not a departure, not
    // stale) are still listed today.
    expect(result.invalidImdbIds).toEqual(["tt0000002", "tt0000007"]);
    expect(result.unkeyedInvalid).toBe(3);
  });

  it("rejects a row naming another provider (each file is one provider's)", async () => {
    const result = await validateFeedLines(
      [line({ provider: "PARTNER_TV" })],
      OPTIONS,
    );

    expect(result.invalid).toBe(1);
    expect(result.errors[0].reason).toBe("provider PARTNER_TV in YES's file");
  });

  it("merges a repeated (imdb_id, type): neither valid nor invalid", async () => {
    const result = await validateFeedLines([line(), line()], OPTIONS);

    expect(result).toMatchObject({
      total: 2,
      valid: 1,
      invalid: 0,
      duplicates: 1,
    });
    expect(result.rows).toHaveLength(1);
  });

  it("drops repeated unmatched titles (same title, type and year)", async () => {
    const unmatched = { imdb_id: null, tmdb_id: null, match_source: null };
    const result = await validateFeedLines(
      [
        line(),
        line({ ...unmatched, title: "A", availability_type: "rent" }),
        line({ ...unmatched, title: "A", availability_type: "buy" }),
        line({ ...unmatched, title: "A", release_year: 1999 }),
      ],
      OPTIONS,
    );

    expect(result).toMatchObject({
      valid: 3,
      unmatched: 2,
      duplicates: 1,
    });
  });

  it("cuts a long raw line on whole characters (never half an emoji)", async () => {
    const raw = `${"x".repeat(RAW_SNIPPET_LENGTH - 1)}😀tail`;

    const result = await validateFeedLines([raw], OPTIONS);

    expect(result.errors[0].raw).toBe(
      `${"x".repeat(RAW_SNIPPET_LENGTH - 1)}😀`,
    );
  });

  it("keeps a title's best offer when it's listed several ways", async () => {
    const result = await validateFeedLines(
      [
        line({ availability_type: "buy" }),
        line({ availability_type: "subscription" }),
        line({ availability_type: "rent" }),
      ],
      OPTIONS,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].availability_type).toBe("subscription");
    expect(result.duplicates).toBe(2);
  });

  it("allows the same imdb_id under another type", async () => {
    const result = await validateFeedLines(
      [line(), line({ type: "movie", seasons_available: null })],
      OPTIONS,
    );

    expect(result.rows).toHaveLength(2);
  });

  it("ignores blank lines and a BOM, numbering real file lines", async () => {
    const result = await validateFeedLines(
      [`${String.fromCharCode(0xfeff)}${line()}`, "", "   ", "oops"],
      OPTIONS,
    );

    expect(result.total).toBe(2);
    expect(result.errors[0].line).toBe(4);
  });

  it("truncates the raw line and caps how many errors it records", async () => {
    const long = "x".repeat(RAW_SNIPPET_LENGTH + 50);
    const lines = Array.from({ length: MAX_RECORDED_ERRORS + 5 }, () => long);

    const result = await validateFeedLines(lines, OPTIONS);

    expect(result.invalid).toBe(MAX_RECORDED_ERRORS + 5);
    expect(result.errors).toHaveLength(MAX_RECORDED_ERRORS);
    expect(result.errors[0].raw).toHaveLength(RAW_SNIPPET_LENGTH);
  });
});

describe("mergeOffers", () => {
  const row = (overrides: Record<string, unknown>) =>
    feedRow(overrides) as MatchedFeedRow;

  it("keeps the better offer and its link, combining seasons", () => {
    const merged = mergeOffers(
      row({
        availability_type: "rent",
        watch_url: "https://x.test/rent",
        seasons_available: [1, 2, 3, 4],
      }),
      row({
        availability_type: "subscription",
        watch_url: "https://x.test/sub",
        seasons_available: [2, 1],
      }),
    );

    expect(merged).toMatchObject({
      availability_type: "subscription",
      watch_url: "https://x.test/sub",
      seasons_available: [1, 2, 3, 4],
    });
  });

  it("fills what the kept row lacks from the other", () => {
    const merged = mergeOffers(
      row({
        availability_type: "subscription",
        watch_url: null,
        original_title: null,
        release_year: null,
        seasons_available: null,
      }),
      row({
        availability_type: "rent",
        watch_url: "https://x.test/rent",
        original_title: "Fauda",
        release_year: 2015,
        seasons_available: null,
      }),
    );

    expect(merged).toMatchObject({
      availability_type: "subscription",
      watch_url: "https://x.test/rent",
      original_title: "Fauda",
      release_year: 2015,
      seasons_available: null,
    });
  });

  it("keeps the earlier row on a tie, with the fresher last_verified", () => {
    const merged = mergeOffers(
      row({ watch_url: "https://x.test/a", last_verified: "2026-11-05" }),
      row({ watch_url: "https://x.test/b", last_verified: "2026-11-06" }),
    );

    expect(merged.watch_url).toBe("https://x.test/a");
    expect(merged.last_verified).toBe("2026-11-06");
  });
});

describe("readFeedFile", () => {
  const dir = mkdtempSync(join(tmpdir(), "playnext-feed-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("streams a file with CRLF endings and a truncated last line", async () => {
    const path = join(dir, "YES.jsonl");
    const cut = line({ imdb_id: "tt0903747" }).slice(0, 40);
    writeFileSync(path, `${line()}\r\n${cut}`);

    const result = await readFeedFile(path, OPTIONS);

    expect(result).toMatchObject({ total: 2, valid: 1, invalid: 1 });
    expect(result.errors[0]).toMatchObject({
      line: 2,
      reason: "not valid JSON",
    });
  });

  it("rejects a missing file", async () => {
    await expect(
      readFeedFile(join(dir, "nope.jsonl"), OPTIONS),
    ).rejects.toThrow(/ENOENT/);
  });
});

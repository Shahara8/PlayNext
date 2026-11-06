import { describe, expect, it } from "vitest";
import { FIXTURE_TODAY as TODAY, feedRow } from "./fixtures";
import { feedRowSchema, manifestSchema } from "./schema";

const schema = feedRowSchema(TODAY);

const ok = (row: Record<string, unknown>) => schema.safeParse(row).success;

describe("feedRowSchema", () => {
  it("accepts a full contract row", () => {
    expect(ok(feedRow())).toBe(true);
  });

  it("accepts a minimal movie row (optional fields absent)", () => {
    expect(
      ok({
        provider: "PARTNER_TV",
        region: "IL",
        title: "Hamnet",
        type: "movie",
        imdb_id: "tt14905854",
        availability_type: "subscription",
        last_verified: TODAY,
      }),
    ).toBe(true);
  });

  it("accepts a row without an imdb_id (valid, but unmatched)", () => {
    expect(
      ok(feedRow({ imdb_id: null, tmdb_id: null, match_source: null })),
    ).toBe(true);
  });

  it("drops unknown extra fields instead of failing", () => {
    const parsed = schema.parse(feedRow({ dubbed: true }));
    expect(parsed).not.toHaveProperty("dubbed");
  });

  it.each([
    ["an unknown provider", { provider: "HBO_MAX" }],
    ["the collector's old provider name", { provider: "Partner TV" }],
    ["another region", { region: "US" }],
    ["an unknown type", { type: "episode" }],
    ["a malformed imdb_id", { imdb_id: "tt123" }],
    ["an imdb_id missing entirely", { imdb_id: undefined }],
    ["availability 'ads'", { availability_type: "ads" }],
    ["an empty title", { title: "  " }],
    ["a non-http watch_url", { watch_url: "javascript:alert(1)" }],
    ["a non-ISO date", { last_verified: "06/11/2026" }],
    ["an impossible date", { last_verified: "2026-02-30" }],
    ["no last_verified", { last_verified: undefined }],
    ["a negative tmdb_id", { tmdb_id: -1 }],
  ])("rejects %s", (_name, overrides) => {
    expect(ok(feedRow(overrides))).toBe(false);
  });

  it("allows last_verified a day ahead (time zones), not more", () => {
    expect(ok(feedRow({ last_verified: "2026-11-07" }))).toBe(true);
    expect(ok(feedRow({ last_verified: "2026-11-08" }))).toBe(false);
  });

  it("rejects a future added_date", () => {
    expect(ok(feedRow({ added_date: "2027-01-01" }))).toBe(false);
  });

  it("rejects a stale last_verified (an old file re-delivered)", () => {
    expect(ok(feedRow({ last_verified: "2026-11-03" }))).toBe(true);
    expect(ok(feedRow({ last_verified: "2026-11-02" }))).toBe(false);
  });

  it("allows a removed_date of today or later (a coming departure), not past", () => {
    expect(ok(feedRow({ removed_date: "2026-12-01" }))).toBe(true);
    expect(ok(feedRow({ removed_date: TODAY }))).toBe(true);
    // A day behind (a collector still on its local yesterday) is tolerated.
    expect(ok(feedRow({ removed_date: "2026-11-05" }))).toBe(true);
    expect(ok(feedRow({ removed_date: "2026-11-04" }))).toBe(false);
  });

  it("refuses a run date that isn't YYYY-MM-DD", () => {
    expect(() => feedRowSchema("2026-11-06T03:00:00Z")).toThrow(
      /today must be YYYY-MM-DD/,
    );
  });

  it("rejects removed_date before added_date", () => {
    expect(
      ok(feedRow({ added_date: "2026-11-07", removed_date: "2026-11-06" })),
    ).toBe(false);
    expect(
      ok(feedRow({ added_date: "2026-09-01", removed_date: "2026-12-01" })),
    ).toBe(true);
  });

  it("rejects seasons on a movie, and duplicate seasons", () => {
    expect(ok(feedRow({ type: "movie", seasons_available: [1] }))).toBe(false);
    expect(ok(feedRow({ seasons_available: [1, 1] }))).toBe(false);
  });

  it("keeps an unmatched row valid even with a match_source (which search failed)", () => {
    expect(ok(feedRow({ imdb_id: null, match_source: "tmdb_search" }))).toBe(
      true,
    );
  });
});

describe("manifestSchema", () => {
  it("accepts the documented manifest, ok and failed providers", () => {
    expect(
      manifestSchema.safeParse({
        generated_at: "2026-11-06T03:00:12Z",
        collector_version: "0.2.0",
        providers: {
          YES: {
            status: "ok",
            coverage: "complete",
            file: "YES.jsonl",
            records: 2841,
            provider_reported_total: 2850,
            source_urls: ["https://example.test"],
            null_counts: { imdb_id: 112 },
            unmatched_titles: ["x"],
          },
          PARTNER_TV: { status: "failed", error: "HTTP 503 after 3 retries" },
        },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown provider key", () => {
    expect(
      manifestSchema.safeParse({
        generated_at: "2026-11-06T03:00:12Z",
        providers: { HOT: { status: "failed" } },
      }).success,
    ).toBe(false);
  });

  it.each(["../../etc/passwd", "PARTNER_TV.jsonl", "yes.jsonl"])(
    "only accepts the agreed file name, not %s",
    (file) => {
      expect(
        manifestSchema.safeParse({
          generated_at: "2026-11-06T03:00:12Z",
          providers: {
            YES: { status: "ok", coverage: "complete", file, records: 1 },
          },
        }).success,
      ).toBe(false);
    },
  );

  it("requires coverage and a file for an ok provider", () => {
    expect(
      manifestSchema.safeParse({
        generated_at: "2026-11-06T03:00:12Z",
        providers: { YES: { status: "ok", records: 1 } },
      }).success,
    ).toBe(false);
  });
});

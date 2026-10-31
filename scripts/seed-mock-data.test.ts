import { describe, expect, it } from "vitest";
import { feedRowSchema } from "./seed-mock-data";

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    provider: "NETFLIX",
    region: "IL",
    title: "Example Movie",
    type: "movie",
    imdb_id: "tt1234567",
    availability_type: "subscription",
    added_date: "2026-09-01",
    last_verified: "2026-10-24",
    ...overrides,
  };
}

describe("feedRowSchema", () => {
  it("accepts a minimal valid row", () => {
    expect(feedRowSchema.safeParse(validRow()).success).toBe(true);
  });

  it("accepts a full row with all optional fields present", () => {
    const result = feedRowSchema.safeParse(
      validRow({
        original_title: "פאודה",
        release_year: 2015,
        watch_url: "https://example.com/watch",
        seasons_available: [1, 2, 3],
        removed_date: null,
      }),
    );
    expect(result.success).toBe(true);
  });

  it.each([
    "provider",
    "region",
    "title",
    "imdb_id",
    "added_date",
    "last_verified",
  ])("rejects a row missing required field %s", (field) => {
    const row = validRow();
    delete (row as Record<string, unknown>)[field];
    expect(feedRowSchema.safeParse(row).success).toBe(false);
  });

  it.each(["tt123456", "123456789", "tt12345678901", "nottanid"])(
    "rejects a malformed imdb_id: %s",
    (imdb_id) => {
      expect(feedRowSchema.safeParse(validRow({ imdb_id })).success).toBe(
        false,
      );
    },
  );

  it.each(["tt1234567", "tt12345678"])(
    "accepts both the 7- and 8-digit imdb_id form: %s",
    (imdb_id) => {
      expect(feedRowSchema.safeParse(validRow({ imdb_id })).success).toBe(true);
    },
  );

  it("rejects an undocumented type literal", () => {
    expect(
      feedRowSchema.safeParse(validRow({ type: "documentary" })).success,
    ).toBe(false);
  });

  it("rejects an undocumented availability_type literal", () => {
    expect(
      feedRowSchema.safeParse(validRow({ availability_type: "lease" })).success,
    ).toBe(false);
  });
});

import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROVIDERS } from "../lib/providers";
import { MOCK_FEED_PATH, feedRowSchema, loadFeed } from "./seed-mock-data";

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

  it.each(["Partner TV", "netflix", "HBO_MAX"])(
    "rejects a provider code the app doesn't list: %s",
    (provider) => {
      expect(feedRowSchema.safeParse(validRow({ provider })).success).toBe(
        false,
      );
    },
  );

  it.each(["il", "US", "ISR"])(
    "rejects a region other than the app's: %s",
    (region) => {
      expect(feedRowSchema.safeParse(validRow({ region })).success).toBe(false);
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

describe("loadFeed", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "playnext-feed-"));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  let fileCount = 0;
  function feedFile(text: string): string {
    const path = join(dir, `feed-${++fileCount}.jsonl`);
    writeFileSync(path, text);
    return path;
  }

  it("ignores a leading UTF-8 BOM", () => {
    const row = JSON.stringify(validRow());
    const bom = String.fromCharCode(0xfeff);
    expect(loadFeed(feedFile(`${bom}${row}\n`))).toHaveLength(1);
  });

  it("skips blank lines and CRLF endings", () => {
    const row = JSON.stringify(validRow());
    expect(loadFeed(feedFile(`${row}\r\n\r\n${row}\r\n`))).toHaveLength(2);
  });

  it("reports the real file line for malformed JSON", () => {
    const row = JSON.stringify(validRow());
    expect(() => loadFeed(feedFile(`${row}\n\n{"provider": ,}\n`))).toThrow(
      /Invalid JSON at line 3/,
    );
  });

  it("reports the real file line for a row that fails the schema", () => {
    const bad = JSON.stringify(validRow({ imdb_id: "nope" }));
    expect(() => loadFeed(feedFile(`\n${bad}\n`))).toThrow(
      /Invalid feed row at line 2/,
    );
  });
});

describe("data/mock-feed.jsonl", () => {
  const codes = new Set(PROVIDERS.map((p) => p.code));
  // Loaded once; a parse failure fails only this block, not the file.
  let rows: ReturnType<typeof loadFeed> = [];
  beforeAll(() => {
    rows = loadFeed(MOCK_FEED_PATH);
  });

  it("loads with the seed's own parser (every row passes its schema)", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("uses only provider codes the app lists", () => {
    for (const row of rows) {
      expect(codes.has(row.provider), row.provider).toBe(true);
    }
  });

  // Deliberately ties PROVIDERS to the mock data while the mock seed is the
  // catalog: a provider added to the app without rows would show an empty
  // browse page. Relax this once the real feed (docs/INGESTION.md) replaces it.
  it("has at least one row for every listed provider", () => {
    const seeded = new Set(rows.map((row) => row.provider));
    for (const code of codes) {
      expect(seeded.has(code), code).toBe(true);
    }
  });

  it("has no duplicate (provider, region, imdb_id, type) keys", () => {
    const keys = rows.map(
      (r) => `${r.provider}|${r.region}|${r.imdb_id}|${r.type}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

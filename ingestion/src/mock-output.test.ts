import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateFeedLines } from "./feed/read";
import { manifestSchema } from "./feed/schema";
import { MOCK_FEED_PATH, mockOutput } from "./mock-output";

const NOW = new Date("2026-11-07T03:00:00Z");
const TODAY = "2026-11-07";
const feedLines = readFileSync(MOCK_FEED_PATH, "utf8").split("\n");

describe("mockOutput", () => {
  it("writes the mock feed's rows as valid collector output", async () => {
    const { files, manifest } = mockOutput(
      feedLines,
      ["YES", "PARTNER_TV"],
      TODAY,
      NOW,
    );

    expect(manifestSchema.safeParse(manifest).success).toBe(true);
    expect(Object.keys(files)).toEqual(["YES.jsonl", "PARTNER_TV.jsonl"]);
    for (const [provider, entry] of Object.entries(manifest.providers)) {
      const read = await validateFeedLines(
        files[`${provider}.jsonl`].split("\n"),
        {
          provider,
          today: TODAY,
        },
      );
      // Every row is valid and matched, so a run stores all of them.
      expect(read).toMatchObject({ invalid: 0, unmatched: 0 });
      expect(entry).toMatchObject({
        status: "ok",
        coverage: "complete",
        records: read.rows.length,
      });
      expect(read.rows.every((r) => r.last_verified === TODAY)).toBe(true);
    }
  });

  it("leaves out providers with no rows", () => {
    const { files, manifest } = mockOutput(
      feedLines,
      ["YES", "HOT"],
      TODAY,
      NOW,
    );
    expect(Object.keys(manifest.providers)).toEqual(["YES"]);
    expect(Object.keys(files)).toEqual(["YES.jsonl"]);
  });
});

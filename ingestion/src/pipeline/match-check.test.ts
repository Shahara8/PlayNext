import { describe, expect, it } from "vitest";
import type { TitleRef } from "../../../lib/title-ref";
import { matchWarnings, normalizeTitle, typeMismatches } from "./match-check";
import type { TitleNames } from "../tmdb/store";

const movie = (tmdb_id: number): TitleRef => ({ media_type: "movie", tmdb_id });
const tv = (tmdb_id: number): TitleRef => ({ media_type: "tv", tmdb_id });

const row = (
  imdb_id: string,
  type: "movie" | "tv_series",
  title: string,
  original_title: string | null = null,
) => ({ imdb_id, type, title, original_title });

const names = (
  ref: TitleRef,
  title: string,
  original_title: string | null = null,
): [string, TitleNames] => [
  `${ref.media_type}:${ref.tmdb_id}`,
  { ref, title, original_title },
];

describe("normalizeTitle", () => {
  it("ignores case, accents, punctuation and spacing, keeping any script", () => {
    expect(normalizeTitle("The Bear!")).toBe(normalizeTitle("the  bear"));
    expect(normalizeTitle("Amélie")).toBe("amelie");
    expect(normalizeTitle("פאודה")).toBe("פאודה");
    expect(normalizeTitle("Law & Order")).toBe(normalizeTitle("Law and Order"));
    expect(normalizeTitle("Downton Abbey: The Grand Finale")).toBe(
      "downtonabbeythegrandfinale",
    );
  });
});

describe("typeMismatches", () => {
  it("finds rows keyed to a title of another type, skipping unkeyed rows", () => {
    const rows = [
      row("tt0000001", "tv_series", "A"),
      row("tt0000002", "movie", "B"),
      row("tt0000003", "tv_series", "C"),
      row("tt0000004", "movie", "D"),
    ];
    const keys = new Map<string, TitleRef | null>([
      ["tt0000001", movie(1)],
      ["tt0000002", movie(2)],
      ["tt0000003", tv(3)],
      ["tt0000004", null],
    ]);
    expect(typeMismatches(rows, keys).map(({ row }) => row.imdb_id)).toEqual([
      "tt0000001",
    ]);
  });
});

/** typeMismatches then matchWarnings, as processRun does: the warnings. */
const check = (
  rows: ReturnType<typeof row>[],
  keys: Map<string, TitleRef | null>,
  found: Map<string, TitleNames>,
) => matchWarnings(typeMismatches(rows, keys), found).warnings;

describe("matchWarnings", () => {
  it("flags a type mismatch whose titles don't match either (the Shtisel case)", () => {
    const warnings = check(
      [row("tt5776858", "tv_series", "Shtisel", "שטיסל")],
      new Map([["tt5776858", movie(400617)]]),
      new Map([names(movie(400617), "Phantom Thread", "Phantom Thread")]),
    );
    expect(warnings).toEqual([
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
    ]);
  });

  it("accepts a mislabeled type when any title matches, either way round", () => {
    const keys = new Map([
      ["tt0000001", movie(1)],
      ["tt0000002", movie(2)],
    ]);
    const rows = [
      // Feed's Hebrew title vs TMDB's original title.
      row("tt0000001", "tv_series", "פאודה", "Fauda"),
      // Punctuation and case differ.
      row("tt0000002", "tv_series", "the bear"),
    ];
    expect(
      check(
        rows,
        keys,
        new Map([
          names(movie(1), "Fauda", "פאודה"),
          names(movie(2), "The Bear!", null),
        ]),
      ),
    ).toEqual([]);
  });

  it("doesn't check rows whose type matches, or whose names weren't found", () => {
    expect(
      check(
        [
          row("tt0000001", "movie", "Something"),
          row("tt0000002", "tv_series", "Other"),
        ],
        new Map([
          ["tt0000001", movie(1)],
          ["tt0000002", movie(2)],
        ]),
        new Map([names(movie(1), "Entirely different")]),
      ),
    ).toEqual([]);
  });

  it("never matches on titles that are only punctuation", () => {
    expect(
      check(
        [row("tt0000001", "tv_series", "!!!")],
        new Map([["tt0000001", movie(1)]]),
        new Map([names(movie(1), "???")]),
      ),
    ).toHaveLength(1);
  });

  it("counts rows whose TMDB names weren't found as unchecked", () => {
    const keys = new Map([["tt0000001", movie(1)]]);
    expect(
      matchWarnings(
        typeMismatches([row("tt0000001", "tv_series", "A")], keys),
        new Map(),
      ),
    ).toEqual({ warnings: [], unchecked: 1 });
  });
});

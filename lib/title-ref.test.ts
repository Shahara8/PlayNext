import { describe, expect, it } from "vitest";
import {
  idsByMediaType,
  parseMediaType,
  parseTitleRef,
  titleKey,
  titlePath,
} from "./title-ref";

describe("titleKey", () => {
  it("joins media type and id", () => {
    expect(titleKey({ media_type: "movie", tmdb_id: 603 })).toBe("movie:603");
  });

  it("tells a movie and a show with the same id apart", () => {
    expect(titleKey({ media_type: "movie", tmdb_id: 1396 })).not.toBe(
      titleKey({ media_type: "tv", tmdb_id: 1396 }),
    );
  });
});

describe("titlePath", () => {
  it("puts the media type before the id", () => {
    expect(titlePath({ media_type: "tv", tmdb_id: 1396 })).toBe(
      "/title/tv/1396",
    );
  });
});

describe("parseMediaType", () => {
  it.each(["movie", "tv"])("accepts %s", (raw) => {
    expect(parseMediaType(raw)).toBe(raw);
  });

  it.each(["", "Movie", "tv_series", "1396", "film"])("rejects %j", (raw) => {
    expect(parseMediaType(raw)).toBeNull();
  });
});

describe("parseTitleRef", () => {
  it("parses a valid pair", () => {
    expect(parseTitleRef("movie", "603")).toEqual({
      media_type: "movie",
      tmdb_id: 603,
    });
  });

  it.each([
    ["tv_series", "1396"],
    ["tv", "0"],
    ["tv", "007"],
    ["tv", "abc"],
    ["tv", "99999999999"],
  ])("rejects %s / %s", (mediaType, id) => {
    expect(parseTitleRef(mediaType, id)).toBeNull();
  });
});

describe("idsByMediaType", () => {
  it("groups and deduplicates ids per media type, movies first", () => {
    expect(
      idsByMediaType([
        { media_type: "tv", tmdb_id: 2 },
        { media_type: "movie", tmdb_id: 1 },
        { media_type: "tv", tmdb_id: 2 },
        { media_type: "tv", tmdb_id: 1 },
      ]),
    ).toEqual([
      ["movie", [1]],
      ["tv", [2, 1]],
    ]);
  });

  it("omits a media type with no ids", () => {
    expect(idsByMediaType([{ media_type: "tv", tmdb_id: 5 }])).toEqual([
      ["tv", [5]],
    ]);
    expect(idsByMediaType([])).toEqual([]);
  });
});

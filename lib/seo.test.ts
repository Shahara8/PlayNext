import { describe, expect, it } from "vitest";
import type { CatalogRow } from "./catalog";
import {
  browseMetadata,
  MAX_DESCRIPTION_LENGTH,
  MAX_SEARCH_TITLE_QUERY,
  PRIVACY_METADATA,
  PRIVACY_PATH,
  searchMetadata,
  SITE_NAME,
  siteUrl,
  titleMetadata,
  truncateDescription,
} from "./seo";

function row(overrides: Partial<CatalogRow> = {}): CatalogRow {
  return {
    availability_id: 1,
    provider: "DISNEY_PLUS",
    region: "IL",
    type: "tv_series",
    availability_type: "subscription",
    watch_url: null,
    seasons_available: null,
    first_seen_date: "2026-10-01",
    last_verified: null,
    tmdb_id: 84958,
    media_type: "tv",
    imdb_id: "tt9140554",
    title: "Loki",
    original_title: "Loki",
    overview: "The mercurial villain Loki resumes his role.",
    poster_path: "/loki.jpg",
    backdrop_path: null,
    release_date: "2021-06-09",
    genres: [],
    vote_average: 8.2,
    popularity: 100,
    ...overrides,
  };
}

describe("siteUrl", () => {
  it("prefers NEXT_PUBLIC_SITE_URL", () => {
    expect(
      siteUrl({
        NEXT_PUBLIC_SITE_URL: "https://playnext.example",
        VERCEL_PROJECT_PRODUCTION_URL: "playnext-beta.vercel.app",
      }),
    ).toBe("https://playnext.example");
  });

  it("adds a missing scheme and drops any path", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "playnext.example" })).toBe(
      "https://playnext.example",
    );
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://playnext.example/" })).toBe(
      "https://playnext.example",
    );
  });

  it("skips a value that isn't a URL instead of throwing", () => {
    expect(
      siteUrl({
        NEXT_PUBLIC_SITE_URL: "not a url",
        VERCEL_PROJECT_PRODUCTION_URL: "playnext-beta.vercel.app",
      }),
    ).toBe("https://playnext-beta.vercel.app");
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "  " })).toBe(
      "http://localhost:3000",
    );
  });

  it("falls back to Vercel's production domain, then localhost", () => {
    expect(
      siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "playnext-beta.vercel.app" }),
    ).toBe("https://playnext-beta.vercel.app");
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});

describe("truncateDescription", () => {
  it("leaves short text alone, collapsing whitespace", () => {
    expect(truncateDescription("  A  short\n text. ")).toBe("A short text.");
  });

  it("cuts long text at a word boundary, within the limit", () => {
    const text = "word ".repeat(60);
    const result = truncateDescription(text);

    expect(result.length).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    expect(result.endsWith("word…")).toBe(true);
  });

  it("drops trailing punctuation before the ellipsis", () => {
    expect(truncateDescription("one two, three four", 10)).toBe("one two…");
  });

  it("hard-cuts a single word longer than the limit", () => {
    expect(truncateDescription("x".repeat(20), 10)).toBe(`${"x".repeat(9)}…`);
  });

  it("counts and cuts by code point, never splitting an emoji", () => {
    expect(truncateDescription("😀".repeat(10), 10)).toBe("😀".repeat(10));
    const result = truncateDescription("😀".repeat(20), 10);

    expect(result).toBe(`${"😀".repeat(9)}…`);
    expect(result.isWellFormed()).toBe(true);
  });
});

describe("searchMetadata", () => {
  it("titles the empty page plainly, with a canonical", () => {
    expect(searchMetadata("")).toEqual({
      title: "Search",
      alternates: { canonical: "/search" },
    });
  });

  it("shows the query as typed and keeps result pages out of the index", () => {
    expect(searchMetadata("what?")).toEqual({
      title: "“what?” – Search",
      robots: { index: false },
    });
  });

  it("cuts a long query without splitting an emoji", () => {
    const q = `${"a".repeat(MAX_SEARCH_TITLE_QUERY - 2)}😀😀😀`;
    const title = searchMetadata(q).title as string;

    expect(title).toBe(
      `“${"a".repeat(MAX_SEARCH_TITLE_QUERY - 2)}😀…” – Search`,
    );
    expect(title.isWellFormed()).toBe(true);
  });
});

describe("browseMetadata", () => {
  it("names the provider and canonicalizes to the unfiltered page", () => {
    const metadata = browseMetadata({ slug: "netflix", label: "Netflix" });

    expect(metadata.title).toBe("Watch on Netflix");
    expect(metadata.description).toMatch(/streaming on Netflix/);
    expect(metadata.alternates?.canonical).toBe("/browse/netflix");
    expect(metadata.openGraph).toMatchObject({
      url: "/browse/netflix",
      type: "website",
    });
  });
});

describe("titleMetadata", () => {
  it("leads the description with where to watch, then the overview", () => {
    const metadata = titleMetadata([
      row(),
      row({ availability_id: 2, provider: "YES" }),
    ]);

    expect(metadata.title).toBe("Loki (2021)");
    expect(metadata.description).toBe(
      "Where to watch Loki (2021): Disney+, yes. The mercurial villain Loki resumes his role.",
    );
  });

  it("lists each provider once, falling back to the raw code", () => {
    const metadata = titleMetadata([
      row({ availability_type: "subscription" }),
      row({ availability_id: 2, availability_type: "rent" }),
      row({ availability_id: 3, provider: "NEWCO" }),
    ]);

    expect(metadata.description).toMatch(/: Disney\+, NEWCO\./);
  });

  it("sets canonical, Open Graph type and poster image", () => {
    const metadata = titleMetadata([row()]);

    expect(metadata.alternates?.canonical).toBe("/title/tv/84958");
    expect(metadata.openGraph).toMatchObject({
      url: "/title/tv/84958",
      type: "video.tv_show",
      images: [{ url: "https://image.tmdb.org/t/p/w500/loki.jpg" }],
    });
    expect(
      titleMetadata([row({ media_type: "movie" })]).openGraph,
    ).toMatchObject({ type: "video.movie" });
  });

  it("copes with no year, overview or poster", () => {
    const metadata = titleMetadata([
      row({ release_date: null, overview: null, poster_path: null }),
    ]);

    expect(metadata.title).toBe("Loki");
    expect(metadata.description).toBe("Where to watch Loki: Disney+.");
    expect(metadata.openGraph).not.toHaveProperty("images");
  });
});

describe("PRIVACY_METADATA", () => {
  it("is indexable with a stable canonical path", () => {
    // The path is pasted into Google's OAuth Branding page; changing it
    // breaks the consent screen's privacy link.
    expect(PRIVACY_PATH).toBe("/privacy");
    expect(PRIVACY_METADATA.alternates?.canonical).toBe(PRIVACY_PATH);
    expect(PRIVACY_METADATA.robots).toBeUndefined();
    expect(PRIVACY_METADATA.description).toContain(SITE_NAME);
  });
});

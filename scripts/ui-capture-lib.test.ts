import { describe, expect, it } from "vitest";
import { PRODUCTION_URL } from "./smoke-lib";
import {
  fullPageClip,
  imageName,
  inlineMarkdown,
  markdownToSections,
  paperHeightInches,
  parseCaptureArgs,
  reviewHtml,
  tileClips,
} from "./ui-capture-lib";

describe("parseCaptureArgs", () => {
  it("defaults to production, .ui-review, and a full run", () => {
    expect(parseCaptureArgs([])).toEqual({
      baseUrl: PRODUCTION_URL,
      outDir: ".ui-review",
      docOnly: false,
    });
  });

  it("reads --url (normalized), --out and --doc-only", () => {
    expect(
      parseCaptureArgs([
        "--url",
        "http://localhost:3000/",
        "--out",
        "shots",
        "--doc-only",
      ]),
    ).toEqual({
      baseUrl: "http://localhost:3000",
      outDir: "shots",
      docOnly: true,
    });
  });

  it("rejects unknown flags and missing values", () => {
    expect(() => parseCaptureArgs(["--nope"])).toThrow(/Unknown argument/);
    expect(() => parseCaptureArgs(["--out"])).toThrow(/needs a value/);
    expect(() => parseCaptureArgs(["--out", "--doc-only"])).toThrow(
      /needs a value/,
    );
    expect(() => parseCaptureArgs(["--url", "https://x.app/path"])).toThrow(
      /origin only/,
    );
  });
});

describe("imageName", () => {
  it("joins the view id and viewport", () => {
    expect(imageName("08-title-with-watch-link", "phone")).toBe(
      "08-title-with-watch-link-phone.png",
    );
  });

  it("rejects ids that aren't lowercase slugs", () => {
    expect(() => imageName("Home", "phone")).toThrow(/slug/);
    expect(() => imageName("a b", "phone")).toThrow(/slug/);
    expect(() => imageName("home", "phone-2")).toThrow(/viewport/);
  });
});

describe("fullPageClip and tileClips", () => {
  it("covers the whole page at the viewport's width", () => {
    expect(fullPageClip(412, 3108.4)).toEqual({
      x: 0,
      y: 0,
      width: 412,
      height: 3109,
      scale: 1,
    });
    expect(fullPageClip(412, 0).height).toBe(1);
  });

  it("cuts the page into contiguous tiles with a shorter last one", () => {
    const tiles = tileClips(412, 2500, 1000);
    expect(tiles.map((t) => [t.y, t.height])).toEqual([
      [0, 1000],
      [1000, 1000],
      [2000, 500],
    ]);
    expect(tiles.every((t) => t.width === 412 && t.x === 0)).toBe(true);
  });

  it("uses one tile for a short page", () => {
    expect(tileClips(1280, 800, 1200)).toHaveLength(1);
    expect(() => tileClips(1280, 800, 0)).toThrow();
  });
});

describe("paperHeightInches", () => {
  it("fits the tallest section plus the margin, in tenths of an inch", () => {
    // (1920 + 96) / 96 = 21in
    expect(paperHeightInches([500, 1920])).toBe(21);
    expect(paperHeightInches([1930])).toBe(21.2);
  });

  it("stays between Letter height and Chrome's 200in limit", () => {
    expect(paperHeightInches([])).toBe(11);
    expect(paperHeightInches([100])).toBe(11);
    expect(paperHeightInches([50_000])).toBe(200);
  });
});

describe("inlineMarkdown", () => {
  it("renders code, bold and emphasis, escaping HTML", () => {
    expect(inlineMarkdown("**Bold** and *em* and `a<b>` & <i>")).toBe(
      "<strong>Bold</strong> and <em>em</em> and <code>a&lt;b&gt;</code> &amp; &lt;i&gt;",
    );
  });

  it("leaves ** inside code alone", () => {
    expect(inlineMarkdown("`**x**`")).toBe("<code>**x**</code>");
  });
});

describe("markdownToSections", () => {
  it("starts a section at each ## heading, keeping the intro first", () => {
    const sections = markdownToSections(
      "# Title\n\nIntro line one\nline two.\n\n## View A\n\nAbout A.\n\n## View B\n\nAbout B.\n",
    );
    expect(sections).toEqual([
      "<h1>Title</h1>\n<p>Intro line one line two.</p>",
      "<h2>View A</h2>\n<p>About A.</p>",
      "<h2>View B</h2>\n<p>About B.</p>",
    ]);
  });

  it("keeps a lone # title on the same page as the first ## section", () => {
    expect(markdownToSections("# Title\n\n## Brief\n\nText\n\n## A\n")).toEqual(
      ["<h1>Title</h1>\n<h2>Brief</h2>\n<p>Text</p>", "<h2>A</h2>"],
    );
  });

  it("renders lists, continued items, rules and ### headings", () => {
    const [section] = markdownToSections(
      "### Notes\n- one\n  continued\n- two\nafter\n\n---\n",
    );
    expect(section).toBe(
      "<h3>Notes</h3>\n<ul><li>one continued</li><li>two</li></ul>\n<p>after</p>\n<hr>",
    );
  });

  it("renders numbered lists, and starts a new list when the kind changes", () => {
    const [section] = markdownToSections(
      "1. **First** job\n   continued\n2. Second\n- a bullet\n",
    );
    expect(section).toBe(
      "<ol><li><strong>First</strong> job continued</li><li>Second</li></ol>\n<ul><li>a bullet</li></ul>",
    );
  });

  it("puts a line of images in one row with captions", () => {
    const [section] = markdownToSections(
      "## A\n![Phone](images/a-phone.png) ![Desktop](images/a-desktop.png)\n",
    );
    expect(section).toContain(
      '<div class="shots"><figure><img src="images/a-phone.png" alt="Phone"><figcaption>Phone</figcaption></figure><figure><img src="images/a-desktop.png" alt="Desktop">',
    );
  });

  it("handles CRLF line endings", () => {
    expect(markdownToSections("## A\r\n\r\nText\r\n")).toEqual([
      "<h2>A</h2>\n<p>Text</p>",
    ]);
  });
});

describe("reviewHtml", () => {
  it("wraps each section and escapes the title", () => {
    const html = reviewHtml(["<h2>A</h2>", "<h2>B</h2>"], "A & B");
    expect(html).toContain("<title>A &amp; B</title>");
    expect(html.match(/<section>/g)).toHaveLength(2);
  });
});

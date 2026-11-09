// Pure helpers for scripts/ui-capture.ts (full-page screenshots of every view
// for the UI review, docs/MVP.md Post-M8 task 5). Free of side effects so
// they can be unit-tested.

import { normalizeBaseUrl, PRODUCTION_URL } from "./smoke-lib";

export type CaptureOptions = {
  baseUrl: string;
  outDir: string;
  /** Skip the browser run and only rebuild the document and PDF. */
  docOnly: boolean;
};

export const CAPTURE_USAGE = `Usage: npm run ui-capture -- [--url <base url>] [--out <dir>] [--doc-only]

  --url       Site to capture (default ${PRODUCTION_URL})
  --out       Output folder (default .ui-review): images/, the document, the PDF
  --doc-only  Don't take screenshots; rebuild the document and PDF from
              docs/UI_REVIEW.md and the images already in the folder`;

/** Parses argv (after the script path). Throws with a usage message on bad input. */
export function parseCaptureArgs(argv: string[]): CaptureOptions {
  const options: CaptureOptions = {
    baseUrl: PRODUCTION_URL,
    outDir: ".ui-review",
    docOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new Error(`${arg} needs a value\n\n${CAPTURE_USAGE}`);
      return v;
    };
    if (arg === "--url") options.baseUrl = normalizeBaseUrl(value());
    else if (arg === "--out") options.outDir = value();
    else if (arg === "--doc-only") options.docOnly = true;
    else throw new Error(`Unknown argument: ${arg}\n\n${CAPTURE_USAGE}`);
  }
  return options;
}

/**
 * The image file for one view at one viewport, e.g. `08-title-phone.png` or
 * `24-dark-home-desktop.png`. The document links to these names, so they must
 * stay stable.
 */
export function imageName(viewId: string, viewport: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(viewId))
    throw new Error(`view id must be a lowercase slug: ${viewId}`);
  if (!/^[a-z]+$/.test(viewport))
    throw new Error(`viewport name must be lowercase letters: ${viewport}`);
  return `${viewId}-${viewport}.png`;
}

/**
 * The clip for a full-page screenshot: the whole document, at the viewport's
 * width (the page never scrolls sideways; the smoke checks guard that).
 */
export function fullPageClip(viewportWidth: number, contentHeight: number) {
  return {
    x: 0,
    y: 0,
    width: viewportWidth,
    height: Math.max(1, Math.ceil(contentHeight)),
    scale: 1,
  };
}

/**
 * A full-page clip cut into vertical tiles of at most `tileHeight` CSS px.
 * One full-page PNG of a poster-heavy page is too big for a single DevTools
 * message (the socket drops), so the page is shot in tiles and stitched.
 */
export function tileClips(
  viewportWidth: number,
  contentHeight: number,
  tileHeight = 1200,
) {
  if (tileHeight <= 0) throw new Error("tileHeight must be positive");
  const { height } = fullPageClip(viewportWidth, contentHeight);
  const tiles: ReturnType<typeof fullPageClip>[] = [];
  for (let y = 0; y < height; y += tileHeight)
    tiles.push({
      x: 0,
      y,
      width: viewportWidth,
      height: Math.min(tileHeight, height - y),
      scale: 1,
    });
  return tiles;
}

/** Chrome's largest PDF page height, in inches. */
export const PDF_MAX_INCHES = 200;

/**
 * Paper height for the PDF, in inches: tall enough that the tallest section
 * (one view per page) fits without splitting, at least US Letter's 11in and at
 * most Chrome's 200in limit. `marginPx` covers the page's own padding.
 */
export function paperHeightInches(
  sectionHeightsPx: number[],
  marginPx = 96,
): number {
  const tallest = Math.max(0, ...sectionHeightsPx);
  const inches = Math.ceil(((tallest + marginPx) / 96) * 10) / 10;
  return Math.min(PDF_MAX_INCHES, Math.max(11, inches));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline markup: `code`, **bold**, *emphasis*. Escapes everything else. */
export function inlineMarkdown(text: string): string {
  // Code spans first, so ** inside them stays literal.
  return text
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 1
        ? `<code>${escapeHtml(part.slice(1, -1))}</code>`
        : escapeHtml(part)
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
            .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>"),
    )
    .join("");
}

const IMAGE = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/** True for a line made only of images, e.g. `![a](x.png) ![b](y.png)`. */
function isImageLine(line: string): boolean {
  return line.trim() !== "" && line.replace(IMAGE, "").trim() === "";
}

/**
 * Converts docs/UI_REVIEW.md to HTML sections for the PDF. Supports only what
 * that document uses: #/##/### headings, paragraphs, one-level `- ` and
 * `1. ` lists (indented lines continue an item), `---` rules, inline code/bold/emphasis,
 * and lines of images (rendered as one row, the phone shot next to the
 * desktop one). Each `## ` heading starts a new section, so each view gets a
 * page of its own.
 */
export function markdownToSections(markdown: string): string[] {
  const sections: string[][] = [[]];
  let paragraph: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const out = () => sections[sections.length - 1];
  const flushParagraph = () => {
    if (paragraph.length)
      out().push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list)
      out().push(
        `<${list.tag}>${list.items.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</${list.tag}>`,
      );
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const raw of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3}) (.*)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      // A ## starts a new section, unless all so far is the document's title.
      const onlyTitle = out().length === 1 && out()[0].startsWith("<h1>");
      if (level === 2 && out().length > 0 && !onlyTitle) sections.push([]);
      out().push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (line.trim() === "") {
      flush();
    } else if (line.trim() === "---") {
      flush();
      out().push("<hr>");
    } else if (isImageLine(line)) {
      flush();
      const images = [...line.matchAll(IMAGE)].map(
        ([, alt, src]) =>
          `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"><figcaption>${escapeHtml(alt)}</figcaption></figure>`,
      );
      out().push(`<div class="shots">${images.join("")}</div>`);
    } else if (/^(- |\d+\. )/.test(line)) {
      flushParagraph();
      const tag = line.startsWith("- ") ? "ul" : "ol";
      // A switch between - and 1. starts a new list.
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push(line.replace(/^(- |\d+\. )/, "").trim());
    } else if (list && /^\s+\S/.test(line)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flush();
  return sections.filter((s) => s.length > 0).map((s) => s.join("\n"));
}

/** The PDF's HTML page: one `<section>` per view, phone and desktop side by side. */
export function reviewHtml(sections: string[], title: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #171717; margin: 0; }
  section { padding: 32px 40px; break-after: page; }
  section:last-child { break-after: auto; }
  h1 { font-size: 26px; margin: 0 0 12px; }
  h2 { font-size: 22px; margin: 0 0 12px; }
  h3 { font-size: 16px; margin: 18px 0 6px; }
  p, li { font-size: 13px; line-height: 1.5; margin: 0 0 8px; }
  ul { margin: 0 0 8px; padding-left: 20px; }
  code { font-family: Consolas, monospace; font-size: 12px; background: #f2f2f2; padding: 0 3px; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 16px 0; }
  .shots { display: flex; gap: 24px; align-items: flex-start; margin: 16px 0; }
  figure { margin: 0; }
  /* Phone shots (412 css px wide at DPR 2) at their natural width; desktop
     (1280 px) scaled to fill the rest. */
  figure:has(img[src*="-phone"]) { flex: 0 0 412px; }
  figure:has(img[src*="-desktop"]) { flex: 1 1 0; min-width: 0; }
  img { width: 100%; border: 1px solid #ccc; display: block; }
  figcaption { font-size: 11px; color: #666; margin-top: 4px; }
</style></head>
<body>
${sections.map((s) => `<section>\n${s}\n</section>`).join("\n")}
</body></html>
`;
}

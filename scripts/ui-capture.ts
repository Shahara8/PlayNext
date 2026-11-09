// Full-page screenshots of every view and state, for the UI review with
// Gemini (docs/MVP.md Post-M8 task 5). Reuses the smoke script's headless
// Chrome helpers: phone and desktop widths, signed out and then signed in as
// the test account, each view in the light and the dark theme (the device
// preference, emulated; no theme setting is stored in the throwaway profile).
//
// Output (default .ui-review/, gitignored): images/, plus the review document
// (copied from docs/UI_REVIEW.md, which links to the images by name) and the
// same document as one PDF with the images inline, for chat apps that cap how
// many files one message can carry.
//
// Side effects on the live site: none for signed-out views. Signed in, the
// "empty My List" shot removes the test account's watchlist titles through
// the real UI and puts them back afterwards (in a `finally`), as the smoke
// script's watchlist journey does; the reset-form shots use admin-minted
// recovery links, so no email is sent and no password is set.
//
// Usage: npm run ui-capture -- [--url <base url>] [--out <dir>] [--doc-only]

import { config } from "dotenv";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join, resolve } from "path";
import { pathToFileURL } from "url";
import { createClient } from "@supabase/supabase-js";
import sharp, { type OverlayOptions } from "sharp";
import { CdpClient, VIEWPORTS, type Viewport } from "./smoke-lib";
import { has, launchChrome, openPage, Page, signIn, stopChrome } from "./smoke";
import {
  fullPageClip,
  imageName,
  markdownToSections,
  paperHeightInches,
  parseCaptureArgs,
  PDF_MAX_INCHES,
  referencedImages,
  reviewHtml,
  THEMES,
  tileClips,
  type CaptureOptions,
  type CaptureTheme,
} from "./ui-capture-lib";

const DOC_SOURCE = "docs/UI_REVIEW.md";
const DOC_NAME = "PlayNext-UI-review";

// Titles with and without a watch link. Hard-coded on purpose (the document
// describes them); `ready` checks the link is (or isn't) there, so a catalog
// change fails loudly instead of capturing the wrong state.
const TITLE_WITH_LINK = "/title/tv/1396"; // Breaking Bad, Netflix (mock)
const TITLE_WITHOUT_LINK = "/title/movie/858024"; // Hamnet, Partner TV

const watchLink = `[...document.querySelectorAll('main a')].some((a) => a.textContent.includes('Watch'))`;

type ViewSpec = {
  id: string;
  path: string;
  ready: string;
  /** Runs after `ready`, before the shot (e.g. switch a tab). */
  prepare?: (page: Page) => Promise<void>;
};

/** Clicks the first `main button` whose text is `text`, once hydrated. */
async function clickButton(page: Page, text: string) {
  await page.waitInteractive("main button");
  await page.eval(`(() => {
    const b = [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)});
    if (!b) throw new Error("no button " + ${JSON.stringify(text)});
    b.click();
  })()`);
}

const SIGNED_OUT: ViewSpec[] = [
  {
    id: "01-home",
    path: "/",
    ready: `${has.heading2("Trending")} && ${has.titleLinks}`,
  },
  { id: "02-browse", path: "/browse/netflix", ready: has.titleLinks },
  {
    id: "03-browse-sorted-filtered",
    path: "/browse/netflix?sort=rating&type=tv_series",
    ready: has.titleLinks,
  },
  {
    id: "04-browse-no-matches",
    path: "/browse/netflix?avail=free",
    ready: has.text("Nothing matches these filters"),
  },
  {
    id: "05-search-start",
    path: "/search",
    ready: has.text("Start typing to search"),
  },
  {
    id: "06-search-results",
    path: "/search?q=strnger",
    ready: has.titleLink("Stranger Things"),
  },
  {
    id: "07-search-no-results",
    path: "/search?q=qwzxv",
    ready: has.text("No results for"),
  },
  {
    id: "08-title-with-watch-link",
    path: TITLE_WITH_LINK,
    ready: `document.querySelector('main h1') && ${watchLink}`,
  },
  {
    id: "09-title-without-watch-link",
    path: TITLE_WITHOUT_LINK,
    ready: `document.querySelector('main h1') && document.querySelector('main h2') && !${watchLink}`,
  },
  {
    id: "10-login",
    path: "/login",
    ready: `document.querySelector('input[type=email]') && ${has.passwordInput}`,
  },
  {
    id: "11-login-sign-up",
    path: "/login",
    ready: `document.querySelector('input[type=email]') && ${has.passwordInput}`,
    prepare: async (page) => {
      await clickButton(page, "Sign up");
      await page.waitFor(has.text("Create account"), "the sign-up form");
    },
  },
  {
    id: "12-login-forgot-password",
    path: "/login?mode=reset",
    ready: has.text("Send reset link"),
  },
  {
    id: "13-login-link-error",
    path: "/login?error=auth_callback",
    ready: `document.querySelector('input[type=email]') && ${has.passwordInput}`,
  },
  {
    id: "14-reset-password-no-link",
    path: "/reset-password",
    ready: has.text("open the link in your reset email"),
  },
  {
    id: "15-privacy",
    path: "/privacy",
    ready: has.h1("Privacy policy"),
  },
  { id: "16-not-found", path: "/no-such-page", ready: has.h1("Not found") },
];

const SIGNED_IN: ViewSpec[] = [
  {
    id: "17-home-signed-in",
    path: "/",
    ready: `${has.heading2("For You")} && ${has.titleLinks} && ${has.signOut}`,
  },
  {
    id: "18-browse-signed-in",
    path: "/browse/netflix",
    ready: `${has.titleLinks} && ${has.enabledButton("Favorite")} && ${has.signOut}`,
  },
  {
    id: "19-title-signed-in",
    path: TITLE_WITH_LINK,
    ready: `${has.enabledButton("Favorite")} && ${has.signOut}`,
  },
  {
    id: "20-my-list-watchlist",
    path: "/my-list",
    ready: `${has.myList("/my-list")} && ${has.signOut}`,
  },
  {
    id: "21-my-list-favorites",
    path: "/my-list?view=favorites",
    ready: `${has.myList("/my-list?view=favorites")} && ${has.signOut}`,
  },
];

// --- Capture -----------------------------------------------------------------

class Capturer {
  saved: string[] = [];
  /** Set when the DevTools socket drops: every later call would just time out. */
  socketClosed = false;

  constructor(
    private readonly page: Page,
    private readonly cdp: CdpClient,
    private readonly imagesDir: string,
    /** Shared with main(), so a later crash can't drop failures recorded here. */
    readonly failures: string[],
  ) {}

  async setTheme(theme: CaptureTheme) {
    await this.cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: theme }],
    });
  }

  /** Loads lazy posters, waits for images and fonts, then shoots the whole page. */
  async shoot(viewId: string, theme: CaptureTheme) {
    const page = this.page;
    await page.eval(
      `document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = "eager"; })`,
    );
    await page
      .waitFor(
        `[...document.images].every((img) => img.complete) && document.fonts.status === 'loaded'`,
        "images to load",
        15_000,
      )
      .catch(() => console.log(`  (some images still loading on ${viewId})`));
    // Let late layout (image decode, font swap) settle.
    await new Promise((r) => setTimeout(r, 400));
    await page.assertHealthy();

    const { cssContentSize } = await this.cdp.send<{
      cssContentSize: { height: number };
    }>("Page.getLayoutMetrics");
    const dpr = page.viewport.deviceScaleFactor;
    const full = fullPageClip(page.viewport.width, cssContentSize.height);
    const tiles: OverlayOptions[] = [];
    for (const clip of tileClips(full.width, full.height)) {
      const { data } = await this.cdp.send<{ data: string }>(
        "Page.captureScreenshot",
        { format: "png", captureBeyondViewport: true, clip },
      );
      tiles.push({
        input: Buffer.from(data, "base64"),
        top: Math.round(clip.y * dpr),
        left: 0,
      });
    }
    const name = imageName(viewId, page.viewport.name, theme);
    await sharp({
      create: {
        width: Math.round(full.width * dpr),
        height: Math.round(full.height * dpr),
        channels: 4,
        background: "#ffffff",
      },
    })
      .composite(tiles)
      .png()
      .toFile(join(this.imagesDir, name));
    this.saved.push(name);
    console.log(`saved ${name}`);
  }

  /**
   * Loads the view once and shoots it in each theme. The theme is switched
   * in place (CSS follows the emulated preference), not by reloading, so a
   * state set up by `prepare` or a single-use link is shot in both.
   */
  async view(spec: ViewSpec) {
    if (this.socketClosed) throw new Error("DevTools socket closed");
    try {
      await this.setTheme(THEMES[0]);
      await this.page.goto(spec.path);
      await this.page.waitFor(spec.ready, spec.id);
      await spec.prepare?.(this.page);
      for (const theme of THEMES) {
        await this.setTheme(theme);
        // The emulated preference applies on the next frame; check it took.
        await this.page.waitFor(
          `matchMedia('(prefers-color-scheme: ${theme})').matches`,
          `the ${theme} theme`,
        );
        await this.shoot(spec.id, theme);
      }
    } catch (err) {
      this.fail(`${this.page.viewport.name} ${spec.id}`, err);
    } finally {
      await this.setTheme(THEMES[0]).catch(() => {});
    }
  }

  fail(what: string, err: unknown) {
    const msg = `${what}: ${err instanceof Error ? err.message : String(err)}`;
    this.failures.push(msg);
    console.log(`FAIL  ${msg}`);
  }
}

async function forEachViewport(page: Page, fn: (v: Viewport) => Promise<void>) {
  for (const viewport of VIEWPORTS) {
    await page.setViewport(viewport);
    await fn(viewport);
  }
}

/** Sets a title's watchlist state through its page's button. */
async function setWatchlist(page: Page, titlePath: string, to: boolean) {
  const button = `[aria-label="Watchlist"]`;
  await page.goto(titlePath);
  await page.waitFor(has.enabledButton("Watchlist"), "the watchlist button");
  const pressed = await page.eval<boolean>(
    `document.querySelector('${button}').getAttribute('aria-pressed') === 'true'`,
  );
  if (pressed === to) return;
  await page.click(button);
  await page.waitFor(
    `document.querySelector('${button}:not([disabled])')?.getAttribute('aria-pressed') === '${to}'`,
    `the watchlist write (${to ? "add" : "remove"})`,
  );
}

/**
 * The empty-watchlist state: removes every watchlist title through the UI,
 * shoots My List at both widths, then puts them all back (even on failure).
 */
async function emptyWatchlist(page: Page, capturer: Capturer) {
  await page.setViewport(VIEWPORTS[0]);
  await page.goto("/my-list");
  await page.waitFor(has.myList("/my-list"), "My List");
  const saved = await page.eval<string[]>(
    `[...new Set([...document.querySelectorAll('main a[href^="/title/"]')].map((a) => a.getAttribute('href')))]`,
  );
  console.log(`watchlist has ${saved.length} title(s); removing for the shot`);
  try {
    for (const path of saved) await setWatchlist(page, path, false);
    await forEachViewport(page, () =>
      capturer.view({
        id: "22-my-list-empty",
        path: "/my-list",
        ready: `${has.myList("/my-list")} && ${has.text("Your watchlist is empty")}`,
      }),
    );
  } finally {
    await page.setViewport(VIEWPORTS[0]);
    // My List lists newest first, so re-add oldest first: the order (and
    // which title is newest) comes back as it was. The dates still change.
    for (const path of [...saved].reverse())
      await setWatchlist(page, path, true).catch((err) =>
        capturer.fail(`restore watchlist ${path}`, err),
      );
    console.log(`watchlist restored (${saved.length} title(s))`);
  }
}

/** The new-password form, via an admin-minted recovery link per width. */
async function resetForm(
  page: Page,
  capturer: Capturer,
  options: CaptureOptions,
  email: string,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase URL/service-role key missing");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await forEachViewport(page, async () => {
    // A link works once, so one per width.
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${options.baseUrl}/reset-password` },
    });
    if (error) throw new Error(`generateLink: ${error.message}`);
    await capturer.view({
      id: "23-reset-password-form",
      path: data.properties.action_link,
      // The origin too: a redirect URL Supabase doesn't allow falls back to
      // the production Site URL, which would be shot without a word.
      ready: `location.origin === ${JSON.stringify(options.baseUrl)} && location.pathname === '/reset-password' && ${has.passwordInput}`,
      // The form names the account ("For <email>"); these images go to a
      // third party, so show a placeholder instead of the test account's,
      // and refuse the shot if the address is still anywhere on the page
      // (e.g. after the form's markup or wording changes).
      prepare: async (page) => {
        await page.eval(
          `document.querySelectorAll('main p').forEach((p) => { if (/^For \\S+@\\S+$/.test(p.textContent.trim())) p.textContent = 'For test-user@example.com'; })`,
        );
        if (
          await page.eval<boolean>(
            `document.body.innerText.includes(${JSON.stringify(email)})`,
          )
        )
          throw new Error(
            "the test account's email is still on the page; update the mask",
          );
      },
    });
  });
}

// --- Document ------------------------------------------------------------------

/** Copies the document next to the images and renders it to one PDF. */
async function buildDocument(options: CaptureOptions, cdp: CdpClient) {
  const markdown = readFileSync(DOC_SOURCE, "utf8");
  const mdOut = join(options.outDir, `${DOC_NAME}.md`);
  copyFileSync(DOC_SOURCE, mdOut);

  // The HTML sits in the output folder so its images/… links resolve.
  const htmlOut = resolve(options.outDir, `${DOC_NAME}.html`);
  writeFileSync(
    htmlOut,
    reviewHtml(markdownToSections(markdown), "PlayNext UI review"),
  );

  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await cdp.send("Emulation.setEmulatedMedia", { media: "print" });
  const loaded = cdp.waitForEvent("Page.loadEventFired", 60_000);
  await cdp.send("Page.navigate", { url: pathToFileURL(htmlOut).href });
  await loaded;
  // Measure at the print width so the page height fits the tallest section.
  const widthIn = 16;
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: widthIn * 96,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const { result } = await cdp.send<{ result: { value: number[] } }>(
    "Runtime.evaluate",
    {
      expression: `Promise.all([...document.images].map((i) => i.decode().catch(() => {}))).then(() => [...document.querySelectorAll('section')].map((s) => s.getBoundingClientRect().height))`,
      awaitPromise: true,
      returnByValue: true,
    },
  );
  // As a stream, read in chunks: the whole PDF in one DevTools message would
  // be far over the size that drops the socket (see tileClips).
  const paperHeight = paperHeightInches(result.value);
  if (paperHeight === PDF_MAX_INCHES)
    console.log(
      `  (a section is taller than the PDF's ${PDF_MAX_INCHES}in page limit, so it splits across pages)`,
    );
  const { stream } = await cdp.send<{ stream: string }>(
    "Page.printToPDF",
    {
      paperWidth: widthIn,
      paperHeight,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      printBackground: true,
      transferMode: "ReturnAsStream",
    },
    120_000,
  );
  const chunks: Buffer[] = [];
  for (;;) {
    const chunk = await cdp.send<{
      data: string;
      base64Encoded?: boolean;
      eof: boolean;
    }>("IO.read", { handle: stream, size: 1 << 20 });
    chunks.push(
      Buffer.from(chunk.data, chunk.base64Encoded ? "base64" : "binary"),
    );
    if (chunk.eof) break;
  }
  await cdp.send("IO.close", { handle: stream });
  const pdfOut = join(options.outDir, `${DOC_NAME}.pdf`);
  writeFileSync(pdfOut, Buffer.concat(chunks));
  // Only the PDF's source: the folder should hold just what gets uploaded.
  rmSync(htmlOut, { force: true });
  console.log(`wrote ${mdOut}\nwrote ${pdfOut}`);
}

// --- Main --------------------------------------------------------------------

async function main() {
  config({ path: ".env.local", quiet: true });
  let options: CaptureOptions;
  try {
    options = parseCaptureArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!options.docOnly && (!email || !password)) {
    console.error("TEST_USER_EMAIL/TEST_USER_PASSWORD missing from .env.local");
    process.exit(2);
  }
  const imagesDir = join(options.outDir, "images");
  // A full run starts from an empty images/ (PNGs only: our own output), so
  // shots the capture no longer takes don't linger next to the new ones.
  if (!options.docOnly && existsSync(imagesDir))
    for (const f of readdirSync(imagesDir))
      if (f.endsWith(".png")) rmSync(join(imagesDir, f));
  mkdirSync(imagesDir, { recursive: true });

  const chrome = await launchChrome();
  let socket: WebSocket | undefined;
  const failures: string[] = [];
  try {
    const opened = await openPage(chrome.wsUrl);
    socket = opened.socket;
    const page = new Page(opened.cdp, {
      baseUrl: options.baseUrl,
      outDir: imagesDir,
      signedOutOnly: false,
    });
    const capturer = new Capturer(page, opened.cdp, imagesDir, failures);
    socket.addEventListener("close", () => {
      capturer.socketClosed = true;
    });

    if (!options.docOnly) {
      console.log(`Capturing ${options.baseUrl}\n`);
      await forEachViewport(page, async () => {
        for (const spec of SIGNED_OUT) await capturer.view(spec);
      });

      await page.setViewport(VIEWPORTS[0]);
      await signIn(page, email!, password!);
      await forEachViewport(page, async () => {
        for (const spec of SIGNED_IN) await capturer.view(spec);
      });
      await emptyWatchlist(page, capturer).catch((err) =>
        capturer.fail("empty watchlist", err),
      );
      // Last: it swaps the password session for a recovery one.
      await resetForm(page, capturer, options, email!).catch((err) =>
        capturer.fail("reset form", err),
      );

      // The document must not name a shot this run didn't take.
      const saved = new Set(capturer.saved);
      for (const name of referencedImages(readFileSync(DOC_SOURCE, "utf8")))
        if (!saved.has(name))
          failures.push(
            `${DOC_SOURCE} links to ${name}, which wasn't captured`,
          );
    }

    await buildDocument(options, opened.cdp);
  } catch (err) {
    failures.push(`run: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    socket?.close();
    // Only the Chrome this script started, and its throwaway profile.
    await stopChrome(chrome.proc, chrome.profileDir);
  }

  if (failures.length) {
    console.log(`\n${failures.length} failure(s):\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log(`\nDone. Folder: ${resolve(options.outDir)}`);
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

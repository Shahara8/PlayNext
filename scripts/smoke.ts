// Live smoke checks against the real site (docs/MVP.md Section 8 "Testing"):
// drives headless Chrome over the DevTools Protocol, at phone and desktop
// widths, signed out and then signed in as the test account. Per page it
// waits for key content, asserts no horizontal overflow and no error page,
// and saves a screenshot for review. Signed in, it also runs the watchlist
// journey (title page → My List, then undoes it) and the reset-link gate
// (an admin-minted recovery link, so no email is sent; no password is set).
//
// Not part of `npm test`: it talks to the live site and Supabase.
// Needs Google Chrome (or CHROME_PATH) and, unless --signed-out,
// TEST_USER_EMAIL/TEST_USER_PASSWORD plus the Supabase keys in .env.local.
//
// Usage: npm run smoke -- [--url <base url>] [--out <dir>] [--signed-out]

import { config } from "dotenv";
import { spawn, type ChildProcess } from "child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";
import { createClient } from "@supabase/supabase-js";
import { PROVIDERS } from "../lib/providers";
import { createPublicClient } from "../lib/supabase";
import { LEGACY_TITLE_IDS } from "../lib/legacy-title-ids";
import { titlePath as newTitlePath, type TitleRef } from "../lib/title-ref";
import {
  CdpClient,
  chromeCandidates,
  legacyMapDrift,
  pickLegacyTitle,
  parseDevToolsUrl,
  parseSmokeArgs,
  screenshotName,
  summarize,
  VIEWPORTS,
  type CheckResult,
  type SmokeOptions,
  type Viewport,
} from "./smoke-lib";

const NAV_TIMEOUT_MS = 30_000;
const WAIT_TIMEOUT_MS = 20_000;

// --- Chrome -----------------------------------------------------------------

export async function launchChrome(): Promise<{
  proc: ChildProcess;
  wsUrl: string;
  profileDir: string;
}> {
  const exe = chromeCandidates(process.platform, process.env).find((p) =>
    existsSync(p),
  );
  if (!exe) throw new Error("Chrome not found; set CHROME_PATH");

  // A throwaway profile, so no cookies leak in or out, and port 0 so it never
  // collides with anything already running.
  const profileDir = mkdtempSync(join(tmpdir(), "playnext-smoke-"));
  const proc = spawn(
    exe,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );

  try {
    const wsUrl = await new Promise<string>((resolve, reject) => {
      let stderr = "";
      const done = () => {
        clearTimeout(timer);
        proc.stderr!.off("data", onData);
        proc.off("exit", onExit);
        proc.off("error", onError);
        // Keep draining so a full pipe can never block Chrome.
        proc.stderr!.resume();
      };
      const onData = (chunk: Buffer) => {
        stderr += chunk.toString();
        const url = parseDevToolsUrl(stderr);
        if (url) {
          done();
          resolve(url);
        }
      };
      const onExit = (code: number | null) => {
        done();
        reject(new Error(`Chrome exited (${code}):\n${stderr}`));
      };
      const onError = (err: Error) => {
        done();
        reject(new Error(`Couldn't start Chrome (${exe}): ${err.message}`));
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(`Chrome didn't start within 15s:\n${stderr}`));
      }, 15_000);
      proc.stderr!.on("data", onData);
      proc.on("exit", onExit);
      proc.on("error", onError);
    });
    return { proc, wsUrl, profileDir };
  } catch (err) {
    await stopChrome(proc, profileDir);
    throw err;
  }
}

/** Stops the Chrome this script started and removes its throwaway profile. */
export async function stopChrome(proc: ChildProcess, profileDir: string) {
  // Swallow a late spawn error so it can't crash the process.
  proc.on("error", () => {});
  if (proc.exitCode === null) proc.kill();
  await new Promise((r) => setTimeout(r, 500));
  try {
    rmSync(profileDir, { recursive: true, force: true });
  } catch {
    // Windows can hold the profile briefly; it's in the temp folder anyway.
  }
}

/** Opens a new tab and connects to it; returns its CDP client. */
export async function openPage(browserWsUrl: string): Promise<{
  cdp: CdpClient;
  socket: WebSocket;
}> {
  const { host } = new URL(browserWsUrl);
  const res = await fetch(`http://${host}/json/new?about:blank`, {
    method: "PUT",
  });
  if (!res.ok) throw new Error(`Couldn't open a tab: ${res.status}`);
  const { webSocketDebuggerUrl } = (await res.json()) as {
    webSocketDebuggerUrl: string;
  };

  const socket = new WebSocket(webSocketDebuggerUrl);
  const cdp = new CdpClient((data) => socket.send(data));
  socket.addEventListener("message", (e) => cdp.receive(String(e.data)));
  socket.addEventListener("close", () => cdp.close("DevTools socket closed"));
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("socket error")), {
      once: true,
    });
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  return { cdp, socket };
}

// --- Page helpers ------------------------------------------------------------

export class Page {
  viewport: Viewport = VIEWPORTS[0];

  constructor(
    private readonly cdp: CdpClient,
    private readonly options: SmokeOptions,
  ) {}

  async setViewport(viewport: Viewport) {
    this.viewport = viewport;
    await this.cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      mobile: viewport.mobile,
    });
    await this.cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: viewport.mobile,
    });
  }

  /** Emulates the device's color-scheme preference (null: the default). */
  async setColorScheme(scheme: "light" | "dark" | null) {
    await this.cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: scheme ?? "" }],
    });
  }

  async eval<T>(expression: string): Promise<T> {
    const { result, exceptionDetails } = await this.cdp.send<{
      result: { value?: unknown };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails)
      throw new Error(
        exceptionDetails.exception?.description ?? exceptionDetails.text,
      );
    return result.value as T;
  }

  /** Polls `expression` until it's truthy. */
  async waitFor(expression: string, what: string, timeoutMs = WAIT_TIMEOUT_MS) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        if (await this.eval<boolean>(`Boolean(${expression})`)) return;
      } catch {
        // Mid-navigation the context can vanish; just poll again.
      }
      if (Date.now() > deadline)
        throw new Error(
          `timed out waiting for ${what} on ${await this.path()}`,
        );
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  async path(): Promise<string> {
    try {
      return await this.eval<string>("location.pathname + location.search");
    } catch {
      return "(unknown)";
    }
  }

  /** Full navigation to a path on the site, or to an absolute URL. */
  async goto(pathOrUrl: string) {
    const url = pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${this.options.baseUrl}${pathOrUrl}`;
    const loaded = this.cdp.waitForEvent("Page.loadEventFired", NAV_TIMEOUT_MS);
    const { errorText } = await this.cdp.send<{ errorText?: string }>(
      "Page.navigate",
      { url },
    );
    if (errorText) {
      loaded.catch(() => {});
      throw new Error(`navigation to ${url} failed: ${errorText}`);
    }
    await loaded;
  }

  async screenshot(label: string): Promise<string> {
    const { data } = await this.cdp.send<{ data: string }>(
      "Page.captureScreenshot",
      { format: "png" },
    );
    const file = join(
      this.options.outDir,
      screenshotName(this.viewport.name, label),
    );
    writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  }

  /** Layout checks every page gets: no error page, no sideways scroll. */
  async assertHealthy() {
    const h1 = await this.eval<string>(
      "document.querySelector('h1')?.textContent ?? ''",
    );
    if (h1.includes("Something went wrong"))
      throw new Error("rendered the error page");
    const { scrollWidth, innerWidth } = await this.eval<{
      scrollWidth: number;
      innerWidth: number;
    }>(
      "({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth })",
    );
    if (scrollWidth > innerWidth)
      throw new Error(
        `horizontal overflow: scrollWidth ${scrollWidth} > ${innerWidth}`,
      );
  }

  /**
   * Waits until React has hydrated the element (it carries React's
   * `__reactProps$…` key) and it's enabled. Server HTML shows up first, and
   * input before hydration is lost: a click does nothing and a filled value
   * is overwritten. Relies on a React internal, which is fine for a smoke
   * script; if a React upgrade renames it, this times out loudly.
   */
  async waitInteractive(selector: string) {
    await this.waitFor(
      `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return el && !el.disabled && Object.keys(el).some((k) => k.startsWith("__reactProps")); })()`,
      `${selector} to be interactive`,
    );
  }

  /** Sets a React-controlled input's value so its onChange fires. */
  async fill(selector: string, value: string) {
    await this.waitInteractive(selector);
    await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("no element for " + ${JSON.stringify(selector)});
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
  }

  async click(selector: string) {
    await this.waitInteractive(selector);
    await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("no element for " + ${JSON.stringify(selector)});
      el.click();
    })()`);
  }
}

// --- Checks ------------------------------------------------------------------

/** JS expressions for "this page's key content has rendered". */
export const has = {
  heading2: (text: string) =>
    `[...document.querySelectorAll('h2')].some((h) => h.textContent.trim() === ${JSON.stringify(text)})`,
  h1: (text: string) =>
    `document.querySelector('h1')?.textContent.includes(${JSON.stringify(text)})`,
  titleLinks: `document.querySelectorAll('main a[href^="/title/"]').length > 0`,
  titleLink: (text: string) =>
    `[...document.querySelectorAll('main a[href^="/title/"]')].some((a) => a.textContent.includes(${JSON.stringify(text)}))`,
  text: (text: string) =>
    `document.body.innerText.includes(${JSON.stringify(text)})`,
  signOut: `[...document.querySelectorAll('header button')].some((b) => b.textContent.includes('Sign out'))`,
  /** The header's search icon link (named for screen readers) and My List. */
  headerNav: `document.querySelector('header a[href="/search"][aria-label="Search"]') && document.querySelector('header a[href="/my-list"]')`,
  passwordInput: `document.querySelector('input[type=password]')`,
  /** A title action button (TitleActions' `data-action`), once enabled. */
  enabledAction: (action: string) =>
    `document.querySelector(${JSON.stringify(`[data-action="${action}"]:not([disabled])`)})`,
  /** My List with the given tab marked current (so the right view rendered). */
  myList: (href: string) =>
    `document.querySelector(${JSON.stringify(`main a[href="${href}"][aria-current="page"]`)})`,
  /** A picker tile for every provider in lib/providers.ts. */
  providerTiles: PROVIDERS.map(
    (p) =>
      `document.querySelector(${JSON.stringify(`main a[href="/browse/${p.slug}"]`)})`,
  ).join(" && "),
};

type PageSpec = { label: string; path: string; ready: string };

function signedOutPages(
  titlePath: string,
  legacy: TitleRef | null,
): PageSpec[] {
  return [
    {
      label: "home",
      path: "/",
      // The footer's privacy link: Google's OAuth review wants the homepage
      // to link to the privacy policy.
      ready: `${has.heading2("Trending")} && ${has.titleLinks} && document.querySelector('footer a[href="/privacy"]') && ${has.headerNav} && ${has.providerTiles}`,
    },
    { label: "browse", path: "/browse/netflix", ready: has.titleLinks },
    {
      label: "browse partner tv",
      path: "/browse/partner-tv",
      // Partner TV (added 2026-11-06) shows its own titles. Yellowstone is a
      // mock-seed row: switch this to has.titleLinks at the real-feed cutover.
      ready: has.titleLink("Yellowstone"),
    },
    {
      label: "browse sorted",
      path: "/browse/netflix?sort=rating",
      ready: `${has.titleLinks} && document.querySelector('main select')`,
    },
    {
      // A typo, to check search stays typo-tolerant.
      label: "search",
      path: "/search?q=strnger",
      ready: has.titleLink("Stranger Things"),
    },
    {
      label: "title",
      path: titlePath,
      ready: `document.querySelector('main h1') && ${has.heading2("Where to watch")} && document.querySelector('[data-action="favorite"]')`,
    },
    // Links shared before 2026-11-06 were /title/<id>: they must redirect to
    // the title the frozen legacy map names, and land on a working page.
    ...(legacy
      ? [
          {
            label: "old title link redirects",
            path: `/title/${legacy.tmdb_id}`,
            ready: `location.pathname === ${JSON.stringify(newTitlePath(legacy))} && document.querySelector('[data-action="favorite"]')`,
          },
        ]
      : []),
    {
      label: "login",
      path: "/login",
      ready: `document.querySelector('input[type=email]') && ${has.passwordInput}`,
    },
    {
      label: "reset password",
      path: "/reset-password",
      ready: has.text("open the link in your reset email"),
    },
    {
      label: "privacy",
      path: "/privacy",
      ready: `${has.h1("Privacy policy")} && ${has.text("Supabase")}`,
    },
    { label: "not found", path: "/no-such-page", ready: has.h1("Not found") },
  ];
}

function signedInPages(titlePath: string): PageSpec[] {
  return [
    {
      label: "home",
      path: "/",
      ready: `${has.heading2("For You")} && ${has.signOut}`,
    },
    {
      label: "my list",
      path: "/my-list",
      ready: `${has.myList("/my-list")} && ${has.signOut} && ${has.headerNav}`,
    },
    {
      label: "my list favorites",
      path: "/my-list?view=favorites",
      ready: `${has.myList("/my-list?view=favorites")} && ${has.signOut}`,
    },
    {
      label: "title",
      path: titlePath,
      ready: `${has.heading2("Where to watch")} && ${has.enabledAction("favorite")} && ${has.signOut}`,
    },
    {
      // A password session must not get the new-password form.
      label: "reset password (password session)",
      path: "/reset-password",
      ready: `${has.text("open the link in your reset email")} && !${has.passwordInput}`,
    },
  ];
}

class Runner {
  results: CheckResult[] = [];

  async check(name: string, fn: () => Promise<string | void>) {
    try {
      const detail = await fn();
      this.results.push({ name, ok: true, detail: detail || undefined });
    } catch (err) {
      this.results.push({
        name,
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
    const last = this.results[this.results.length - 1];
    console.log(`${last.ok ? "PASS" : "FAIL"}  ${name}`);
  }

  async pages(page: Page, prefix: string, specs: PageSpec[]) {
    for (const spec of specs)
      await this.check(
        `${page.viewport.name} ${prefix} ${spec.label}`,
        async () => {
          await page.goto(spec.path);
          await page.waitFor(spec.ready, spec.label);
          await page.assertHealthy();
          await page.screenshot(`${prefix} ${spec.label}`);
        },
      );
  }
}

/**
 * A pre-0007 title id that is live now (see pickLegacyTitle), read with the
 * public anon key, after checking lib/legacy-title-ids.ts (the static
 * redirects' copy) still matches the database's frozen map. Null (and the
 * redirect checks skipped) if no old title is live.
 */
async function findLiveLegacyTitle(): Promise<TitleRef | null> {
  const db = createPublicClient();
  // The whole map: it was frozen at migration time (32 rows) and never grows.
  const legacy = await db
    .from("legacy_title_ids")
    .select("media_type,tmdb_id")
    .order("tmdb_id");
  if (legacy.error)
    throw new Error(`legacy_title_ids: ${legacy.error.message}`);
  const refs = legacy.data as TitleRef[];
  // Empty on a database built from migrations alone (no old links exist there).
  if (refs.length === 0) return null;
  const drift = legacyMapDrift(refs, LEGACY_TITLE_IDS);
  if (drift) throw new Error(`lib/legacy-title-ids.ts ≠ the DB: ${drift}`);
  const live = await db
    .from("v_catalog")
    .select("media_type,tmdb_id")
    .in(
      "tmdb_id",
      refs.map((r) => r.tmdb_id),
    );
  if (live.error) throw new Error(`v_catalog: ${live.error.message}`);
  return pickLegacyTitle(refs, live.data as TitleRef[]);
}

/** The first title on Netflix's browse page, so no title id is hard-coded. */
async function findTitlePath(page: Page): Promise<string> {
  await page.goto("/browse/netflix");
  await page.waitFor(has.titleLinks, "browse titles");
  return page.eval<string>(
    `document.querySelector('main a[href^="/title/"]').getAttribute('href')`,
  );
}

export async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitFor(has.passwordInput, "the sign-in form");
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await page.click("form button[type=submit]");
  await page.waitFor(
    `location.pathname === '/' && ${has.signOut}`,
    "the signed-in home page",
  );
}

/**
 * Toggles the title's watchlist button through the real UI, checks My List
 * agrees, then toggles it back. Always tries to restore the starting state.
 */
async function watchlistJourney(
  page: Page,
  titlePath: string,
): Promise<string> {
  const button = `[data-action="watchlist"]`;
  const pressed = () =>
    page.eval<boolean>(
      `document.querySelector('${button}').getAttribute('aria-pressed') === 'true'`,
    );
  const toggle = async (to: boolean) => {
    await page.goto(titlePath);
    await page.waitFor(has.enabledAction("watchlist"), "the watchlist button");
    if ((await pressed()) === to) return;
    await page.click(button);
    // Optimistic flip, then the button re-enables once the write lands (a
    // failed write flips it back).
    try {
      await page.waitFor(
        `document.querySelector('${button}:not([disabled])')?.getAttribute('aria-pressed') === '${to}'`,
        `the watchlist write (${to ? "add" : "remove"})`,
      );
    } catch (err) {
      const state = await page
        .eval<string>(
          `(() => { const b = document.querySelector('${button}'); return b ? 'aria-pressed=' + b.getAttribute('aria-pressed') + ' disabled=' + b.disabled + ' title=' + (b.parentElement.getAttribute('title') ?? '') : 'no button'; })()`,
        )
        .catch(() => "unknown");
      throw new Error(`${(err as Error).message} (button: ${state})`);
    }
  };
  const listed = async () => {
    await page.goto("/my-list");
    await page.waitFor(has.myList("/my-list"), "My List's watchlist");
    return page.eval<boolean>(
      `Boolean(document.querySelector('main a[href="${titlePath}"]'))`,
    );
  };

  await page.goto(titlePath);
  await page.waitFor(has.enabledAction("watchlist"), "the watchlist button");
  const initial = await pressed();
  let restored = false;
  try {
    await toggle(!initial);
    if ((await listed()) !== !initial)
      throw new Error(
        `My List ${initial ? "still shows" : "doesn't show"} the title after the toggle`,
      );
    await toggle(initial);
    restored = true;
    if ((await listed()) !== initial)
      throw new Error("My List didn't follow the toggle back");
  } finally {
    // Leave the test account as it was, even when a step above failed.
    if (!restored) await toggle(initial).catch(() => {});
  }
  return `${titlePath}: ${initial ? "removed and re-added" : "added and removed"}`;
}

/** An admin-minted recovery link: no email is sent, and no password is set. */
async function resetLinkGate(page: Page, options: SmokeOptions, email: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase URL/service-role key missing");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${options.baseUrl}/reset-password` },
  });
  if (error) throw new Error(`generateLink: ${error.message}`);
  const link = data.properties.action_link;

  await page.goto(link);
  await page.waitFor(
    `location.origin === ${JSON.stringify(options.baseUrl)} && location.pathname === '/reset-password'`,
    "the redirect back to /reset-password (is this origin in Supabase's Redirect URLs?)",
  );
  await page.waitFor(has.passwordInput, "the new-password form");
  if (await page.eval<boolean>("location.hash.length > 1"))
    throw new Error("the link's tokens were left in the URL");
  await page.assertHealthy();
  await page.screenshot("reset link form");

  // A reset link works once.
  await page.goto(link);
  await page.waitFor(
    `${has.text("open the link in your reset email")} && !${has.passwordInput}`,
    "the reused link to be refused",
  );
}

/** A small phone, below VIEWPORTS' 412 px, for the header's one-row check. */
const NARROW_PHONE: Viewport = {
  ...VIEWPORTS[0],
  name: "narrow phone",
  width: 360,
};

/**
 * The header stays one row (docs/UI_DIRECTION.md step 1) at the phone widths,
 * once the session's slot (Sign in, or the name plus Sign out) has rendered.
 */
async function headerOneRow(page: Page, signedIn: boolean): Promise<string> {
  const authReady = signedIn
    ? has.signOut
    : `document.querySelector('header a[href="/login"]')`;
  const heights: string[] = [];
  try {
    for (const viewport of [VIEWPORTS[0], NARROW_PHONE]) {
      await page.setViewport(viewport);
      await page.goto("/");
      await page.waitFor(`${has.headerNav} && ${authReady}`, "the header");
      // One 44 px row plus the bar's padding; a wrapped row adds another 44.
      const height = await page.eval<number>(
        `document.querySelector('header nav').getBoundingClientRect().height`,
      );
      if (height > 70)
        throw new Error(`${viewport.width}px: header is ${height}px tall`);
      heights.push(`${viewport.width}px: ${Math.round(height)}px`);
    }
  } finally {
    await page.setViewport(VIEWPORTS[0]);
  }
  return heights.join(", ");
}

// --- Main --------------------------------------------------------------------

/**
 * The footer's theme setting (lib/theme.ts): Dark sticks across a reload
 * (set by the <head> script before hydration), Light beats a dark device
 * preference, and System clears the stored choice and follows the device.
 */
async function themeSetting(page: Page) {
  const button = (label: string) =>
    `[...document.querySelectorAll('footer button')].find((b) => b.textContent.trim() === ${JSON.stringify(label)})`;
  const pick = async (label: string) => {
    await page.waitInteractive("footer button");
    await page.eval(`${button(label)}.click()`);
    await page.waitFor(
      `${button(label)}?.getAttribute('aria-pressed') === 'true'`,
      `${label} to be selected`,
    );
  };
  const state = () =>
    page.eval<{ attr: string | null; bg: string; stored: string | null }>(
      `({ attr: document.documentElement.getAttribute('data-theme'), bg: getComputedStyle(document.body).backgroundColor, stored: localStorage.getItem('playnext-theme') })`,
    );
  // --bg in app/globals.css.
  const LIGHT_BG = "rgb(246, 247, 251)";
  const DARK_BG = "rgb(11, 14, 26)";

  try {
    await page.setColorScheme("light");
    await page.goto("/privacy");
    await pick("Dark");
    let s = await state();
    if (s.attr !== "dark" || s.bg !== DARK_BG || s.stored !== "dark")
      throw new Error(`after Dark: ${JSON.stringify(s)}`);

    // On a fresh load only the <head> script sets the attribute (the control
    // writes it on a click, not on mount), so this checks the script.
    await page.goto("/privacy");
    s = await state();
    if (s.attr !== "dark" || s.bg !== DARK_BG)
      throw new Error(`after reload: ${JSON.stringify(s)}`);
    await page.waitFor(
      `${button("Dark")}?.getAttribute('aria-pressed') === 'true'`,
      "the control to show Dark after reload",
    );

    await page.setColorScheme("dark");
    await pick("Light");
    s = await state();
    if (s.attr !== "light" || s.bg !== LIGHT_BG)
      throw new Error(`Light on a dark device: ${JSON.stringify(s)}`);

    await pick("System");
    s = await state();
    if (s.attr !== null || s.stored !== null || s.bg !== DARK_BG)
      throw new Error(`System on a dark device: ${JSON.stringify(s)}`);
  } finally {
    await page.setColorScheme(null).catch(() => {});
    await page
      .eval(`localStorage.removeItem('playnext-theme')`)
      .catch(() => {});
  }
}

async function main() {
  config({ path: ".env.local", quiet: true });
  let options: SmokeOptions;
  try {
    options = parseSmokeArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!options.signedOutOnly && (!email || !password)) {
    console.error(
      "TEST_USER_EMAIL/TEST_USER_PASSWORD missing from .env.local (or pass --signed-out)",
    );
    process.exit(2);
  }
  mkdirSync(options.outDir, { recursive: true });
  console.log(`Smoke checks against ${options.baseUrl}\n`);

  const runner = new Runner();
  const chrome = await launchChrome();
  let socket: WebSocket | undefined;
  try {
    const opened = await openPage(chrome.wsUrl);
    socket = opened.socket;
    const page = new Page(opened.cdp, options);

    await page.setViewport(VIEWPORTS[0]);
    let titlePath = "";
    await runner.check("find a title to use", async () => {
      titlePath = await findTitlePath(page);
      return titlePath;
    });
    if (!titlePath)
      throw new Error("no title found; the remaining checks need one");

    // Cast so TS doesn't narrow it to null (it's set inside the callback).
    let legacy = null as TitleRef | null;
    await runner.check("find an old title id to use", async () => {
      legacy = await findLiveLegacyTitle();
      return legacy
        ? `/title/${legacy.tmdb_id}`
        : "none live; redirect checks skipped";
    });
    {
      // At the HTTP level, since a browser would also follow a client-side
      // redirect but crawlers and link previews only follow a real 308. The
      // redirects are static, so any entry works, live or not.
      await runner.check("old title link is an HTTP 308", async () => {
        if (LEGACY_TITLE_IDS.length === 0) throw new Error("no old ids");
        const [tmdb_id, media_type] = LEGACY_TITLE_IDS[0];
        const ref: TitleRef = { media_type, tmdb_id };
        const res = await fetch(
          `${options.baseUrl}/title/${ref.tmdb_id}?from=smoke`,
          { redirect: "manual" },
        );
        const location = res.headers.get("location") ?? "";
        const expected = `${newTitlePath(ref)}?from=smoke`;
        if (res.status !== 308 || !location.endsWith(expected))
          throw new Error(`got ${res.status} → ${location || "(none)"}`);
        return `308 → ${expected}`;
      });
    }

    for (const viewport of VIEWPORTS) {
      await page.setViewport(viewport);
      await runner.pages(page, "signed-out", signedOutPages(titlePath, legacy));
    }

    await page.setViewport(VIEWPORTS[0]);
    await runner.check("theme setting (Dark sticks, Light, System)", () =>
      themeSetting(page),
    );
    await runner.check("header one row on phones (signed out)", () =>
      headerOneRow(page, false),
    );

    if (!options.signedOutOnly) {
      await page.setViewport(VIEWPORTS[0]);
      let signedIn = false;
      await runner.check("sign in through /login", async () => {
        await signIn(page, email!, password!);
        signedIn = true;
      });
      if (signedIn) {
        for (const viewport of VIEWPORTS) {
          await page.setViewport(viewport);
          await runner.pages(page, "signed-in", signedInPages(titlePath));
        }
        await runner.check("header one row on phones (signed in)", () =>
          headerOneRow(page, true),
        );
        await page.setViewport(VIEWPORTS[0]);
        await runner.check("watchlist journey (title → My List, undone)", () =>
          watchlistJourney(page, titlePath),
        );
        // Last: it swaps the password session for a recovery one.
        await runner.check("reset link: form once, refused on reuse", () =>
          resetLinkGate(page, options, email!),
        );
      }
    }
  } catch (err) {
    runner.results.push({
      name: "run",
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  } finally {
    socket?.close();
    // Only the Chrome this script started, and its throwaway profile.
    await stopChrome(chrome.proc, chrome.profileDir);
  }

  const { ok, text } = summarize(runner.results);
  console.log(`\n${text}\nScreenshots: ${options.outDir}`);
  process.exit(ok ? 0 : 1);
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

// Pure helpers for scripts/smoke.ts (live smoke checks, docs/MVP.md Section 8
// "Testing"). Kept free of side effects so they can be unit-tested.

import { titleKey, type TitleRef } from "../lib/title-ref";

export const PRODUCTION_URL = "https://playnext-beta.vercel.app";

export type Viewport = {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  mobile: boolean;
};

// Phone emulation via Emulation.setDeviceMetricsOverride: plain
// `chrome --headless --window-size` can't go below ~500px on Windows.
export const VIEWPORTS: Viewport[] = [
  {
    name: "phone",
    width: 412,
    height: 915,
    deviceScaleFactor: 2,
    mobile: true,
  },
  {
    name: "desktop",
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  },
];

export type SmokeOptions = {
  baseUrl: string;
  outDir: string;
  /** Skip the signed-in checks (no test account needed). */
  signedOutOnly: boolean;
};

export const SMOKE_USAGE = `Usage: npm run smoke -- [--url <base url>] [--out <dir>] [--signed-out]

  --url         Site to check (default ${PRODUCTION_URL}). For a local build use
                http://localhost:3000: it's the only local origin in Supabase's
                Redirect URLs, so the reset-link check needs it.
  --out         Screenshot folder (default .smoke)
  --signed-out  Skip the signed-in checks (no TEST_USER_* needed)`;

/** Parses argv (after the script path). Throws with a usage message on bad input. */
export function parseSmokeArgs(argv: string[]): SmokeOptions {
  const options: SmokeOptions = {
    baseUrl: PRODUCTION_URL,
    outDir: ".smoke",
    signedOutOnly: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--"))
        throw new Error(`${arg} needs a value\n\n${SMOKE_USAGE}`);
      return v;
    };
    if (arg === "--url") options.baseUrl = normalizeBaseUrl(value());
    else if (arg === "--out") options.outDir = value();
    else if (arg === "--signed-out") options.signedOutOnly = true;
    else throw new Error(`Unknown argument: ${arg}\n\n${SMOKE_USAGE}`);
  }
  return options;
}

/**
 * `https://x.app/` → `https://x.app`. Rejects anything that isn't http(s), and
 * a path: the app is served at the root, so a path would be silently dropped
 * and the wrong site checked.
 */
export function normalizeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a URL: ${raw}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error(`Not an http(s) URL: ${raw}`);
  if (url.pathname !== "/" || url.search || url.hash)
    throw new Error(`Pass the site's origin only, without a path: ${raw}`);
  return url.origin;
}

/** Candidate Chrome paths, most likely first; CHROME_PATH wins if set. */
export function chromeCandidates(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
): string[] {
  const list: string[] = [];
  if (env.CHROME_PATH) list.push(env.CHROME_PATH);
  if (platform === "win32") {
    for (const base of [
      env.PROGRAMFILES,
      env["PROGRAMFILES(X86)"],
      env.LOCALAPPDATA,
    ])
      if (base) list.push(`${base}\\Google\\Chrome\\Application\\chrome.exe`);
  } else if (platform === "darwin") {
    list.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
  } else {
    list.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
    );
  }
  return list;
}

/** Pulls the browser's DevTools WebSocket URL out of Chrome's stderr. */
export function parseDevToolsUrl(stderr: string): string | null {
  return stderr.match(/DevTools listening on (ws:\/\/\S+)/)?.[1] ?? null;
}

/** A file-name-safe slug for a screenshot, e.g. `phone-signed-in-my-list`. */
export function screenshotName(viewport: string, label: string): string {
  const slug = `${viewport}-${label}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}.png`;
}

/**
 * A title to test old `/title/<id>` links with: the first one in the frozen
 * legacy map (supabase/migrations/0007_title_key_media_type.sql) that is also
 * live now, so its redirect must land on a working page. Null if none is.
 */
export function pickLegacyTitle(
  legacy: readonly TitleRef[],
  live: readonly TitleRef[],
): TitleRef | null {
  const liveKeys = new Set(live.map(titleKey));
  return legacy.find((ref) => liveKeys.has(titleKey(ref))) ?? null;
}

export type CheckResult = {
  name: string;
  ok: boolean;
  detail?: string;
};

/** One line per check plus a total; `ok` is false if any check failed. */
export function summarize(results: CheckResult[]): {
  ok: boolean;
  text: string;
} {
  const failed = results.filter((r) => !r.ok);
  const lines = results.map(
    (r) =>
      `${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`,
  );
  lines.push(
    "",
    failed.length === 0
      ? `All ${results.length} checks passed.`
      : `${failed.length} of ${results.length} checks failed.`,
  );
  return {
    ok: failed.length === 0 && results.length > 0,
    text: lines.join("\n"),
  };
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

/**
 * Minimal Chrome DevTools Protocol client over one page target's socket:
 * numbers requests, matches responses by id, and lets callers wait for
 * events. `send` is the socket's send; feed incoming frames to `receive`.
 */
export class CdpClient {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Set<(method: string, params: unknown) => void>();

  constructor(private readonly sendFrame: (data: string) => void) {}

  /** Rejects if Chrome hasn't answered in `timeoutMs`, so a stalled call can't hang the run. */
  send<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 30_000,
  ): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method}: no answer after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value as T);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      try {
        this.sendFrame(JSON.stringify({ id, method, params }));
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  receive(data: string): void {
    const msg = JSON.parse(data) as {
      id?: number;
      result?: unknown;
      error?: { message: string };
      method?: string;
      params?: unknown;
    };
    if (msg.id !== undefined) {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message));
      else entry.resolve(msg.result);
    } else if (msg.method) {
      for (const listener of this.listeners) listener(msg.method, msg.params);
    }
  }

  /** Resolves with the params of the next `method` event, or rejects on timeout. */
  waitForEvent<T = unknown>(method: string, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const listener = (m: string, params: unknown) => {
        if (m !== method) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        resolve(params as T);
      };
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        reject(
          new Error(`Timed out after ${timeoutMs}ms waiting for ${method}`),
        );
      }, timeoutMs);
      this.listeners.add(listener);
    });
  }

  /** Fails every in-flight request, e.g. when the socket closes. */
  close(reason: string): void {
    for (const entry of this.pending.values()) entry.reject(new Error(reason));
    this.pending.clear();
  }
}

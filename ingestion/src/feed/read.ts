// Stream-parse one provider's JSONL file (docs/INGESTION.md Section 2): each
// line is validated on its own, and a bad line is recorded and skipped, never
// fatal. Whether the file as a whole is trustworthy is the circuit breaker's
// call (../pipeline/circuit-breaker.ts), made from these counts.

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { feedRowSchema, type FeedRow } from "./schema";

/** A feed row with an imdb_id: the only kind provider_availability can key. */
export type MatchedFeedRow = FeedRow & { imdb_id: string };

export interface LineError {
  line: number;
  reason: string;
  /** The raw line, cut to RAW_SNIPPET_LENGTH characters (code points). */
  raw: string;
}

export interface FeedReadResult {
  /** Non-blank lines seen (= valid + invalid + duplicates). */
  total: number;
  /** Distinct valid titles, matched or not (= rows.length + unmatched). */
  valid: number;
  invalid: number;
  /** Valid rows with an imdb_id, one per (imdb_id, type): see `duplicates`. */
  rows: MatchedFeedRow[];
  /** Valid rows without an imdb_id: counted, not stored. */
  unmatched: number;
  /**
   * Valid repeats of a title already read, merged into it (mergeOffers): one
   * title on one provider is one provider_availability row, so a title
   * offered several ways (subscription and rent) keeps its best offer.
   * Unmatched repeats (same title, type and year) are dropped. Neither valid
   * nor invalid.
   */
  duplicates: number;
  /** The first MAX_RECORDED_ERRORS rejected lines (`invalid` has the full count). */
  errors: LineError[];
}

/** Which offer a title keeps when listed more than once: lower is better. */
export const OFFER_RANK: Record<FeedRow["availability_type"], number> = {
  free: 0,
  subscription: 1,
  rent: 2,
  buy: 3,
};

export const RAW_SNIPPET_LENGTH = 200;
export const MAX_RECORDED_ERRORS = 50;

/** Zod's issues as one short line: "imdb_id: Invalid string; type: ...". */
function describeIssues(issues: { path: PropertyKey[]; message: string }[]) {
  return issues
    .map((i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message)
    .join("; ");
}

/**
 * Validates `lines` as rows for `provider` on `today` (YYYY-MM-DD, UTC).
 * A row naming another provider is invalid: each file is one provider's.
 */
export async function validateFeedLines(
  lines: AsyncIterable<string> | Iterable<string>,
  options: { provider: string; today: string },
): Promise<FeedReadResult> {
  const schema = feedRowSchema(options.today);
  const result: FeedReadResult = {
    total: 0,
    valid: 0,
    invalid: 0,
    rows: [],
    unmatched: 0,
    duplicates: 0,
    errors: [],
  };
  /** (imdb_id, type) → its index in result.rows. */
  const seen = new Map<string, number>();
  /** Unmatched titles have no id: (title, type, year) tells repeats apart. */
  const seenUnmatched = new Set<string>();
  let lineNumber = 0;

  const reject = (raw: string, reason: string) => {
    result.invalid++;
    if (result.errors.length < MAX_RECORDED_ERRORS)
      result.errors.push({ line: lineNumber, reason, raw: snippet(raw) });
  };

  for await (const raw of lines) {
    lineNumber++;
    // trim() also strips a BOM (U+FEFF is whitespace in JS).
    const text = raw.trim();
    if (text.length === 0) continue;
    result.total++;

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      reject(text, "not valid JSON");
      continue;
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      reject(text, describeIssues(parsed.error.issues));
      continue;
    }
    const row = parsed.data;
    if (row.provider !== options.provider) {
      reject(text, `provider ${row.provider} in ${options.provider}'s file`);
      continue;
    }

    if (row.imdb_id === null) {
      const unmatchedKey = `${row.title}|${row.type}|${row.release_year ?? ""}`;
      if (seenUnmatched.has(unmatchedKey)) {
        result.duplicates++;
        continue;
      }
      seenUnmatched.add(unmatchedKey);
      result.valid++;
      result.unmatched++;
      continue;
    }
    const key = `${row.imdb_id}|${row.type}`;
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      result.duplicates++;
      result.rows[earlier] = mergeOffers(
        result.rows[earlier],
        row as MatchedFeedRow,
      );
      continue;
    }
    seen.set(key, result.rows.length);
    result.valid++;
    result.rows.push(row as MatchedFeedRow);
  }

  return result;
}

/**
 * One title listed twice by a provider: the better offer (OFFER_RANK, the
 * earlier row on a tie) supplies the offer itself and its link; seasons are
 * combined; any other field the kept row lacks comes from the other.
 */
export function mergeOffers(
  a: MatchedFeedRow,
  b: MatchedFeedRow,
): MatchedFeedRow {
  const [best, other] =
    OFFER_RANK[b.availability_type] < OFFER_RANK[a.availability_type]
      ? [b, a]
      : [a, b];
  const seasons =
    best.seasons_available || other.seasons_available
      ? Array.from(
          new Set([
            ...(best.seasons_available ?? []),
            ...(other.seasons_available ?? []),
          ]),
        ).sort((x, y) => x - y)
      : best.seasons_available;
  return {
    ...best,
    original_title: best.original_title ?? other.original_title,
    release_year: best.release_year ?? other.release_year,
    tmdb_id: best.tmdb_id ?? other.tmdb_id,
    watch_url: best.watch_url ?? other.watch_url,
    seasons_available: seasons,
    // The fresher verification of the two.
    last_verified:
      other.last_verified > best.last_verified
        ? other.last_verified
        : best.last_verified,
  };
}

/** At most RAW_SNIPPET_LENGTH characters, never splitting one (emoji etc.). */
function snippet(raw: string): string {
  return Array.from(raw).slice(0, RAW_SNIPPET_LENGTH).join("");
}

/** validateFeedLines over a file, read a line at a time. */
export async function readFeedFile(
  path: string,
  options: { provider: string; today: string },
): Promise<FeedReadResult> {
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  try {
    return await validateFeedLines(lines, options);
  } finally {
    lines.close();
    stream.destroy();
  }
}

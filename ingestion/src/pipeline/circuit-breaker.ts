// The critical safety rule (docs/INGESTION.md Section 2): a bad feed must
// never be read as "everything was removed". Before any database write, a
// provider's whole file is rejected if too much of it is invalid, if too few
// of its rows can be stored, or if it is suspiciously small next to that
// provider's recent runs. Yesterday's data then stays untouched and the run
// is marked rejected_suspicious.
//
// Sizes are judged on *matched* rows (valid, with an imdb_id): only those
// reach provider_availability, so a file that is valid but mostly unmatched
// (the collector's IMDb matching broke) would otherwise pass and then look
// like mass removals.

/** Reject when more than this share of lines fails validation. */
export const MAX_INVALID_SHARE = 0.2;
/** Reject when fewer than this share of valid rows have an imdb_id. */
export const MIN_MATCHED_SHARE = 0.5;
/** Reject when matched rows fall below this share of the recent baseline. */
export const MIN_BASELINE_SHARE = 0.5;
/** How many recent completed runs the baseline is taken from. */
export const BASELINE_RUNS = 7;

export type BreakerVerdict = { ok: true } | { ok: false; reason: string };

/**
 * The baseline: the median matched-row count (valid_lines - unmatched_lines)
 * of a provider's BASELINE_RUNS most recent completed runs (by finished_at,
 * sorted here, whatever order the caller has them in); null with no history.
 * The caller passes only runs with the same coverage as this one, so a
 * partial listing is never compared with complete ones. A median, so one odd
 * day doesn't move it.
 */
export function baselineFrom(
  runs: readonly { matched: number; finishedAt: string }[],
): number | null {
  const counts = [...runs]
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
    .slice(0, BASELINE_RUNS)
    .map((run) => run.matched);
  if (counts.length === 0) return null;
  const sorted = counts.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function evaluateBreaker(counts: {
  /** Non-blank lines, including merged duplicates. */
  total: number;
  /** Distinct valid titles (FeedReadResult.valid). */
  valid: number;
  invalid: number;
  /** Valid rows with an imdb_id (the ones that would be stored). */
  matched: number;
  /** baselineFrom(...); null on a provider's first run (no size check). */
  baseline: number | null;
}): BreakerVerdict {
  const { total, valid, invalid, matched, baseline } = counts;
  if (total === 0) return { ok: false, reason: "empty file" };

  // Over distinct entries, not raw lines: repeats of a good title (merged
  // duplicates) mustn't dilute the bad ones.
  const entries = valid + invalid;
  const invalidShare = invalid / entries;
  if (invalidShare > MAX_INVALID_SHARE)
    return {
      ok: false,
      reason: `${invalid} of ${entries} entries invalid (${pct(invalidShare)}, limit ${pct(MAX_INVALID_SHARE)})`,
    };

  if (matched === 0) return { ok: false, reason: "no rows with an imdb_id" };

  const matchedShare = matched / valid;
  if (matchedShare < MIN_MATCHED_SHARE)
    return {
      ok: false,
      reason: `only ${matched} of ${valid} valid rows have an imdb_id (${pct(matchedShare)}, minimum ${pct(MIN_MATCHED_SHARE)})`,
    };

  if (
    baseline !== null &&
    baseline > 0 &&
    matched < baseline * MIN_BASELINE_SHARE
  )
    return {
      ok: false,
      reason: `${matched} matched rows, under ${pct(MIN_BASELINE_SHARE)} of the recent baseline (${baseline})`,
    };

  return { ok: true };
}

function pct(share: number): string {
  return `${Math.round(share * 1000) / 10}%`;
}

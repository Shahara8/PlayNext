// The collector's per-provider JSON Lines rows and its manifest.json, as
// agreed in docs/FEED_REQUIREMENTS.md (section 2), validated with Zod
// (docs/INGESTION.md Section 2).
//
// Deliberately strict on what keys and filters depend on (provider, region,
// type, ids, dates) and lenient on display extras (an unknown extra field is
// dropped; watch_url may be null, the title page just hides its link).

import { z } from "zod";
import { PROVIDERS, REGION } from "../../../lib/providers";

/** Provider codes the feed may use: exactly the ones the app lists. */
export const FEED_PROVIDER_CODES = PROVIDERS.map((p) => p.code);

export const IMDB_ID_PATTERN = /^tt\d{7,8}$/;

const isoDate = z.iso.date();
const nullableDate = isoDate.nullable().optional();

const feedRowBase = z.object({
  provider: z.string().refine((code) => FEED_PROVIDER_CODES.includes(code), {
    message: "unknown provider code",
  }),
  region: z.literal(REGION),
  title: z.string().trim().min(1),
  original_title: z.string().trim().min(1).nullable().optional(),
  type: z.enum(["movie", "tv_series"]),
  release_year: z.number().int().min(1870).max(2100).nullable().optional(),
  // Null means "no confident match": the row is valid but unmatched.
  imdb_id: z.string().regex(IMDB_ID_PATTERN).nullable(),
  // A hint only: the pipeline keys TMDB titles on (media_type, tmdb_id) and
  // resolves them from imdb_id (imdb_tmdb_map), so this is never stored as is.
  tmdb_id: z.number().int().positive().nullable().optional(),
  match_source: z.enum(["provider", "tmdb_search"]).nullable().optional(),
  availability_type: z.enum(["subscription", "rent", "buy", "free"]),
  watch_url: z
    .url({ protocol: /^https?$/ })
    .nullable()
    .optional(),
  seasons_available: z
    .array(z.number().int().nonnegative())
    .nullable()
    .optional(),
  added_date: nullableDate,
  removed_date: nullableDate,
  last_verified: isoDate,
});

export type FeedRow = z.infer<typeof feedRowBase>;

/** Days a feed date may run ahead of ours (time zones, a run near midnight). */
export const FUTURE_DATE_TOLERANCE_DAYS = 1;
/**
 * How old last_verified may be. Every daily file is freshly fetched, so an
 * older date means a stale file re-delivered as today's: its rows are
 * invalid, and a whole stale file trips the circuit breaker.
 */
export const MAX_STALE_DAYS = 3;

function addDays(isoDay: string, days: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The row schema with the cross-field rules, for a run on `today`
 * (YYYY-MM-DD, UTC). ISO dates compare correctly as strings.
 */
export function feedRowSchema(today: string) {
  if (!isoDate.safeParse(today).success)
    throw new Error(`feedRowSchema: today must be YYYY-MM-DD, got ${today}`);
  const latest = addDays(today, FUTURE_DATE_TOLERANCE_DAYS);
  const oldest = addDays(today, -MAX_STALE_DAYS);
  // A collector a day behind ours (time zones) may still list its last day.
  const earliestRemoval = addDays(today, -FUTURE_DATE_TOLERANCE_DAYS);
  return feedRowBase.superRefine((row, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    for (const field of ["last_verified", "added_date"] as const) {
      const value = row[field];
      if (value && value > latest) issue(field, "is in the future");
    }
    if (row.last_verified < oldest)
      issue("last_verified", `is more than ${MAX_STALE_DAYS} days old`);
    // A listed row is available now. A removal date may only announce a
    // departure (today counts: its last day); a past one would store a gone
    // title as available.
    if (row.removed_date && row.removed_date < earliestRemoval)
      issue("removed_date", "is in the past (a listed title is available)");
    if (row.added_date && row.removed_date && row.removed_date < row.added_date)
      issue("removed_date", "is before added_date");
    if (row.type === "movie" && row.seasons_available != null)
      issue("seasons_available", "must be null for a movie");
    if (
      row.seasons_available &&
      new Set(row.seasons_available).size !== row.seasons_available.length
    )
      issue("seasons_available", "has duplicates");
    // match_source with no imdb_id (e.g. which search failed) is allowed: an
    // unmatched row must never count as invalid.
  });
}

// ------------------------------------------------------------
// manifest.json (docs/FEED_REQUIREMENTS.md 2.1)
// ------------------------------------------------------------

const manifestProvider = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    coverage: z.enum(["complete", "partial"]),
    file: z.string().min(1),
    records: z.number().int().nonnegative(),
    provider_reported_total: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .optional(),
    source_urls: z.array(z.string()).optional(),
    null_counts: z.record(z.string(), z.number()).optional(),
    unmatched_titles: z.array(z.string()).optional(),
  }),
  z.object({
    status: z.literal("failed"),
    error: z.string().optional(),
  }),
]);

export const manifestSchema = z
  .object({
    generated_at: z.iso.datetime({ offset: true }),
    collector_version: z.string().optional(),
    providers: z.record(z.string(), manifestProvider),
  })
  .superRefine((manifest, ctx) => {
    for (const [code, entry] of Object.entries(manifest.providers)) {
      if (!FEED_PROVIDER_CODES.includes(code))
        ctx.addIssue({
          code: "custom",
          path: ["providers", code],
          message: "unknown provider code",
        });
      // The agreed name only: never a path the pipeline would follow.
      else if (entry.status === "ok" && entry.file !== `${code}.jsonl`)
        ctx.addIssue({
          code: "custom",
          path: ["providers", code, "file"],
          message: `must be ${code}.jsonl`,
        });
    }
  });

export type Manifest = z.infer<typeof manifestSchema>;
export type ManifestProvider = z.infer<typeof manifestProvider>;

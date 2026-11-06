// Seeds title_cache + provider_availability from data/mock-feed.jsonl, standing
// in for the real daily ingestion pipeline until it ships (docs/INGESTION.md).
// Resolves each row via the shared lib/tmdb-resolve.ts module and upserts
// directly — a plain idempotent upsert, no staging/anti-join diffing, per
// docs/MVP.md Section 7 ("no staging/anti-join diffing needed for a manual
// one-off seed").
//
// Usage: npm run seed:mock

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { z } from "zod";
import { PROVIDERS, REGION } from "../lib/providers";
import { resolveImdbToTmdb } from "../lib/tmdb-resolve";

export const feedRowSchema = z.object({
  // Only codes and the region the app queries; anything else would seed fine
  // but never show (getCatalogByProvider filters on both).
  provider: z
    .string()
    .refine((code) => PROVIDERS.some((p) => p.code === code), {
      message: "unknown provider code (see lib/providers.ts)",
    }),
  region: z.literal(REGION),
  title: z.string().min(1),
  original_title: z.string().nullable().optional(),
  type: z.enum(["movie", "tv_series"]),
  release_year: z.number().int().nullable().optional(),
  imdb_id: z.string().regex(/^tt\d{7,8}$/),
  availability_type: z.enum(["subscription", "rent", "buy", "free"]),
  watch_url: z.string().nullable().optional(),
  seasons_available: z.array(z.number().int()).nullable().optional(),
  added_date: z.string(),
  removed_date: z.string().nullable().optional(),
  last_verified: z.string(),
});

type FeedRow = z.infer<typeof feedRowSchema>;

/** The mock feed, resolved from this file so it works from any directory. */
export const MOCK_FEED_PATH = fileURLToPath(
  new URL("../data/mock-feed.jsonl", import.meta.url),
);

export function loadFeed(path: string): FeedRow[] {
  const rows: FeedRow[] = [];
  readFileSync(path, "utf-8")
    .split("\n")
    .forEach((raw, i) => {
      const line = raw.trim();
      if (line.length === 0) return;
      // i is the real file line (blank lines included), for useful errors.
      let json: unknown;
      try {
        json = JSON.parse(line);
      } catch (err) {
        throw new Error(`Invalid JSON at line ${i + 1}: ${String(err)}`);
      }
      const parsed = feedRowSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error(
          `Invalid feed row at line ${i + 1}: ${parsed.error.message}`,
        );
      }
      rows.push(parsed.data);
    });
  return rows;
}

async function main() {
  // Loaded here, not at import, so tests can import this module without
  // pulling real credentials into process.env (docs/MVP.md Section 8).
  config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)) });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set",
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const rows = loadFeed(MOCK_FEED_PATH);
  console.log(`Loaded ${rows.length} mock feed rows.`);

  let resolved = 0;
  let unresolved = 0;

  for (const row of rows) {
    const match = await resolveImdbToTmdb(row.imdb_id, row.type).catch(
      (err) => {
        console.error(
          `  TMDB resolution failed for ${row.imdb_id} (${row.title}): ${err.message}`,
        );
        return null;
      },
    );

    if (match) {
      resolved++;
      const { error: titleError } = await supabase.from("title_cache").upsert(
        {
          tmdb_id: match.tmdb_id,
          media_type: match.media_type,
          imdb_id: match.imdb_id,
          title: match.title,
          original_title: match.original_title,
          overview: match.overview,
          poster_path: match.poster_path,
          backdrop_path: match.backdrop_path,
          release_date: match.release_date,
          genres: match.genres,
          vote_average: match.vote_average,
          popularity: match.popularity,
        },
        { onConflict: "media_type,tmdb_id" },
      );
      if (titleError)
        throw new Error(
          `title_cache upsert failed for ${row.imdb_id}: ${titleError.message}`,
        );
    } else {
      unresolved++;
      console.warn(
        `  No TMDB match for ${row.imdb_id} (${row.title}) — storing as unresolved.`,
      );
    }

    const { error: availabilityError } = await supabase
      .from("provider_availability")
      .upsert(
        {
          provider: row.provider,
          region: row.region,
          imdb_id: row.imdb_id,
          type: row.type,
          // The full title key or none (a check constraint enforces both-or-neither).
          media_type: match?.media_type ?? null,
          tmdb_id: match?.tmdb_id ?? null,
          title: match?.title ?? row.title,
          original_title: match?.original_title ?? row.original_title ?? null,
          release_year: row.release_year ?? null,
          availability_type: row.availability_type,
          watch_url: row.watch_url ?? null,
          seasons_available: row.seasons_available ?? null,
          first_seen_date: row.added_date,
          last_seen_date: row.added_date,
          removed_at: row.removed_date ?? null,
          last_verified: row.last_verified,
          source: "mock",
        },
        { onConflict: "provider,region,imdb_id,type" },
      );
    if (availabilityError) {
      throw new Error(
        `provider_availability upsert failed for ${row.imdb_id}: ${availabilityError.message}`,
      );
    }

    console.log(`  Seeded ${row.provider} / ${row.title} (${row.imdb_id})`);
  }

  console.log(
    `\nDone. Resolved: ${resolved}, unresolved: ${unresolved}, total: ${rows.length}.`,
  );
}

// Only run when executed directly (`npm run seed:mock`) — importing this
// module for `feedRowSchema` (e.g. from a unit test) must never trigger a
// live TMDB/Supabase run as a side effect of import.
const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

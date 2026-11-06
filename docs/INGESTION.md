# PlayNext — Daily Provider Catalog Ingestion Pipeline

## Context

PlayNext helps users find where to watch a movie/show across streaming services. We validated that TMDB's free API gives solid *metadata* (poster, synopsis, genres, cast, rating, popularity) but its own `/watch/providers` data has gaps (e.g. **zero coverage of Israeli local/cable-telecom services** like YES, Hot, Partner TV — confirmed empirically against TMDB's live provider list for region IL).

To get reliable, complete availability data, a second developer will supply the **full catalog feed for every provider** (Netflix, Prime, Disney+, YES, Hot, Partner TV, and any others — not just the ones TMDB misses), updated daily, in the JSONL schema agreed with him (one object per title: `provider`, `region`, `title`, `type`, `imdb_id`, `availability_type`, `watch_url`, etc. — `imdb_id` is the required cross-reference key back to TMDB).

**TMDB's role**: purely *metadata enrichment* (poster/synopsis/genres/rating, looked up via `imdb_id`), never a source of availability data. The external developer's daily feed is the single source of truth for "what's available where" across **all** providers.

**Current status: the real feed is not live yet.** Until it is, `title_cache`/`provider_availability` are populated by a mock seed script (see `docs/MVP.md`, Section 7) using the exact same resolver logic this pipeline will use — so switching from mock to real data should require zero application code changes, only standing up the pieces below.

This document covers the ingestion/sync pipeline only — the rest of the product (search, sort, favorites, recommendations) is scoped in `docs/MVP.md`.

---

## Agreed feed schema (from the external developer)

JSON Lines (`.jsonl`), one file per provider:

```json
{
  "provider": "YES",
  "region": "IL",
  "title": "Fauda",
  "original_title": "פאודה",
  "type": "tv_series",
  "release_year": 2015,
  "imdb_id": "tt4565380",
  "tmdb_id": 69557,
  "availability_type": "subscription",
  "watch_url": "https://www.yes.co.il/vod/...",
  "seasons_available": [1, 2, 3, 4],
  "added_date": "2026-09-01",
  "removed_date": null,
  "last_verified": "2026-10-24"
}
```

**Required**: `provider`, `region`, `title`, `type`, `imdb_id`, `last_verified`. `tmdb_id` is preferred but optional (we derive it from `imdb_id` if absent). The feed is a **full daily dump per provider**, not a diff — the pipeline computes the diff itself (see Section 4).

---

## Architecture: two decoupled stages

1. **Receive** — dumb and always-available. Gets the file into our storage, stamped with our own receipt time. Must never silently fail.
2. **Process** — the daily scheduled job: validate → resolve against TMDB → diff/reconcile → write. Idempotent and retryable, so a bad day never corrupts prior data.

### 1. Delivery: Supabase Storage + one signed upload URL per provider

> **Changed 2026-11-06:** the external developer delivers a collector, not files, so the daily GitHub Action runs it itself and archives the output (one `<CODE>.jsonl` per provider plus `manifest.json`, see `docs/FEED_REQUIREMENTS.md` section 2.1) to the private `raw-feeds` bucket under our own timestamp. No signed upload URLs are needed. The archiving idea below still applies; the upload half doesn't.

- Private bucket `raw-feeds`. One long-lived signed upload URL per provider (e.g. `raw-feeds/yes/latest.jsonl`), handed to the external developer once.
- His automation becomes one `curl -X PUT` line he can cron on anything — he always overwrites the same object, no date logic on his end.
- **We** archive: at the start of each run, before touching `latest.jsonl`, copy it server-side to `raw-feeds/{provider}/archive/{yyyy-mm-dd}.jsonl` with our own timestamp (never trust his clock). Gives us full history for free.
- Rejected a custom upload API (extra always-on surface for no real benefit at this scale) and a shared Drive folder (not reliably automatable, no clean "file landed" signal).
- Verify during build: Supabase's current max expiry for `createSignedUploadUrl`. If too short, fall back to a storage RLS policy + a restricted service credential scoped to `raw-feeds/{provider}/*` insert-only.

### 2. Validation: stream-parse + reject-and-log, with a circuit breaker

- Stream-parse line by line (never load the whole file into memory).
- Validate with **Zod** against the schema above: required fields present; `imdb_id` matches `^tt\d{7,8}$`; `provider`/`region` against an explicit allow-list (not free text); `type` one of the documented literals; dates valid and logically consistent.
- Bad rows are skipped and logged (line number + reason + truncated raw line) into `ingestion_runs.error_summary` — one bad line never aborts the file.
- **Circuit breaker (critical safety rule):** if >20% of lines fail validation, or valid-row count drops below ~50% of that provider's recent baseline, abort the *whole file* before any DB writes, mark the run `rejected_suspicious`, alert, and leave yesterday's data untouched. **A bad feed must never be interpreted as "everything was removed."**

### 3. TMDB matching: `imdb_id` → `tmdb_id` → metadata, cached

- If the row already has `tmdb_id`, trust it.
- Else check `imdb_tmdb_map` cache; on miss, call TMDB `/find/{imdb_id}` (throttled/retried with backoff).
- No match → record as `unresolved` in `imdb_tmdb_map`; still write the `provider_availability` row with `tmdb_id = NULL`, using the feed's own title/year for display. Re-attempt resolution only after ~30 days (don't burn rate limit re-asking about a permanent gap daily).
- `title_cache` entries get a ~7-day TTL for refreshing rating/popularity — daily TMDB calls stay bounded to "new titles + stale refresh batch," not a full re-fetch every day.
- Explicit mapping between the feed's `type` (`movie`/`tv_series`) and TMDB's `media_type` (`movie`/`tv`) — not assumed identical.

### 4. Diff/reconciliation: staging + upsert + anti-join (SQL, not app-level loops)

Per provider, per run, in one transaction:
1. Bulk-load today's valid rows into `staging_availability`.
2. **Upsert** into live `provider_availability` on `(provider, region, imdb_id, type)` — new rows get `first_seen_date = today`; existing rows get `last_seen_date = today`, `removed_at = NULL` (handles "came back"), refreshed fields, and `first_seen_date` preserved via `COALESCE`.
3. **Anti-join** marks rows missing from today's staging as `removed_at = now()` (only those not already removed).
4. "Unchanged" needs no special code — it's a no-op branch of the same upsert.
5. Circuit breaker gates before step 1 commits.
6. Each provider's transaction is independent; idempotent by design, so a manual re-run safely reproduces the correct end state.

### 5. Database schema

```sql
-- TMDB metadata cache, shared across all providers/regions.
-- Keyed on (media_type, tmdb_id): TMDB ids are only unique *per media type*
-- (movie 1396 and tv 1396 are different titles). Done in migration 0007
-- (2026-11-06); every table pointing here (provider_availability,
-- user_watchlist, user_title_feedback, imdb_tmdb_map) carries both columns.
CREATE TABLE title_cache (
  tmdb_id           INTEGER NOT NULL,
  media_type        TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  imdb_id           TEXT UNIQUE,
  title             TEXT NOT NULL,
  original_title    TEXT,
  overview          TEXT,
  poster_path       TEXT,
  backdrop_path     TEXT,
  release_date      DATE,
  genres            JSONB,
  vote_average      NUMERIC(3,1),
  popularity        NUMERIC,
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (media_type, tmdb_id)
);
CREATE INDEX idx_title_cache_imdb ON title_cache(imdb_id);

-- imdb_id -> tmdb_id resolution cache (includes orphans)
CREATE TABLE imdb_tmdb_map (
  imdb_id           TEXT PRIMARY KEY,
  tmdb_id           INTEGER,
  media_type        TEXT CHECK (media_type IN ('movie','tv')),
  -- FOREIGN KEY (media_type, tmdb_id) REFERENCES title_cache
  resolution_status TEXT NOT NULL CHECK (resolution_status IN ('resolved','unresolved','ambiguous')),
  last_attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempt_count     INTEGER NOT NULL DEFAULT 1
);

-- Live fact table: "where can I watch X"
CREATE TABLE provider_availability (
  id                 BIGSERIAL PRIMARY KEY,
  provider           TEXT NOT NULL,              -- 'YES','HOT','PARTNER_TV','NETFLIX',...
  region             TEXT NOT NULL,               -- ISO 3166-1 alpha-2
  imdb_id            TEXT NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('movie','tv_series')),
  tmdb_id            INTEGER,                     -- NULL until resolved
  media_type         TEXT,                        -- the TMDB match's type, set with tmdb_id
                                                  -- (both or neither; FK to title_cache)
  title              TEXT NOT NULL,               -- feed-supplied fallback display name
  original_title     TEXT,
  release_year       INTEGER,
  availability_type  TEXT NOT NULL CHECK (availability_type IN ('subscription','rent','buy','free')),
  watch_url          TEXT,
  seasons_available  INTEGER[],
  first_seen_date    DATE NOT NULL,
  last_seen_date     DATE NOT NULL,
  removed_at         TIMESTAMPTZ,                 -- NULL = currently available
  last_verified      DATE,
  source             TEXT NOT NULL DEFAULT 'feed',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, region, imdb_id, type)
);
CREATE INDEX idx_pa_active         ON provider_availability (provider, region) WHERE removed_at IS NULL;
CREATE INDEX idx_pa_title          ON provider_availability (media_type, tmdb_id);
CREATE INDEX idx_pa_recently_left  ON provider_availability (removed_at) WHERE removed_at IS NOT NULL;

-- Transient per-run load table
CREATE TABLE staging_availability (
  run_id             BIGINT NOT NULL,
  provider           TEXT NOT NULL,
  region             TEXT NOT NULL,
  imdb_id            TEXT NOT NULL,
  type               TEXT NOT NULL,
  media_type         TEXT,                        -- with tmdb_id: both or neither
  tmdb_id            INTEGER,
  title              TEXT NOT NULL,
  original_title     TEXT,
  release_year       INTEGER,
  availability_type  TEXT NOT NULL,
  watch_url          TEXT,
  seasons_available  INTEGER[],
  last_verified      DATE,
  PRIMARY KEY (run_id, provider, region, imdb_id, type)  -- run_id → ingestion_runs, ON DELETE CASCADE
);
-- As built in migration 0008 (2026-11-06). RLS on with no policies, service role only.

-- Observability / audit log — one row per provider per day
CREATE TABLE ingestion_runs (
  id              BIGSERIAL PRIMARY KEY,
  provider        TEXT NOT NULL,
  region          TEXT NOT NULL DEFAULT 'IL',
  file_path       TEXT,
  received_at     TIMESTAMPTZ,
  coverage        TEXT CHECK (coverage IN ('complete','partial')),  -- from the collector's manifest
  status          TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','completed','failed','rejected_suspicious')),
  total_lines     INTEGER,
  valid_lines     INTEGER,
  invalid_lines   INTEGER,
  unmatched_lines INTEGER,   -- valid rows with no imdb_id: counted, not stored
  new_titles      INTEGER,
  removed_titles  INTEGER,
  unchanged_titles INTEGER,
  error_summary   JSONB,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);
```

**Forward-compatibility rule**: future user tables (favorites, watchlist, ratings — see `docs/MVP.md`) key on `title_cache`'s `(media_type, tmdb_id)` (falling back to `imdb_id` for unresolved orphans), **not** on `provider_availability.id` — a favorite is "this movie," not "this movie on this specific provider." Keeps `provider_availability` decoupled from user data.

### 6. Scheduling: GitHub Actions, not Supabase pg_cron/Edge Functions

- `.github/workflows/daily-ingest.yml`, cron-triggered after the expected delivery window + `workflow_dispatch` for manual re-runs/backfills.
- Chosen over Supabase's own compute because Edge Functions have free-tier wall-clock limits that are a real risk for a job doing TMDB calls + DB writes; GitHub Actions gives a full Node runtime, ample free minutes, built-in logs/failure email, and a free manual-retry button. Fits cleanly since `origin` already points at GitHub (`github.com/Shahara8/PlayNext`).
- Secrets (DB URL, TMDB key, Supabase service key) go in GitHub Encrypted Secrets.

### 7. Failure handling

- **File missing/stale** (nothing newer than ~24–30h) → log `failed`/`no_file_received`, notify via a simple webhook (Slack/Discord), skip only that provider.
- **Malformed/empty file** → caught by the circuit breaker, prior data untouched.
- **TMDB down/rate-limited** → retried with backoff; availability upsert/diff proceeds regardless with `tmdb_id = NULL` for affected rows — "is it on YES today" must never depend on TMDB being up. Picked up by normal resolution retry later.
- **Crash mid-run** → per-provider transactions limit blast radius to the in-flight provider; idempotent design makes a manual re-run safe.

### 8. Scales cleanly to more providers/regions

`provider`/`region` are validated config values, not schema branches — every provider (Netflix, Prime, YES, Hot, Partner TV, whatever comes next) goes through the exact same pipeline, just a different value in an allow-list plus its own signed upload URL. No per-provider code branches, no special-casing "global" vs "local" providers — the feed is authoritative for all of them equally.

---

## Infra note

Supabase is used for **managed Postgres + Storage only** — deliberately not for compute (pg_cron/Edge Functions), to avoid building around their free-tier execution limits. If Supabase ever needs swapping, only a connection string and a storage bucket change.

---

## Critical files

- `supabase/migrations/0001`, `0007`, `0008` — the schema above (with the app's migrations, not a separate `ingestion/migrations/`)
- `ingestion/src/feed/schema.ts` — Zod schema for the agreed JSONL spec (`docs/FEED_REQUIREMENTS.md`) and the collector's `manifest.json`
- `ingestion/src/feed/read.ts` — line-by-line validation of one provider's file (counts, skipped-line log)
- `ingestion/src/pipeline/circuit-breaker.ts` — the whole-file reject rules
- `ingestion/src/pipeline/processProvider.ts` — validate → resolve → diff orchestration per provider
- `ingestion/src/db/staging.ts` — staging load + upsert + anti-join SQL
- `ingestion/src/tmdb/resolveImdbToTmdb.ts` — matching/caching logic (shared with the mock seed script — see `lib/tmdb-resolve.ts` in `docs/MVP.md`)
- `.github/workflows/daily-ingest.yml` — the scheduled trigger

## Verification

- Unit-test the Zod schema against both valid rows and each documented failure mode (bad imdb_id format, unknown provider, future date, inconsistent removed/added dates).
- Integration test: seed `staging_availability` with a synthetic "day 2" dataset against a "day 1" baseline in a local/test Postgres, run the upsert+anti-join, and assert new/removed/unchanged counts match expectations exactly (including the "came back after removal" case).
- Dry-run the circuit breaker: feed it a deliberately truncated/corrupt file and confirm it rejects without touching `provider_availability`.
- End-to-end: trigger `daily-ingest.yml` manually via `workflow_dispatch` against a real signed-URL upload of a small sample feed, confirm `ingestion_runs` and `provider_availability` reflect it correctly.
- Confirm Supabase's current `createSignedUploadUrl` max expiry before relying on the long-lived-URL delivery approach.

## Status

**In progress** (`docs/MVP.md` Post-M8 task 3). `title_cache`/`provider_availability` are still populated by the mock seed, which stays live until the cutover.

**The feed (as of 2026-11-06):**
- The external developer's (Noam's) Python collector on branch `provider-catalog-fetchers` isn't the agreed feed yet: no IMDb ids, home and marketing pages instead of full catalogs, YES and Partner TV only.
- The changes he was asked to make are in **`docs/FEED_REQUIREMENTS.md`**: the contract our code validates against, and an acceptance checklist in its section 7. He works only on his branch; the user decides when to merge it by pull request.
- **We run his collector ourselves** in the daily GitHub Action. That replaces Section 1's signed upload URLs.
- Netflix, Disney+ and Prime stay on mock data until his phase 2. Partner TV is in the app (`PARTNER_TV`).

**Our side, step by step:**
1. [x] Title keys `(media_type, tmdb_id)` (migration 0007, live).
2. [x] Pipeline tables (migration 0008, live), feed schema, line reader, circuit breaker (`ingestion/src/`).
3. [ ] TMDB resolution with the `imdb_tmdb_map` cache: 30-day retry for unresolved ids, 7-day `title_cache` refresh; TMDB being down never blocks availability. Reuses `lib/tmdb-resolve.ts`. **Next.**
4. [ ] Staging load + upsert + anti-join, atomic per provider (likely a Postgres function called with the service key), with `ingestion_runs` bookkeeping. Removals only from `coverage: "complete"` runs; the grace period for partial ones is still open with the user.
5. [ ] `.github/workflows/daily-ingest.yml`: run the collector, archive raw files to Storage, process. GitHub secrets will be needed from the user.
6. [ ] Cutover once Noam's output passes `docs/FEED_REQUIREMENTS.md` section 7: YES/Partner TV move off mock data, and mock-tied checks are relaxed (smoke's Yellowstone wait, the seed test's every-provider rule).

## Progress Log

### 2026-11-06 (session end) — docs brought up to date; step 3 in a new session
- At the user's request, step 3 starts in a new session.
- Docs updated for that session:
  - This doc's Status now has the step checklist (1–2 done, 3 next) and the feed's state, replacing "not yet built".
  - Section 1 notes that we run the collector ourselves, so no signed upload URLs.
  - `docs/MVP.md` Post-M8 task 3 points here.
  - `CLAUDE.md` lists `docs/FEED_REQUIREMENTS.md` as required reading, makes this doc full reading while it's the current workstream, puts `ingestion/src/` under the unit-test rule, and adds the migration procedure (dry-run, approval, `db push --yes` as its own step).
- State: everything committed and pushed. Migrations 0007 and 0008 are live. Production smoke 38/38 after both. 409 tests.
- Next step: step 3 (see Status).

### 2026-11-06 — pipeline step 2: pipeline tables, feed validation, circuit breaker
- Did: **migration `0008_ingestion_tables.sql`**:
  - `ingestion_runs` adds `coverage` (from the manifest) and `unmatched_lines`, plus an index for the baseline query.
  - `staging_availability` has `media_type`, and its primary key mirrors `provider_availability`'s, scoped to the run (cascade on run delete).
  - `imdb_tmdb_map` has resolved ⇔ full TMDB key, an imdb format check, a composite FK to `title_cache`, and a retry index.
  - RLS on, no policies; grants to `service_role` only.
  - Dry-run on the live DB, rolled back: service-role writes work, each bad case is rejected by its constraint, and `anon`/`authenticated` get "permission denied" on all three tables.
- Did: TypeScript in `ingestion/src/` (covered by the repo's tsconfig, ESLint and Vitest):
  - `feed/schema.ts`: the row schema from `docs/FEED_REQUIREMENTS.md`, built per run date (`feedRowSchema(today)`), plus `manifestSchema`. Rules:
    - Provider codes come from `lib/providers.ts` (a code the app doesn't list would make invisible rows; add a provider there first); region `IL`.
    - IMDb ids `^tt\d{7,8}$`; ISO dates; `last_verified` and `added_date` at most one day ahead; `removed_date` not before `added_date`; seasons null for movies and without duplicates.
    - Extra fields are dropped, not fatal. `watch_url` may be null (lenient: only the link is hidden), but must be http(s).
  - `feed/read.ts`: stream-parses a file a line at a time.
    - A bad line is counted, logged (line number, reason, raw cut to 200 characters on whole characters, first 50 kept) and skipped.
    - Rows naming another provider are invalid.
    - Repeats of a title are merged, not counted invalid (see the second review pass below).
  - `pipeline/circuit-breaker.ts` judges **matched** rows (valid, with an imdb_id), since only those are stored. It rejects:
    - an empty file;
    - more than 20% invalid lines;
    - no matched rows, or fewer than 50% of valid rows matched;
    - matched rows under 50% of the baseline.
  - The baseline is the median matched count of the last 7 completed runs **of the same coverage**; the caller filters, in step 4. There's no size check on a first run.
  - Rows are also invalid when `last_verified` is more than 3 days old (a stale file re-delivered trips the breaker) or `removed_date` isn't in the future (a listed title must be available now).
  - The manifest only accepts known provider codes and the file name `<CODE>.jsonl`, so it can never name a path.
- `/code-review` caught the important case: as first written, a file that was entirely valid but unmatched (exactly today's collector output, 0 of 437 imdb_ids) passed the breaker, and the anti-join would then have "removed" everything. Hence the matched-row rules.
  - Also fixed: a literal invisible BOM character in two regexes (my editor's escape handling; `scripts/seed-mock-data.ts` had one since this morning). `trim()` already strips a BOM, so both now rely on it, and the tests build the BOM explicitly.
  - Declined: `imdb_tmdb_map`'s FK means a resolved entry needs its `title_cache` row first. That's the intended write order, and `title_cache` rows are never deleted.
- Second `/code-review` pass, fixed:
  - **A title listed several ways** (subscription and rent) is merged into one row keeping its best offer (`OFFER_RANK`: free, subscription, rent, buy), counted as `duplicates`. It's neither valid nor invalid, so it can't trip the 20% limit. `provider_availability` has one row per title per provider anyway.
  - `removed_date` = today is allowed (its last day).
  - `feedRowSchema` refuses a malformed run date.
  - The baseline index includes `coverage`.
  - **`staging_availability` has a composite FK `(run_id, provider, region)` → `ingestion_runs (id, provider, region)`**, so a staged row can't claim another provider than its run (the anti-join compares by provider).
  - The feed's `tmdb_id` is documented as a hint only.
- Second pass, declined:
  - Read-stream error handling: a missing file is already a clean rejection, and tested.
  - The mock seed has its own schema: the seed is retired at the cutover.
- Third `/code-review` pass (now including the new files, via `git add -N`), all fixed:
  - Unmatched repeats are deduplicated by (title, type, year).
  - The invalid share is taken over distinct entries (valid + invalid), so repeated good titles can't dilute bad lines.
  - `mergeOffers` combines rows: the best offer and its link win, seasons are combined, missing fields are filled, and the fresher `last_verified` is kept.
  - Error snippets are cut on whole characters (a split emoji would break the jsonb write).
  - An unmatched row with a `match_source` stays valid.
  - `removed_date` gets the same one-day tolerance as the other dates.
  - `baselineFrom` takes `{ matched, finishedAt }` runs and sorts them itself.
  - `staging_availability.last_verified` is `not null`.
- The dry run was repeated after the second pass's changes (rolled back): the mismatched-provider staging row is refused by the FK, and deleting a run cascades to its staged rows (0 left).
- **Real-data check:** `readFeedFile` + `evaluateBreaker` on the collector's actual 2026-11-06 output, split per provider. YES 329/329 and Partner 108/108 lines invalid → both rejected before any write. The first reasons are the gaps listed in `docs/FEED_REQUIREMENTS.md`: no `availability_type`; `"Partner TV"` not a code; missing `type`.
- **Decision, a deviation from Section 3:** a row with `imdb_id: null` (the collector found no confident match) is **valid but unmatched**. It's counted in `unmatched_lines` and not stored, because `provider_availability`'s key needs an imdb_id and such a title can't show in the app anyway (no `title_cache` row). It isn't counted invalid, so a provider just under the 90% IMDb target doesn't trip the breaker.
- Tests: `npm test` 403 (+53: schema, reader, breaker; the seed test now builds its BOM explicitly). They cover each failure mode Section "Verification" lists: bad imdb_id, unknown provider, future date, inconsistent dates, and a truncated or corrupt file.
- **Applied 2026-11-06 with the user's approval**, after the code was committed (`ebdd34c`). It ran as its own `db push --yes` step, and its output confirmed "Applying migration 0008".
  - Verified live: the three tables have RLS on, no policies, no `select` for `anon`/`authenticated`, and `insert` for `service_role`.
  - Production `npm run smoke` passed 38/38: the site is unaffected.
- Next step: step 3: TMDB resolution with the `imdb_tmdb_map` cache (30-day retry for unresolved, 7-day refresh of `title_cache`), reusing `lib/tmdb-resolve.ts`.

### 2026-11-06 — pipeline step 1: titles keyed on (media_type, tmdb_id)
- The user's plan for our side (while Noam works on his branch):
  1. The migration (this entry).
  2. Validation and the circuit breaker.
  3. TMDB resolution with caching.
  4. The diff/upsert.
  5. The GitHub Actions job.
  6. The cutover once Noam's data is accepted.
- Did: **migration `0007_title_key_media_type.sql`** fixed the TMDB id collision noted in Section 5 before real data arrives:
  - `title_cache`'s key is now `(media_type, tmdb_id)`.
  - `user_watchlist` and `user_title_feedback` carry `media_type` (backfilled), with keys `(user_id, media_type, tmdb_id)` and composite FKs.
  - `provider_availability` gets its own nullable `media_type`: the TMDB match's type, both-or-neither with `tmdb_id`. It's deliberately not derived from the feed's `type`, since the resolver can fall back to a movie hit for a "series" row.
  - `v_catalog` and `search_titles()` join on both columns (same output columns).
  - New `legacy_title_ids` freezes what each old id meant, while ids were still unique.
  - The feedback backfill disables 0006's touch trigger, so `updated_at` (recommendations' seed order) survives.
- App: `lib/title-ref.ts` (`TitleRef`, `titleKey` "movie:603", `titlePath`, `parseTitleRef`, `idsByMediaType`). Every data function, map key and page uses the pair.
  - Title pages moved to `/title/[media_type]/[tmdb_id]` (TMDB's own URL shape).
  - `/title/<id>` (links shared before) 308-redirects to the title `legacy_title_ids` names, keeping the query string. Done as static `next.config.ts` redirects; see "Found after deploy" below for why a page couldn't.
- Section 5's schema block above is updated to match.
- Verified before applying:
  - The migration was dry-run twice on the live DB in a rolled-back transaction: 32/32 catalog rows still join, feedback timestamps unchanged, legacy map 32 rows, trigger re-enabled, `anon` can read the map.
  - `npm test` 351 (+32); lint, `tsc`, build and format clean.
  - `/code-review` three passes; see `docs/MVP.md`.
- **Applied 2026-11-06 with the user's approval** (`npx supabase db push --yes --db-url`; the CLI now refuses to apply from an agent without `--yes`).
  - Incident: the first attempt lacked `--yes`, so nothing was applied, but my command chain pushed the code anyway. The new code ran against the old schema for about a minute, until the migration went in.
  - Lesson: run `db push` on its own, check it reports "Applying migration", and only then push.
- Verified live:
  - The constraints are the new composite keys.
  - 32/32 catalog rows join, and 32 legacy ids are recorded.
  - Feedback `updated_at` keeps the original dates.
- **Found after deploy: the page-level 308 wasn't real.** The route streamed a 200 shell with a client-side `NEXT_REDIRECT` (`instant = false` doesn't stop the root layout's shell). Browsers followed it; crawlers and link previews wouldn't.
  - Final fix: **static redirects.** The map is frozen (32 rows) and never changes, so `lib/legacy-title-ids.ts` holds a copy and `next.config.ts` `redirects()` serves each old path as a real 308. Next keeps the query string, and there's no database on the request path.
  - A middleware version came first (`legacyTitleRedirect`, a live lookup). Review showed it added request-time latency, timeout and outage cases to the auth middleware for no gain, so it was dropped; `middleware.ts` is unchanged.
  - A title no longer on any provider lands on its new URL's not-found, the same answer its old URL gave.
  - `/title/<one segment>` has no page, so anything not redirected there is Next's not-found.
  - Smoke checks that the copy still matches `legacy_title_ids` (`legacyMapDrift`), and that the 308 is real at the HTTP level.
- Next step: step 2, migration `0008` for `imdb_tmdb_map`/`staging_availability`/`ingestion_runs`, plus the Zod feed schema from `docs/FEED_REQUIREMENTS.md`.

### 2026-11-06 — feed check: collector branch reviewed, change requests written
- Did: reviewed and ran the external developer's (Noam's) `provider-catalog-fetchers` branch (commit `a7e4f16`, a Python package) in a throwaway worktree and venv. 45 tests pass (1 skipped). A live `fetch` gave 329 YES + 108 Partner TV rows in the agreed 14 JSONL fields.
- Found that it isn't yet the feed this doc assumes:
  - `imdb_id` and `tmdb_id` are empty on every row.
  - The sources are the YES home page and Partner's marketing page, not the full VOD catalogs. So the anti-join would wrongly "remove" titles every time those pages rotate.
  - `watch_url` and `availability_type` are always null; 58 of 108 Partner rows have no `type`.
  - Dubbed variants and per-season rows are duplicated.
  - The provider name is `"Partner TV"` rather than a code.
  - It covers YES and Partner only.
  - The branch is based on old `main` (`6f8acaf`): it overwrites `README.md`, edits this doc, and its `.gitignore` rule `data/*` would cover `data/mock-feed.jsonl`.
- Probe: a TMDB title search on that output found an exact title in the top 3 for about 77% of distinct titles (YES 249/325, Partner 83/108), before year or uniqueness checks.
- Decision (the user's): Noam fixes YES and Partner TV first, then adds the other providers after sign-off. The requested changes, including IMDb IDs, the merge from `main`, the `ingestion/collector/` layout, per-provider files plus a manifest, and an acceptance checklist, are in `docs/FEED_REQUIREMENTS.md`, which the user is sending him. Also agreed there: **we run his collector ourselves in the daily GitHub Action**, replacing the signed-upload-URL delivery in Section 1, and the provider codes `PARTNER_TV`/`FREETV`/`HOT`. Section 1 gets updated when the pipeline is built.
- No pipeline code yet; the mock seed stays live.
- Later the same day, the user decided:
  - Noam works only on his branch. We merge it with a pull request when we decide it's time.
  - Netflix, Disney+ and Prime stay on the mock data until his phase 2.
  - Partner TV is in the app now (`PARTNER_TV`, with six mock rows; see `docs/MVP.md`).
- Next step: wait for Noam's update against `docs/FEED_REQUIREMENTS.md`'s checklist. Meanwhile, the pipeline side can be built against that contract: the processing stage, migration, removal rules and workflow. Still open: a removal grace period, if a provider stays `partial`.

<!-- Template for future entries — newest entry on top, same convention as docs/MVP.md:
### YYYY-MM-DD — <what was worked on>
- Did: ...
- Decisions / deviations from this doc: ...
- Next step: ...
-->

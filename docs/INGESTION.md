# PlayNext — Daily Provider Catalog Ingestion Pipeline

## Context

PlayNext helps users find where to watch a movie/show across streaming services. We validated that TMDB's free API gives solid *metadata* (poster, synopsis, genres, cast, rating, popularity) but its own `/watch/providers` data has gaps (e.g. **zero coverage of Israeli local/cable-telecom services** like YES, Hot, Partner TV — confirmed empirically against TMDB's live provider list for region IL).

To get reliable, complete availability data, a second developer will supply the **full catalog feed for every provider** (Netflix, Prime, Disney+, YES, Hot, Partner TV, and any others — not just the ones TMDB misses), updated daily, in the JSONL schema agreed with him (one object per title: `provider`, `region`, `title`, `type`, `imdb_id`, `availability_type`, `watch_url`, etc. — `imdb_id` is the required cross-reference key back to TMDB).

**TMDB's role**: purely *metadata enrichment* (poster/synopsis/genres/rating, looked up via `imdb_id`), never a source of availability data. The external developer's daily feed is the single source of truth for "what's available where" across **all** providers.

**Current status: the real feed is not live yet.** Until it is, `title_cache`/`provider_availability` are populated by a mock seed script (see `docs/MVP.md`, Section 7) using the exact same resolver logic this pipeline will use — so switching from mock to real data should require zero application code changes, only standing up the pieces below.

**Provider collector prototype (2026-10-24):** the Python package documented in
[`README.md`](../README.md) now fetches YES and Partner TV website listings into
one local `data/catalog.jsonl`. It keeps unknown values `null`, including all
current IMDb IDs and some Partner content types. Coverage is partial/unproven;
no complete daily delivery, upload, scheduler, database processing, or removal
reconciliation is enabled. This is collection work upstream of the pipeline
below. Its merged file and incomplete rows still need a handoff agreement before
the strict ingestion contract below can accept them.

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
-- TMDB metadata cache, shared across all providers/regions
CREATE TABLE title_cache (
  tmdb_id           INTEGER PRIMARY KEY,
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
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_title_cache_imdb ON title_cache(imdb_id);

-- imdb_id -> tmdb_id resolution cache (includes orphans)
CREATE TABLE imdb_tmdb_map (
  imdb_id           TEXT PRIMARY KEY,
  tmdb_id           INTEGER REFERENCES title_cache(tmdb_id),
  media_type        TEXT CHECK (media_type IN ('movie','tv')),
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
  tmdb_id            INTEGER REFERENCES title_cache(tmdb_id),  -- NULL until resolved
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
CREATE INDEX idx_pa_tmdb           ON provider_availability (tmdb_id);
CREATE INDEX idx_pa_recently_left  ON provider_availability (removed_at) WHERE removed_at IS NOT NULL;

-- Transient per-run load table
CREATE TABLE staging_availability (
  run_id             BIGINT NOT NULL,
  provider           TEXT NOT NULL,
  region             TEXT NOT NULL,
  imdb_id            TEXT NOT NULL,
  type               TEXT NOT NULL,
  tmdb_id            INTEGER,
  title              TEXT NOT NULL,
  original_title     TEXT,
  release_year       INTEGER,
  availability_type  TEXT NOT NULL,
  watch_url          TEXT,
  seasons_available  INTEGER[],
  last_verified      DATE
);

-- Observability / audit log — one row per provider per day
CREATE TABLE ingestion_runs (
  id              BIGSERIAL PRIMARY KEY,
  provider        TEXT NOT NULL,
  region          TEXT NOT NULL DEFAULT 'IL',
  file_path       TEXT,
  received_at     TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','completed','failed','rejected_suspicious')),
  total_lines     INTEGER,
  valid_lines     INTEGER,
  invalid_lines   INTEGER,
  new_titles      INTEGER,
  removed_titles  INTEGER,
  unchanged_titles INTEGER,
  error_summary   JSONB,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ
);
```

**Forward-compatibility rule**: future user tables (favorites, watchlist, ratings — see `docs/MVP.md`) key on `title_cache.tmdb_id` (falling back to `imdb_id` for unresolved orphans), **not** on `provider_availability.id` — a favorite is "this movie," not "this movie on this specific provider." Keeps `provider_availability` decoupled from user data.

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

- `ingestion/migrations/001_init.sql` — the schema above
- `ingestion/src/feed/schema.ts` — Zod schema for the agreed JSONL spec
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

This downstream processing pipeline is **not yet built**. Its planned interim
data source is the mock seed path (`docs/MVP.md`, Milestone M1). The upstream
provider collector prototype is described in the README and the progress entry
below. Building the real processing pipeline remains queued as **post-M8** work
in `docs/MVP.md`.

## Progress Log

### 2026-10-24 — Provider collection prototype

- Did: added automatic YES/Partner HTTP collectors, optional offline HAR import,
  a shared 14-field JSONL model, deduplication, atomic single-file merging, fetch
  dates, a YES 403 fallback, provider-supplied English/international names, and
  conservative cross-provider name matching. Added offline tests and setup,
  usage, source, validation, and extension documentation in the README.
- Observed: the local snapshot contains 316 YES and 101 Partner records. YES
  fetching was verified live; the automated test suite uses mocked transports.
- Decisions / deviations: this collector exports one merged file and leaves
  missing fields null, as requested for the fetching work. The strict downstream
  ID requirements and complete daily/per-provider delivery described above are
  still future integration requirements. Raw HARs and generated catalogs remain
  local and are excluded from Git. No translation service, daily job, upload,
  application feature, or downstream database pipeline was implemented.
- Next step: establish catalog coverage and sources for missing IDs/types, add
  FreeTV once its source is known, and agree on handoff compatibility and cadence.
  Keep downstream processing queued until the app's Post-M8 step and a suitable
  feed are ready.

<!-- Template for future entries — newest entry on top, same convention as docs/MVP.md:
### YYYY-MM-DD — <what was worked on>
- Did: ...
- Decisions / deviations from this doc: ...
- Next step: ...
-->

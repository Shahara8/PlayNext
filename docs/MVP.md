# PlayNext — MVP Architecture & Scope

## How to use this document (read me first, every session)

This file is the single source of truth for PlayNext's MVP scope and build status — written so a brand-new Claude session, with no memory of prior sessions, can pick up exactly where the last one left off. Each session should:

1. Read this whole file — especially the **Progress Log** and the checkboxes in the **Implementation Plan** (Section 9) — to see what's already done and what's next.
2. Implement the next unchecked task(s) — typically just the next milestone, or part of one (one or two tasks per session), not the whole remaining backlog at once.
3. Check off (`- [x]`) each task in Section 9 as it's completed.
4. **Before ending the session, append a new entry to the Progress Log below** with: date, what was implemented, any decisions or deviations from this document, and an explicit "Next step" pointer for the following session.
5. If something in this document turns out to be wrong or outdated once you're actually implementing it, update that section directly (don't leave it stale) and note the change in the Progress Log entry.

Related doc: `docs/INGESTION.md` covers the daily catalog ingestion pipeline — the data foundation `title_cache`/`provider_availability` depend on. Read it before touching M1's schema work or the post-M8 real-feed cutover; it has its own Status/Progress Log for that workstream.

## Progress Log

### 2026-10-31 — M3 complete: sort & filter
- Did: extended `lib/catalog.ts`'s `getCatalogByProvider()` with a `{ sort, filters }` options param — `sort` (`trending`/`newest`/`rating`/`alphabetical`, mapped to `popularity`/`release_date`/`vote_average`/`title` ordering, default `trending` unchanged from M2) and `filters` (`type`, `availabilityType` via `.eq()`, `genre` via a jsonb containment `.contains()` on `title_cache.genres`). Added `getProviderGenres()` (distinct genre names live on a provider, for populating the genre dropdown's options from real data rather than a hardcoded list). Built `app/components/sort-filter-bar.tsx` (client component; four `<select>`s, each updating the URL query string via `useRouter`/`useSearchParams` on change — `sort`, `type`, `avail`, `genre` params) and wired it into `app/browse/[provider]/page.tsx`, which now reads `searchParams` (validating against the allowed value sets, silently falling back to defaults/unfiltered on anything invalid — no error thrown), passes `{ sort, filters }` through to `getCatalogByProvider`, and distinguishes the empty state ("Nothing matches these filters" vs "Nothing available on `<provider>` yet") based on whether any filter is active. Added `supabase/migrations/0003_sort_filter_indexes.sql` (btree indexes on `title_cache.release_date`/`popularity`/`vote_average`/`title` for the four sort keys — `popularity` had none before despite being M2's default sort, backfilled here; a GIN `jsonb_path_ops` index on `title_cache.genres` for the containment filter; partial indexes on `provider_availability.type`/`availability_type` scoped to `removed_at is null`), applied via `supabase db push --db-url`. Added unit tests for all of the above sort/filter branches plus `getProviderGenres()` in `lib/catalog.test.ts` (11 tests total in that file now; 45 passing overall).
- Decisions / deviations:
  - **Bug caught during manual smoke testing, not by the unit tests**: `lib/catalog.ts`'s genre filter originally passed a plain JS array to supabase-js's `.contains()` — `query.contains("genres", [{ name: filters.genre }])`. supabase-js's `.contains()` special-cases any `Array.isArray` input as a *Postgres array* literal (`cs.{${value.join(',')}}`), not jsonb, and `Array.prototype.join` on an array of objects stringifies each as `[object Object]`, producing `genres=cs.{[object Object]}` — invalid JSON, so Postgres rejected it with "invalid input syntax for type json" on every genre-filtered request. The unit test (which mocks the Supabase client entirely) only checked that `.contains()` was *called*, so it couldn't have caught a value the real PostgREST endpoint would reject — this only surfaced by actually hitting `/browse/netflix?genre=...` against the live dev server. Fixed by JSON-stringifying the array myself and passing that *string* to `.contains()` instead, which routes through its string branch (`cs.${value}`) unchanged — confirmed against both a raw PostgREST curl call and the running app. Worth remembering generally: a mocked-client unit test proves the query *shape* your code intends, not that the real API accepts the serialized value — any new filter using a less-common builder method (`.contains()`, `.overlaps()`, etc.) should get at least one live manual check before being called done, the same way the UI layer already does.
  - Filtered on `provider_availability.type` (`movie`/`tv_series`) rather than `title_cache.media_type` (`movie`/`tv`) for the "type" filter — both are always consistent per row (the resolver guarantees it), but `type` is the terminology Section 5 already uses and keeps the filter grouped with `availability_type`, its sibling column on the same table.
  - Genre filter matches by name (not TMDB genre id) via jsonb containment (`genres @> '[{"name":"X"}]'`) — a partial-object match, since the array elements are `{id, name}` but the UI only ever needs to offer/compare names. Options are populated from an extra lightweight query (just the `genres` column, same provider+region) rather than reusing the main filtered result set, so the dropdown always shows every genre available on that provider regardless of which type/availability filter is currently active.
  - Did not persist sort/filter in a cookie or localStorage — "persist in the URL query string" (Section 9) is satisfied by `router.push` already updating the address bar, which is sufficient for shareable/bookmarkable links; no server-side session state needed.
- Next step: M4 — Search (Section 9): debounced search bar wired to the existing `search_titles` RPC, results list with provider badges, no-results state.

### 2026-10-31 — Scope change: added a real unit test suite (Vitest)
- Did: per user request, reversed the "comprehensive automated test suite" out-of-scope item (Section 8) — added Vitest (`vitest.config.ts`, `npm test`/`npm run test:watch`) scoped to data-access/resolver/pure logic (see the new "Testing" subsection under Section 8 for the exact boundary: unit tests for `lib/`/`scripts/` logic, not component/E2E automation, which stays manual-smoke-test-only). Backfilled tests for all of M1/M2's testable logic: `lib/providers.test.ts`, `lib/tmdb-image.test.ts`, `lib/catalog.test.ts` (mocked Supabase client), `lib/tmdb-resolve.test.ts` (mocked `fetch`; covers bearer-auth, movie/tv resolution + fallback, orphan/no-match, missing-key and TMDB-error paths), `scripts/seed-mock-data.test.ts` (exported `feedRowSchema` from the seed script and tested it against valid/malformed rows). 38 tests, all passing; `npm run build`/`lint`/`format:check` all stay clean.
- Decisions / deviations:
  - Installed `vitest@^3` rather than the latest `vitest@5` — v5 requires `@types/node@^22||>=24`, which conflicted with this repo's `@types/node@^20`; v3's peer range (`^18||^20||>=22`) fits without bumping that dependency. Noted for the record: `npm audit` flags 2 critical advisories in `vitest@3`'s `tinypool` dependency (prototype-pollution-to-RCE via worker options) — not considered exploitable here since nothing in this repo passes untrusted input into Vitest's own worker pool (it only ever runs our own local test files), but flagging it in case a future session wants to revisit (would require the `@types/node` bump too).
  - **Near-miss safety issue, caught and fixed before it could do real damage**: the first version of `scripts/seed-mock-data.test.ts` imported `scripts/seed-mock-data.ts` to reach its (then-unexported) schema, but that script called `main()` unconditionally at module scope — so importing it for a test **actually ran the real seed pipeline** (live TMDB calls + upserts against the production Supabase DB via the real service-role key from `.env.local`) as a side effect of `npm test`. Caught immediately via the unexpected "Loaded 26 mock feed rows." stdout line in the first test run. Fixed by adding an `isMainModule` guard (`import.meta.url` vs `pathToFileURL(process.argv[1])`) around the `main().catch(...)` call, so the script only runs end-to-end when invoked directly (`npm run seed:mock`), never on import. Verified afterward with a read-only row-count check (`title_cache`: 26, live `provider_availability`: 26) — matches M1's original seed exactly, confirming no duplication/corruption happened (the upsert's idempotency, already verified in M1, meant even a full accidental re-run would have been harmless, but nothing suggests it actually completed before the guard was added). Documented the rule generally in Section 8's new Testing subsection so it isn't rediscovered the hard way in a later milestone.
- Next step: M3 — Sort & filter (Section 9), as before. Going forward, M3+ should add unit tests for any new non-trivial pure/data-access logic (e.g. query-building for sort/filter combinations) alongside the feature itself, not as an afterthought.

### 2026-10-31 — M2 complete: browse & title detail
- Did: added `lib/supabase.ts` (anon-key `createPublicClient()` for public catalog reads — no cookie/session handling yet, that's M5), `lib/providers.ts` (provider code↔slug↔label↔color metadata, region fixed to `IL`), `lib/catalog.ts` (typed `CatalogRow` mirroring `v_catalog`, `getCatalogByProvider()`/`getCatalogByTmdbId()`), `lib/tmdb-image.ts` (poster/backdrop URL helpers). Built `app/components/provider-picker.tsx` (home page grid linking to `/browse/[provider]`), `app/components/title-card.tsx` (poster/title/year/type, links to `/title/[tmdb_id]`), `app/browse/[provider]/page.tsx` (queries `v_catalog` by provider+region, default-sorted by `popularity desc` as a placeholder pending M3's real sort control; `notFound()` for unknown provider slugs; empty state when a provider has zero live rows) with a skeleton `loading.tsx`, and `app/title/[tmdb_id]/page.tsx` (overview, genres, rating, and every live provider row for that `tmdb_id` with availability type + watch link; `notFound()` for unresolvable/non-numeric ids) with its own skeleton `loading.tsx`. Added a shared `.skeleton` shimmer utility class to `app/globals.css` (plain global class, referenced by literal string in loading components — not `composes`, since `globals.css` isn't a CSS module) instead of duplicating the keyframes per route. Added `images.remotePatterns` for `image.tmdb.org` to `next.config.ts`. Wired the header's "Browse" link to `/`. Verified via `npm run build` (typecheck + PPR build clean) and a local `npm run dev` smoke test: home page lists all 4 providers, each `/browse/[provider]` returns the expected row count (8+6+6+6=26, matching the full seeded mock feed), `/title/1396` (Breaking Bad) renders overview/genres/rating and both its Netflix/other provider rows, unknown provider slug and non-existent `tmdb_id` both render the Next.js not-found page.
- Decisions / deviations:
  - No real provider logos (trademark/licensing risk for an unlicensed MVP) — the picker uses colored-accent text tiles per provider instead, close enough to brand colors (Netflix red, Disney+ blue, Prime cyan, yes amber) for quick recognition without using actual logo assets.
  - Browse page's default order is `popularity desc` (TMDB's field, already labeled "Trending" per Section 5's explicit proxy framing) as a placeholder — M3 adds the real sort control (newest/trending/rating/alphabetical); this is just a reasonable default for M2's single-sort state.
  - Noticed in passing: with `cacheComponents`/PPR both on (project.config from M0), a streamed `notFound()` response's outer HTTP status can still read `200` to a raw `curl -o /dev/null -w "%{http_code}"` check even though the correct not-found page content is what's actually served (confirmed by inspecting the body) — a known PPR streaming quirk, not something introduced here; noting it so a future session doesn't mistake it for a routing bug.
- Next step: M3 — Sort & filter (Section 9): sort control (newest/trending/rating/alphabetical) and filter controls (type/genre/availability type) on the browse page, wired to `v_catalog` query ordering/filtering, supporting indexes if needed, persisted in the URL query string.

### 2026-10-31 — M1 complete: schema + mock data
- Did: wrote and applied `supabase/migrations/0001_user_data_and_views.sql` (title_cache, provider_availability, profiles, user_watchlist, user_title_feedback, the signup trigger, RLS, `v_catalog`, `search_titles()`) and a follow-up `0002_service_role_grants.sql` (see Decisions). Built `lib/tmdb-resolve.ts` (shared imdb→tmdb→metadata resolver, bearer-auth against TMDB) and `scripts/seed-mock-data.ts` (Zod-validated, idempotent upsert), seeded from a hand-written `data/mock-feed.jsonl` (26 titles across Netflix/Disney+/Prime/YES IL). Verified: all 26 rows resolved and seeded, a second run produced a byte-identical snapshot (confirmed idempotent), `v_catalog` sort/filter and `search_titles()` typo-tolerant search both spot-checked against the live seeded data.
- Decisions / deviations:
  - Didn't create `imdb_tmdb_map`/`staging_availability`/`ingestion_runs` — those belong to the real ingestion pipeline (post-M8); the mock seed path upserts directly, per this doc's Section 7.
  - Applying the migration needed a way to run DDL against the live DB without interactive `supabase login`. Added `SUPABASE_DB_URL` (Session pooler connection string, IPv4-compatible — plain Direct/IPv6 needs a paid add-on and wasn't reachable from this environment) to `.env.local`, then used `supabase db push --db-url`, which needs no account auth at all. Documented in Prerequisites.
  - Discovered mid-session that "automatically expose new tables" being off meant **`service_role` had no table grants either** (BYPASSRLS only skips row-policy checks, not base table privileges) — `0001`'s seed upserts failed with "permission denied" until `0002_service_role_grants.sql` added explicit grants for `service_role` too. Section 2's RLS note and the Prerequisites entry above were updated to call this out so it isn't rediscovered the hard way again.
  - `TMDB_API_KEY` turned out to hold the v4 Read Access Token (JWT), not a v3 key — `lib/tmdb-resolve.ts` sends it as a `Bearer` header, not the `api_key` query param.
  - Corrected 5 of the mock feed's `imdb_id`s after TMDB `/find` came back empty for them (Extraction, Prisoners of War, Tehran, When Heroes Fly, Our Boys) — the ones I'd written from memory were wrong; found the right ones via `/search/movie`+`/search/tv` then `/external_ids`.
- Next step: M2 — Browse & title detail (Section 9): provider picker, browse grid querying `v_catalog`, title card component, title detail page at `/title/[tmdb_id]`, loading/empty states.

### 2026-10-31 — M0 complete
- Did: Supabase project `playnext` created (org "PlayNext", region `eu-central-1`/Frankfurt, legacy anon/service_role keys, "Automatically expose new tables" disabled, "Enable automatic RLS" enabled — both deliberately, since M1's migrations define RLS/exposure explicitly per table rather than relying on project-wide defaults). `.env.local` created locally with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TMDB_API_KEY` (confirmed git-ignored). Repo connected to Vercel (project `playnext`, team `shahara8's projects`), same four env vars added there for Production/Preview/Development, first deploy succeeded after pushing the M0 scaffold commit (`c29ccbd`) that had been made but not yet pushed to `origin/main`. Live at https://playnext-beta.vercel.app, confirmed serving the header + placeholder home page built in the earlier M0 session.
- Decisions / deviations: none beyond what the prior entry recorded; the only hiccup was the scaffold commit not having been pushed yet when the first Vercel deploy was attempted (`[NEXT_NO_VERSION]` error since `package.json` wasn't visible on `origin/main` yet) — fixed by `git push origin main`.
- Next step: M1 — Schema + mock data (Section 9). Start with the `supabase/migrations/0001_user_data_and_views.sql` migration (title_cache/provider_availability per `docs/INGESTION.md` Section 5, plus profiles/user_watchlist/user_title_feedback per this doc's Section 2), then RLS, the `v_catalog` view, `pg_trgm`/`search_titles`, and finally the mock data + seed script.

### 2026-10-24 — M0 (partial)
- Did: scaffolded Next.js (App Router, TypeScript, ESLint) at repo root via `create-next-app`; added Prettier (`.prettierrc.json`, `.prettierignore`, `format`/`format:check` scripts, wired into `eslint.config.mjs` via `eslint-config-prettier`); replaced the boilerplate home page with a minimal `app/components/header.tsx` (logo + placeholder nav links) and a placeholder `app/page.tsx`; verified `npm run lint`, `npm run format:check`, and `npm run build` all pass, and smoke-tested `npm run dev` serves the header/home page.
- Decisions / deviations: `create-next-app` rejects "PlayNext" as a package name (npm disallows capital letters), so it was scaffolded into a temp lowercase subfolder and moved up to the repo root, then `package.json`'s `name` was changed to `playnext`. Declined Tailwind (plain CSS modules, consistent with "no theming beyond one default look" in Section 8). `docs/` is excluded from Prettier's scope (`.prettierignore`) so it doesn't reformat these planning docs.
- Still open from M0 (needs the user's own accounts — can't be done from here): create the Supabase project and record its URL/anon key/service role key, add env vars to `.env.local` + Vercel, connect the repo to Vercel and confirm a first deploy. Manual step-by-step instructions for these were given to the user in-session.
- Next step: once Supabase project + keys and the Vercel link exist, wire up `.env.local` / Vercel env vars, confirm the first deploy, then move to M1 — Schema + mock data.

<!-- Template for future entries — newest entry on top:
### YYYY-MM-DD — <milestone(s) worked on>
- Did: ...
- Decisions / deviations from this doc: ...
- Next step: ...
-->

## Prerequisites (one-time setup)

- **TMDB API key** — already obtained (personal-use Developer plan). Stored as `TMDB_API_KEY` in `.env.local` and in Vercel project env vars (Production/Preview/Development). Never commit the key itself to the repo.
- **Supabase project** — created in M0 (`playnext`, org "PlayNext", region `eu-central-1`/Frankfurt). `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are in `.env.local` and Vercel env vars. Project-level "Automatically expose new tables" is **off** and "automatic RLS" is **on** — migrations must explicitly grant API exposure (to `anon`/`authenticated`/`service_role` alike — this setting means even `service_role` gets no default grants, only its usual RLS bypass) and define RLS policies per table rather than relying on defaults.
- **`SUPABASE_DB_URL`** (added in M1) — direct Postgres connection string (Session pooler, port 5432, IPv4-compatible — NOT the Direct/IPv6 connection, which needs a paid add-on from this environment) in `.env.local` only, never committed or added to Vercel. Lets migrations be pushed non-interactively via `npx supabase db push --db-url "$SUPABASE_DB_URL"`, with no `supabase login`/account access token needed. Treat it like a DB root password — it bypasses RLS and PostgREST grants entirely.
- **GitHub repo** — already initialized, remote set to `github.com/Shahara8/PlayNext`.
- **Vercel project** — connected in M0 (`playnext`, team `shahara8's projects`), auto-deploys `main`. Live at https://playnext-beta.vercel.app.
- **Google OAuth app** — needed before M5 (Auth); not yet created.

## Context

PlayNext helps users browse streaming services, sort/filter titles, search across providers, maintain favorites/watchlist/ratings, and get basic recommendations. The **data foundation** for this was already planned and approved separately (full detail in `docs/INGESTION.md`): a daily ingestion pipeline (Postgres via Supabase, `title_cache` for TMDB metadata + `provider_availability` as the "where can I watch X" fact table, validated via Zod, reconciled via staging+upsert+anti-join, scheduled on GitHub Actions) that will eventually be fed by an external developer's full daily catalog feed covering every provider (Netflix, Prime, Disney+, YES, Hot, Partner TV, etc.).

That real feed **isn't ready yet**. Rather than block on it, we'll seed the same two tables with a small hand-written mock dataset run through the same TMDB-resolution logic the real pipeline will use — so the app layer never needs to know or care which source populated the data, and swapping in the real feed later requires zero app-code changes.

This document scopes everything else: the rest of the schema, the stack, the API surface, how each of the five originally-requested features gets built, and a step-by-step implementation plan.

**Confirmed decisions for this round:** web app only (no mobile for MVP), auth via Supabase (email/password + Google), recommendations are simple content-based (not collaborative filtering), launch scope is Israel-focused (single region), mock data now / real feed later.

---

## 1. Stack choice

**Next.js (App Router, TypeScript) on Vercel, talking directly to Supabase (Postgres + Auth + Storage).**

Rejected: a separate React SPA + Express/Node API server. For a 1-2 person team, that's a second service to build, deploy, and keep running on a free tier (cold starts, separate CI/CD, separate secrets) for little benefit — Next.js already gives a backend (API Route Handlers) in the same codebase and deploy, and almost none of this MVP needs a hand-written backend anyway (see Section 3).

Why this combination: Supabase Auth covers the chosen auth methods natively; Supabase Postgres holds everything; custom logic (search ranking, recommendations) lives in Next.js Route Handlers, consistent with the existing "no Supabase Edge Functions/pg_cron for compute" decision; Vercel Hobby + Supabase Free comfortably covers MVP scale and cost.

---

## 2. Additional database schema (additive only — `title_cache`/`provider_availability` unchanged)

```sql
-- thin app-level profile, auto-created on signup via trigger
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- "want to watch" — distinct lifecycle from opinion/rating
create table public.user_watchlist (
  user_id    uuid not null references auth.users(id) on delete cascade,
  tmdb_id    integer not null references public.title_cache(tmdb_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);

-- favorite / like-dislike / rating combined: one row per (user, title) "opinion"
-- (same key, same access pattern, avoids join fan-out — used together for recs & "My List")
create table public.user_title_feedback (
  user_id      uuid not null references auth.users(id) on delete cascade,
  tmdb_id      integer not null references public.title_cache(tmdb_id) on delete cascade,
  is_favorite  boolean not null default false,
  sentiment    text check (sentiment in ('like','dislike')),
  rating       smallint check (rating between 1 and 10),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);
```

Plus supporting indexes (`user_id` on both tables, partial indexes on `is_favorite`/`sentiment='like'`). Both tables key on `title_cache.tmdb_id`, matching the forward-compat rule already set in the ingestion plan — a favorite is "this movie," not "this movie on this provider." A title only becomes favoritable once it's resolved and visible via `title_cache`, so there's no orphan-handling needed here.

**RLS**: every user table restricted to `auth.uid() = user_id` for all operations. `title_cache`/`provider_availability` get public `select` (for `anon`+`authenticated`) and no write access outside the service-role key used by the ingestion pipeline and seed script.

---

## 3. API surface

Almost everything is direct PostgREST access via the Supabase client — no hand-written CRUD backend needed:

| Need | Implementation | Custom backend code? |
|---|---|---|
| Browse by provider / sort / filter | Query a `v_catalog` view (joins `provider_availability`+`title_cache`, `removed_at is null`) with `.eq()`/`.order()` | No |
| Title detail + "where to watch" | Same view, filtered by `tmdb_id` | No |
| Search (title → which provider(s) carry it) | `search_titles(q)` SQL function (pg_trgm, Section 4), returns title + aggregated live providers in one call | No — one SQL function |
| Favorite/unfavorite, like/dislike, rate | Direct upsert/delete on `user_title_feedback`, RLS-enforced | No |
| Watchlist add/remove | Direct insert/delete on `user_watchlist` | No |
| "My List" | `user_watchlist` / `user_title_feedback` selected with a `title_cache` FK-embed | No |
| Recommendations ("For You") | `GET /api/recommendations` | **Yes** — the one real backend endpoint |

---

## 4. Search

MVP scale doesn't justify Algolia/Elasticsearch. Use **Postgres trigram similarity (`pg_trgm`)** on `title_cache.title`: one GIN index, query via `title % q OR title ILIKE '%'||q||'%'`, ranked by `similarity()`. Exposed as the single `search_titles` function, which also aggregates currently-available providers per result — directly answers "search a title, see which service(s) carry it" in one round trip. Full-text search (`tsvector`) is a viable later upgrade if the catalog grows; not needed now.

## 5. Sort & filter

- **Newest** → `release_date desc`
- **Popular/"Trending"** → TMDB `popularity desc` — **explicitly a proxy** for real usage (no watch-tracking exists yet); label it "Trending," not "Most Watched," in the UI to avoid overclaiming. Revisit once `user_title_feedback` has enough volume to derive a real PlayNext-based metric.
- **Rating** → TMDB `vote_average desc`
- **Filters**: provider, region (fixed `IL` for MVP, kept as a real column for forward compat), type, `availability_type`, genre (JSONB containment).

## 6. Recommendations

Simple content-based, computed **on-demand** (no batch/precompute job — consistent with avoiding Edge Functions/pg_cron):

1. Seed set = user's favorited/liked/highly-rated (≥7) `tmdb_id`s (most recent ~20).
2. **Cold start** (no seeds yet) → fall back to the same "Trending" query used for browse.
3. Per seed, call TMDB `/recommendations` (falling back to `/similar` when sparse).
4. Merge + score by (# seeds recommending it) + a small genre-overlap boost.
5. **Filter to our actual catalog** — only keep candidates with a currently-available `provider_availability` row. At MVP catalog size most TMDB suggestions won't be carried locally; that's an accepted, explicitly-stated MVP limitation.
6. Exclude anything already favorited/watchlisted/disliked. Return top 10-20.
7. Optional lightweight TTL cache table for TMDB recommendation responses (not a cron job — just avoids refetching on every page view).

**Explicit non-goal**: collaborative filtering — a clear post-MVP step once there's a real user base with enough interaction density to make it outperform content-based.

---

## 7. Mock data seeding (stand-in until the real feed ships)

- `data/mock-feed.jsonl` — 20-30 hand-picked real titles (movies + series, spread across Netflix IL, Disney+ IL, Amazon Prime IL, YES), shaped like a real feed row (`imdb_id`, `provider`, `region`, `type`, `availability_type`, `watch_url`).
- `scripts/seed-mock-data.ts` — resolves each `imdb_id` → `tmdb_id` → metadata via a **shared resolver module** (`lib/tmdb-resolve.ts`) that the real ingestion pipeline will also use, so there's one matching codepath, never two that can drift. Upserts into `title_cache` + `provider_availability` exactly like a real feed row would (plain idempotent upsert — no staging/anti-join diffing needed for a manual one-off seed).
- When the real feed ships, this script is simply retired; the app never changes.

---

## 8. Explicit out-of-scope for MVP

Multi-region/i18n beyond Israel; native/mobile apps; collaborative-filtering recommendations; social features (sharing, following, reviews); price comparison/deal alerts; "leaving soon"/availability-change notifications; real usage-based "most watched" (needs watch-event tracking); offline support; admin dashboard/CMS (use Supabase Studio); payments/subscriptions; multiple profiles per account; content moderation; A/B testing; dedicated search service; precomputed/batch recommendation jobs; component/UI/E2E test automation (manual smoke tests cover that layer — see Testing below); full accessibility audit; theming beyond one default look.

### Testing

**Standing rule (see `CLAUDE.md` Workflow): every feature or bug fix gets unit test(s) in the same session**, scoped to data-access, resolver, API-route, and other pure/testable logic in `lib/`, `scripts/`, and `app/api/` — e.g. `lib/catalog.ts`'s query builders (mocked Supabase client), `lib/tmdb-resolve.ts`'s TMDB mapping (mocked `fetch`), `scripts/seed-mock-data.ts`'s feed-row Zod schema, and (from M7 on) `app/api/recommendations/route.ts`'s scoring/filtering logic. Vitest, `*.test.ts` colocated next to the code they cover, run via `npm test`. Added starting M2; M1's testable logic was backfilled at the same time.

**Still out of scope**, per the "explicit out-of-scope" list above: component/page rendering tests, browser/E2E automation, and any test that talks to a real Supabase/TMDB backend. Manual smoke tests (per Section 9's demo checkpoints) remain the verification method for the UI and integration layer.

**Safety rule for test files**: never import a script that performs live network/DB calls as a side effect of module import — guard its entrypoint (e.g. `scripts/seed-mock-data.ts`'s `isMainModule` check) so importing it for a pure helper (like its Zod schema) can't trigger a real run. This was discovered the hard way: an early version of `scripts/seed-mock-data.test.ts` imported the un-guarded script and briefly caused a real `main()` run (live TMDB calls + Supabase upserts) during `npm test`, before the guard was added.

---

## 9. Implementation Plan

Ordered the way we intend to build it. Each milestone is independently demoable, has a user story framing *why* it matters, and a concrete task checklist. Work top to bottom — later milestones depend on earlier ones.

### M0 — Project scaffolding
**Story:** As a developer, I want the project scaffolded with Next.js, TypeScript, Supabase, and deployed to Vercel, so we have a working, deployed foundation to build every feature on top of.

- [x] Initialize Next.js app (App Router, TypeScript) at repo root
- [x] Set up ESLint/Prettier
- [x] Create the Supabase project; record project URL, anon key, service role key
- [x] Add env vars locally (`.env.local`) and in Vercel project settings
- [x] Connect the repo to Vercel, confirm a first deploy succeeds
- [x] Add base layout (header/nav placeholder) and a placeholder home page
- [x] Commit the scaffold

*Demo: empty app live on a Vercel URL.*

### M1 — Schema + mock data
**Story:** As a developer, I want the full database schema (ingestion tables + app tables) created and populated with realistic mock data, so every later feature has real data to query against instead of being blocked on the external feed.

- [x] Migration: `title_cache`, `provider_availability` (schema defined in `docs/INGESTION.md`, Section 5)
- [x] Migration: `profiles`, `user_watchlist`, `user_title_feedback`
- [x] RLS policies on all user tables + public-read-only policies on `title_cache`/`provider_availability`
- [x] Trigger: auto-create `profiles` row on signup
- [x] `v_catalog` view (joins availability + metadata, live rows only)
- [x] `pg_trgm` extension + GIN index on `title_cache.title`
- [x] `search_titles` SQL function
- [x] Write `data/mock-feed.jsonl` (20-30 titles across Netflix IL, Disney+ IL, Amazon Prime IL, YES)
- [x] Write `lib/tmdb-resolve.ts` (shared imdb→tmdb→metadata resolver)
- [x] Write `scripts/seed-mock-data.ts`
- [x] Run the seed script; verify rows in Supabase Studio
- [x] Re-run the seed script; confirm it's idempotent (no duplicates/changes)

*Demo: seeded rows visible and queryable in Supabase.*

### M2 — Browse & title detail
**Story:** As a user, I want to pick a streaming service and browse the titles available on it, and open a title to see where it can be watched, so I can explore the catalog.

- [x] Provider picker component
- [x] Browse grid page, querying `v_catalog` filtered by provider + region
- [x] Title card component (poster, title, year, type)
- [x] Title detail page (`/title/[tmdb_id]`) — overview, genres, rating, list of providers/watch links
- [x] Loading and empty states for both pages

*Demo: pick Netflix → see titles → open one → see where to watch it.*

### M3 — Sort & filter
**Story:** As a user, I want to sort and filter the browse results, so I can find something to watch faster instead of scrolling everything.

- [x] Sort control: newest / trending / rating / alphabetical, wired to query ordering
- [x] Filter controls: type, genre, availability type
- [x] Supporting indexes on sort/filter columns (if not already covered)
- [x] Persist sort/filter selection in the URL query string

*Demo: live sort/filter on the browse page, shareable via URL.*

### M4 — Search
**Story:** As a user, I want to search for a specific movie or show and immediately see which service(s) carry it, so I don't have to browse manually.

- [ ] Search bar component (debounced input)
- [ ] Wire to the `search_titles` RPC
- [ ] Results list showing title + provider badges
- [ ] No-results state

*Demo: typo-tolerant search returning a title and its live providers.*

### M5 — Authentication
**Story:** As a user, I want to sign up and log in with email/password or Google, so I have an account that remembers my preferences.

- [ ] Configure Supabase Auth: email/password + Google OAuth app registration
- [ ] Sign up / sign in / sign out UI
- [ ] Wire Supabase auth session handling (client + server, Next.js middleware)
- [ ] Verify a `profiles` row is created automatically on first sign-in, both ways
- [ ] Auth-aware nav (user menu when logged in, sign-in prompt when not)

*Demo: create an account both ways; session persists across reload.*

### M6 — Favorites, watchlist, like/dislike, rating
**Story:** As a signed-in user, I want to mark titles as favorite, like/dislike them, add them to a watchlist, and rate them, so I can track what I care about and build the signal recommendations will use.

- [ ] Favorite / like-dislike / rating controls on the title card and detail page
- [ ] Wire mutations to `user_title_feedback` (upsert)
- [ ] Wire watchlist add/remove to `user_watchlist`
- [ ] "My List" page (watchlist + favorites, each with its own view)
- [ ] Verify RLS: a second test account cannot see or modify the first account's data

*Demo: favorite/like/rate a few titles, see them reflected in My List.*

### M7 — Recommendations
**Story:** As a signed-in user, I want to see titles recommended to me based on what I've liked or rated highly, so I can discover something new to watch.

- [ ] `/api/recommendations` route handler
- [ ] Seed-set gathering from `user_title_feedback` (favorites/likes/rating ≥ 7)
- [ ] Cold-start fallback to the Trending query when there's no seed data yet
- [ ] Per-seed TMDB `/recommendations` (fallback `/similar`) calls
- [ ] Merge + score candidates (seed count + genre overlap)
- [ ] Filter results to titles currently available in our catalog
- [ ] Exclude already favorited/watchlisted/disliked titles
- [ ] "For You" UI section on the home/browse page
- [ ] (Optional) TTL cache table for TMDB recommendation responses

*Demo: like two titles, see the "For You" section update accordingly.*

### M8 — Polish & production hardening
**Story:** As a user, I want the app to behave well when things are empty, loading, or go wrong, and to work on my phone, so the MVP feels like a finished product rather than a prototype.

- [ ] Loading skeletons across all data-fetching pages
- [ ] Empty states (no search results, no favorites yet, no recommendations yet)
- [ ] Graceful handling of TMDB errors/rate limits
- [ ] Responsive layout pass (mobile/tablet/desktop)
- [ ] Basic SEO metadata (titles, OG tags)
- [ ] Final production deploy + full manual smoke test of the end-to-end journey

*Demo: complete user journey — browse → search → sign up → favorite titles → see recommendations — on the live production URL.*

### Post-M8 (queued, not MVP work)
Build and stand up the real daily ingestion pipeline per `docs/INGESTION.md`, then swap the mock seed for it. Expected to require zero changes to application code, since both sources populate the exact same `title_cache`/`provider_availability` tables through the same resolver logic. Track this workstream's own progress in `docs/INGESTION.md`'s Progress Log, not here.

---

## Verification (cross-cutting, applies throughout implementation)

- Seed script: run twice in a row, confirm idempotent.
- Browse/sort/filter: confirm each sort key and filter combination against seeded mock data returns the expected ordering/subset.
- Search: confirm typo-tolerant matches return correct provider lists per result.
- Auth: sign up via email/password and via Google, confirm a `profiles` row is created exactly once each way.
- Favorites/watchlist: confirm RLS — a second test user cannot read/modify the first user's rows.
- Recommendations: test both cold-start and seeded paths; confirm disliked/watchlisted titles are excluded.
- End-to-end: full user journey on the Vercel-deployed app.

## Critical files

- `supabase/migrations/0001_user_data_and_views.sql` — new tables, RLS, `v_catalog` view, `search_titles` function, `pg_trgm` index
- `data/mock-feed.jsonl` — hand-written mock catalog
- `scripts/seed-mock-data.ts` — resolves mock feed via TMDB, upserts into `title_cache`/`provider_availability`
- `lib/tmdb-resolve.ts` — shared imdb→tmdb→metadata resolver (reused by mock seed now, real pipeline later)
- `app/api/recommendations/route.ts` — the one custom backend endpoint

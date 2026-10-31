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

### 2026-10-31 — M5 complete: authentication
- Did: added `@supabase/ssr` and three new client factories — `lib/supabase-browser.ts` (`createBrowserSupabaseClient()`, cookie-backed session for Client Components), `lib/supabase-server.ts` (`createServerSupabaseClient()`, cookie-aware for Server Components/Route Handlers/Server Actions), and `middleware.ts` (refreshes the session cookie on every request so Server Components always see a current session — the standard `@supabase/ssr` pattern). Added `lib/auth.ts` (`signUpSchema`/`signInSchema` Zod schemas — signup requires an 8-char password, sign-in just requires non-empty; `friendlyAuthErrorMessage()` mapping Supabase's plain-English `AuthError.message` strings for the 3 common cases to clearer UI text) with `lib/auth.test.ts` (11 tests). Built `app/components/login-form.tsx` (client component; sign-in/sign-up tab toggle, email+password fields, a "Continue with Google" button calling `signInWithOAuth({ provider: "google" })`, redirecting through `/auth/callback`) and `app/login/page.tsx` (redirects to `/` if already signed in; `export const instant = false` since that redirect check needs `cookies()` — see Decisions). Added `app/auth/callback/route.ts` (one handler covers both the Google OAuth redirect and the email-confirmation link, since Supabase's PKCE flow hands back the same `?code=` for each — exchanges it for a session, redirects to `/`) and `app/auth/actions.ts` (`signOutAction`, a Server Action used by the header's sign-out form). Split `app/components/header.tsx` into a static shell plus `app/components/auth-nav.tsx` (async Server Component reading the session, wrapped in `<Suspense>` — see Decisions) rendering "Sign in" or the user's email + a sign-out button. The user then did the Google Cloud Console + Supabase dashboard setup (OAuth consent screen, Web application client with the Supabase project's callback URL as its redirect URI, pasted into Supabase's Google provider) — confirmed working end-to-end via a real browser click-through. That surfaced two more issues, both fixed in this same session: (1) `auth-nav.tsx` crashed `next build` with "Next.js encountered the unstable value `Date.now()` while prerendering" — `supabase.auth.getUser()` calls `Date.now()` internally (token-expiry check), which `cacheComponents` won't allow inside a `<Suspense>`-deferred subtree unless the component has explicitly called a Next-recognized dynamic API first; fixed by adding `await connection()` (from `next/server`) at the top of `AuthNav`, ahead of the Supabase call. (2) `profiles.display_name` stayed `NULL` after a real Google sign-in even once that was fixed — added `supabase/migrations/0004_profile_display_name_from_oauth.sql` (the signup trigger now does `coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')` into `display_name`) plus `0005_profile_display_name_on_link.sql` once testing showed the first migration still wasn't enough for an account that signs up via email/password first and links Google afterward (see Decisions) — both applied live via `supabase db push --db-url`.
- Decisions / deviations:
  - **Email/password was fully verified end-to-end via two throwaway Node scripts** against the live Supabase project (cleaned up after, no residue) before any browser was involved: (1) `signUp()` via the anon client confirmed email confirmation is required (no session returned) and that `handle_new_user`'s trigger fires on first signup — a `profiles` row with the right `user_id` existed immediately after; (2) a sign-in/sign-out round trip using `@supabase/ssr`'s own `createServerClient` cookie adapter (backed by a plain in-memory `Map` standing in for a browser's cookie jar) proved that a cookie written by one client instance (simulating `login-form.tsx`'s browser-side `signInWithPassword`) is correctly read back by a *new* client instance constructed from those same cookies (simulating the next HTTP request hitting `middleware.ts`/`createServerSupabaseClient()`), and that `signOut()` clears it. The user then separately did a real browser click-through for both email/password and Google, which is what caught the two bugs above — scripted checks alone wouldn't have, since neither exercises `next build`'s prerendering pass or a real OAuth round trip.
  - **Confirmed this Supabase project requires email confirmation before a session is issued** (default setting, not changed) — `login-form.tsx` handles this: after `signUp()`, if no session comes back, it shows "Check your email to confirm your account" instead of redirecting.
  - **`cacheComponents` (on since M0) forced a real design decision, not just a config workaround**: reading `cookies()` anywhere in the Server Component tree blocks prerendering unless that read is isolated behind `<Suspense>` or the route opts out of prerendering entirely — `next build` failed outright on both routes until this was addressed. For the header (present on every page via the root layout), split the auth-dependent slice into its own `auth-nav.tsx` wrapped in `<Suspense>` so only that slice is dynamic — the rest of every page's shell stays prerenderable, consistent with this doc's existing PPR/streaming pattern (`loading.tsx` skeletons). For `/login` — which needs `cookies()` directly in the page itself for the already-signed-in redirect — used `export const instant = false` instead of a Suspense split, since SSRing a low-traffic auth page on every request is simpler than streaming it and the latency difference is irrelevant there. Turned out `<Suspense>` alone wasn't sufficient for `auth-nav.tsx` specifically — see the `Date.now()`/`connection()` fix above; a recognized dynamic API (`cookies()`, `connection()`) has to actually be reached in that render before an incidental "unstable value" deeper in a library call (here, inside `supabase-js`) is allowed.
  - **`profiles.display_name` population needed two migrations, not one, because of how Supabase handles linking a second provider to an already-existing account**: `0004` only updates `handle_new_user()`, which runs `after insert on auth.users` — fine for a brand-new Google-only signup, but signing in with Google on an account that already exists (e.g. originally created via email/password) doesn't insert a new `auth.users` row, it merges the provider's data into the existing row's `raw_user_meta_data` instead, which only fires an `UPDATE`. `0005` adds a second trigger (`after update on auth.users`, guarded by `old.raw_user_meta_data is distinct from new.raw_user_meta_data`) that backfills `display_name` the same way, but only when it's still `NULL` — so a name the user sets themselves later (once a profile page exists) is never overwritten. Both migrations also backfill any pre-existing rows that already have the needed metadata. Confirmed working against the live project: the user's own test account (originally email/password) had `display_name` go from `NULL` to `'shahar avital'` immediately after `0005` was applied, with no further action.
  - Kept the existing anon-key `lib/supabase.ts` (`createPublicClient()`) untouched in substance — the public catalog reads (browse/search) don't need cookie-awareness for M5's scope, so its behavior is exactly what M2 built; only its env-var guard was later deduplicated into `lib/supabase-env.ts` (see the post-commit review round below).
  - **Post-commit `/code-review` round (after the first M5 commit, before pushing)**, run twice: first pass surfaced 6 findings, all fixed — (1) `app/auth/callback/route.ts` silently redirected to `/` even when `code` was missing or `exchangeCodeForSession` failed (e.g. the user cancels the Google consent screen), giving no feedback; now redirects to `/login?error=auth_callback` on either failure (plus a try/catch around the exchange call itself, added in the second pass) and `login-form.tsx` shows a generic error for it. (2) successful sign-in/sign-up only called `router.push("/")` with no `router.refresh()`, risking a stale cached "Sign in" header right after login (fixed — see below for why `router.push` + `router.refresh` was kept over a full `window.location.href` reload). (3) the `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` presence guard was duplicated verbatim across `lib/supabase.ts`/`supabase-browser.ts`/`supabase-server.ts`/`middleware.ts` — extracted to `lib/supabase-env.ts` (`getSupabaseEnv()`), with its own `lib/supabase-env.test.ts` (3 tests), and all four call sites now use it. (4) `auth.getUser()` (a real network round trip) was called independently by `middleware.ts`, `auth-nav.tsx`, and `login/page.tsx`, up to 3x per `/login` load — the two Server-Component call sites now share `lib/supabase-server.ts`'s new `getCurrentUser()`, wrapped in React's `cache()` to dedupe within a request (middleware's own call is a separate execution context and can't share that cache — left as-is, since independently re-verifying the session in both layers is the documented `@supabase/ssr` security pattern, not a bug). (5)/(6) were about `supabase/migrations/0005`'s display-name-extraction SQL being duplicated across 4 spots and the `login/page.tsx` comment claiming `export const instant = false` prevents prerendering when its type definition describes it as a prefetch-validation setting — the migration duplication was left as-is (already-applied, working migrations; not worth a 6th live `db push` to refactor for a style nit), but the `instant` claim was checked empirically (temporarily removed it and reran `next build`, which reproduced the exact prerendering crash) — turned out correct in effect: Next's own error message explicitly names `export const instant = false` as the fix for this exact case, so the comment was kept, just clarified.
  - **Second review pass (after the first round's fixes) surfaced one real false lead worth recording**: it suggested `router.push("/") + router.refresh()`'s ordering within one tick was unreliable and proposed replacing it with a hard `window.location.href = "/"` reload. That does sidestep the ordering question entirely, but introduces 2 new `@next/next/no-location-assign-relative-destination` lint warnings in a codebase that's otherwise been 100% lint-clean through every milestone (M0–M5) — and `router.push` immediately followed by `router.refresh()` in the same handler is itself the standard, widely-documented pattern for exactly this scenario (revalidating Server Component state right after a client-triggered auth change). Reverted to `router.push`/`router.refresh()` rather than trade a confirmed lint regression for a theoretical ordering concern with no concrete repro.
- Verified via `npm test` (76 passing — 73 after the first commit, +3 in `lib/supabase-env.test.ts`), `npm run lint`/`format:check`/`build` all clean throughout (including after the post-commit review fixes — rechecked every time), the two scripted Supabase-project checks described above, a real browser click-through by the user covering sign-up, email confirmation, sign-in, session persistence across reload, sign-out, and Google OAuth sign-in, and (for the post-commit fixes specifically) live `curl` checks against the dev server confirming `/login?error=auth_callback` renders the error message and `/auth/callback` with no `code` redirects to it.
- Next step: M6 — Favorites, watchlist, like/dislike, rating (Section 9): controls on the title card/detail page, upsert mutations to `user_title_feedback`/`user_watchlist`, a "My List" page, and an RLS check that a second account can't see or modify the first account's rows.

### 2026-10-31 — M4 complete: search
- Did: added `lib/search.ts` (`searchTitles(query)`, wrapping the `search_titles` RPC via `supabase.rpc()`; returns `[]` without a round trip for an empty/whitespace query; typed `SearchResultRow`/`SearchResultProvider` mirroring the function's return columns) with `lib/search.test.ts` (3 tests). Built `app/components/search-bar.tsx` (client component; debounced (300ms) controlled `<input>` that commits `?q=` onto the URL via `router.replace`), `app/components/provider-badges.tsx` (pill-per-provider using `lib/providers.ts` code→label/color), and `app/components/search-result-card.tsx` (poster thumbnail, title/year/type/rating, provider badges, or an "unavailable" note if `providers` comes back empty — possible when a title is in `title_cache` but every `provider_availability` row referencing it has been removed). `app/search/page.tsx` reads `searchParams.q` (trimmed), calls `searchTitles()` server-side, and renders one of three states: an initial "start typing" prompt (no `q`), a "No results for…" empty state, or the results list — plus `app/search/loading.tsx` skeleton. Wired the header's "Search" placeholder to a real `Link` to `/search`. Also extracted two small shared helpers while doing this (both now used by M3's code too): `lib/query-params.ts` (`firstSearchParam` — dedupes a `searchParams` entry into a plain string; `withUpdatedParam` — the set/delete-one-param-then-rebuild-the-URL logic, previously inlined in `sort-filter-bar.tsx` and duplicated into the first draft of `search-bar.tsx`) and `lib/format.ts` (`releaseYear`/`mediaTypeLabel`, previously inlined separately in `title-card.tsx` and the title detail page, and duplicated into the first draft of `search-result-card.tsx`), each with its own test file. Added `getProviderByCode()` to `lib/providers.ts` (+2 tests) to replace two inlined `PROVIDERS.find((p) => p.code === ...)` lookups (`provider-badges.tsx`, the title detail page's provider list).
- Decisions / deviations:
  - Ran `/code-review` against the diff twice after the initial implementation and fixed everything it surfaced that held up under its own verification pass: (1) the search input wrote an untrimmed value into the URL while comparing a trimmed one against the raw initial query, causing a spurious navigation on mount for a `q` with stray whitespace — fixed by trimming `q` once in `app/search/page.tsx` and basing all of `search-bar.tsx`'s comparisons on that already-clean value; (2) the debounced commit used `router.push`, burying `/search` under one history entry per typing pause — switched to `router.replace`; (3) `search-bar.tsx` didn't resync its input when `initialQuery` changed from outside (back/forward nav, a shared link) because the component can stay mounted across a same-route navigation — fixed via React's "adjusting state during render" pattern (not an effect, which `react-hooks/set-state-in-effect` rejects, and not a ref read during render, which `react-hooks/refs` also rejects — both discovered by `npm run lint`); this introduced a second piece of mirrored state (`lastCommittedQuery`) specifically so a navigation that merely *echoes* this component's own last commit doesn't get misread as an external change and snap the input back mid-type. A follow-up review pass hypothesized a race from that design (a stale in-flight `router.replace` response landing after a newer one) but a third review's verifier traced Next.js 16.4.3's router internals and confirmed superseded navigations are marked `discarded` and never applied — ruled out, not fixed, since there was nothing to fix.
  - `search_titles` has no region filter (unlike `v_catalog`/`getCatalogByProvider`) — left as-is since all mock data is `IL` already (Section 5's single-region MVP scope), so it's a no-op today; flagging here in case a future multi-region change needs to add `region` as a `search_titles` parameter too, not just to `v_catalog`.
  - Did not extract a shared poster-card or skeleton-list component despite `search-result-card.tsx`/`search/loading.tsx` structurally resembling `title-card.tsx`/`browse/[provider]/loading.tsx` — review flagged this each pass; declined because the two card types render different content (a search result's multi-provider badge row vs. a browse card's single-provider type/year line) and the loading-skeleton duplication follows the same already-established per-route pattern from M2/M3, so merging them now would be a speculative abstraction rather than one driven by an actual second use.
  - Noticed while smoke-testing: a stale `next dev` process left running from an earlier session was still holding port 3000, serving a build from before this session's header change (new routes like `/search` still worked through it, since Next dev compiles routes on demand — but the shared root-layout `Header` had been compiled once and wasn't picked up without a restart). Not a code bug; killed the stale process and restarted `next dev` fresh for every subsequent smoke test.
  - Verified via `npm test` (62 passing — 48 before this session +14 new across `lib/search.test.ts`/`lib/query-params.test.ts`/`lib/format.test.ts`/the 2 added to `lib/providers.test.ts`), `npm run lint`/`format:check`/`build` all clean, and manual smoke tests against the live dev server at each stage: `/search?q=breaking` and a deliberate typo (`braking bad`) both return "Breaking Bad" with its real `NETFLIX` provider badge, a nonsense query renders the no-results state, `/search` with no `q` (and with a whitespace-only `q`) renders the "start typing" prompt, and `/browse/netflix?sort=newest&type=movie` + `/title/1396` still work after the `query-params.ts`/`format.ts`/`getProviderByCode` extractions touched their code paths too.
- Next step: M5 — Authentication (Section 9): configure Supabase Auth (email/password + Google OAuth app registration — the Google OAuth app itself still needs creating per Prerequisites), sign up/in/out UI, session handling (client + server, middleware), verify the `profiles`-row trigger fires on first sign-in both ways, auth-aware nav.

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
- **Google OAuth app** — created in M5 (Google Cloud Console, OAuth consent screen + a Web application client; redirect URI `https://qtwozjmpysbrwzynmyoq.supabase.co/auth/v1/callback`, origins `http://localhost:3000` + the production URL). Client ID/Secret entered into the Supabase dashboard under Authentication → Providers → Google and enabled there. Note: the consent screen is still in Testing mode, so only accounts added as test users (Google Auth Platform → Audience) can sign in via Google until it's published — fine for MVP development, revisit before a real public launch.

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

- [x] Search bar component (debounced input)
- [x] Wire to the `search_titles` RPC
- [x] Results list showing title + provider badges
- [x] No-results state

*Demo: typo-tolerant search returning a title and its live providers.*

### M5 — Authentication
**Story:** As a user, I want to sign up and log in with email/password or Google, so I have an account that remembers my preferences.

- [x] Configure Supabase Auth: email/password + Google OAuth app registration
- [x] Sign up / sign in / sign out UI
- [x] Wire Supabase auth session handling (client + server, Next.js middleware)
- [x] Verify a `profiles` row is created automatically on first sign-in, both ways
- [x] Auth-aware nav (user menu when logged in, sign-in prompt when not)

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

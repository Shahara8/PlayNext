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

### 2026-11-09 (UI step 8) — Post-M8 task 5: sign in, reset, privacy, 404, error, skeletons
- **Views** per `docs/UI_DIRECTION.md` Section 4. Every route and behavior is kept: `/login` (Sign in, Sign up, Forgot password, Google, the redirect after sign-in, `?mode=reset` and `?error=`), `/reset-password` (both states), `/privacy`, Not found, the error pages, and server rendering where it was used.
  - **Centered card**, shared: `app/components/center-card.module.css` replaces `auth-page.module.css` and `status-page.module.css`. It's a `.card` at most 400 px wide, centered in the header's width with `--gutter`, with the `h1` inside, a muted `.lead` line, and `.actions` (full-width buttons, `.btn-primary` first).
  - **Sign in:** `LoginForm` renders the whole card, so the heading follows the mode ("Sign in" / "Create account" / "Reset password"), and so does the tab title. Sign in · Sign up are `.segmented` buttons with `aria-pressed`. Inputs and buttons are full width, then "or" between two rules and a secondary "Continue with Google".
  - **Messages:** new `app/components/form-message.tsx` (`FormMessage`): an icon plus text, errors in `--danger` (`role="alert"`) and confirmations in `--success` (`role="status"`), with `data-form-message`. The reset form and the reset link's retry state use it too.
  - **Reset password without a link:** primary "Request a new link" (`/login?mode=reset`), secondary "Back to home"; the copy is reworded but keeps "open the link in your reset email". **Not found:** primary "Back to home", secondary "Search the catalog". **Error:** primary "Try again", secondary "Back to home", then the reference. **Global error:** the same card with "Try again".
  - **Privacy:** a centered reading column, links as `.text-link`, headings on the global scale.
  - **Skeletons:** title, browse, search and My List already matched (rebuilt in their steps). Checked here by catching each one mid-navigation under a throttled network (a scratch script, not committed). No changes were needed.
- **Decisions** (recorded in the spec's as-built note):
  - Forgot-password mode hides the Sign in · Sign up control (it used to show both unselected); its heading names the mode and "Back to sign in" leaves it. Google still shows in every mode.
  - The privacy column is `33rem`, not `70ch`: Geist's "0" is wide, so `70ch` held ~99 characters per line (measured); `33rem` holds ~71.
  - The forgot-password intro line stays muted; only results of an action are `--success`.
- **Logic and tests** (11 new, 675 total): `lib/login.ts` has `LOGIN_TABS`, `loginCopy()` (heading and submit label per mode), `loginDocumentTitle()` and `parseLoginParams()` (moved out of the page). `/login` now has a `generateMetadata` that titles it after the starting mode.
- **Smoke** (52 checks, was 47):
  - New helpers: `has.centerCard(heading, actions)` (at most 400 px, centered, the buttons in order with the primary first), `has.loginPieces(mode)`, `has.formMessage(kind, text)`, `has.resetNoLinkCard` and `has.readingColumn` (characters per line measured with a canvas, at most 80).
  - The login, reset, privacy and not-found checks use them. New pages "login forgot password" and "login link error", and a new check "login: switch modes, validation error" (sign up, a short password's error, back to sign in with it cleared, forgot password, back).
  - Sign-in still goes through `form button[type=submit]`. `clickByText()` is exported and `ui-capture` uses it instead of its own copy; the ready checks for capture views 10–16 use the new helpers.
- **Screenshots** (views 10–16 and 23, both themes, both widths): fixed from the first capture: the privacy column (above), and the loose spacing around "Forgot password?" (a negative block margin keeps its 44 px target).
- **`/code-review` (medium)**, fixed:
  - `readingColumn` set the canvas font from the `font` shorthand, which can read as `''`.
  - The centering checks measured against `innerWidth` (includes a scrollbar); they now use `clientWidth`.
  - `loginModes` clicked the text buttons by a generic selector; it now clicks them by label.
  - Google sign-in didn't clear a previous confirmation.
  - The tab title stayed "Sign in" in the other modes.
  - The Google button borrowed the submit's class; it's now `.fullWidth`.

  Declined:
  - Showing the sign-up and reset confirmations as neutral rather than `--success`: the spec asks for info in `--success`, and both confirm the action went through.
  - Raising the `.tabs` overrides' specificity over `.segmented`: globals load first, the convention every step relies on (declined in step 7 too).
  - `has.loginPieces` using `this`: the existing `has` getters do the same.
- `docs/UI_REVIEW.md`: views 10–16 and 23, the error page and form messages. `docs/UI_DIRECTION.md`: step 8 ticked, with an as-built note. `CLAUDE.md`: the step 8 pieces.
- Checked: typecheck, lint and 675 tests clean; `ui-capture` against a local build; local smoke 52/52.
- Next step: `docs/UI_DIRECTION.md` step 9 (wrap-up: full `ui-capture` review, contrast and focus pass, `docs/UI_REVIEW.md` fully updated, production smoke, then ask about a second Gemini review).

### 2026-11-09 (UI step 7) — Post-M8 task 5: My List
- **My List** (`app/my-list/page.tsx`) per `docs/UI_DIRECTION.md` Section 4. It keeps `/my-list?view=favorites`, server rendering, and the signed-out redirect to `/login`.
  - The header's width and `--gutter`.
  - The `h1` "My List", then Watchlist · Favorites as the shared `.segmented` control: a `nav` of two links, `aria-current="page"` on the current one (which also fills it). On phones it sits under the title at full width with two equal halves; from 601 px it shares the title's row at the inline end.
  - The shared `.title-grid` of `TitleCard`s, as before.
  - The empty state is a centered `.card` panel (`data-empty-state`): the line as an `h2` ("Your watchlist is empty" / "No favorites yet"), a muted hint (the old copy's second sentence) and a `.btn-primary` "Find something to watch" home.
  - The loading skeleton follows the new shape.
- **Logic and tests** (7 new, 664 total): `lib/my-list.ts` has `parseMyListView()` (moved out of the page: anything but "favorites" is the watchlist, the first value wins when the param repeats), `MY_LIST_TABS` (labels and links, in order) and `myListEmptyCopy()` (the panel's line and hint per tab).
- **Smoke** (still 47 checks): `has.myListPieces(view)` replaces `has.myList` on the two My List checks. It checks the two links in order with only the right one current, then either the grid or the empty panel (its line and button home), never both. The test account's lists aren't empty, so smoke sees the grid branch; `ui-capture`'s empty shot (view 22) waits on the same check plus the panel, which covers the other branch.
- **Screenshots** (views 20, 21 and 22 in both themes at both widths): nothing needed fixing. The empty Favorites panel isn't in a capture (the test account has a favorite); it's the same markup with the other copy.
- **`/code-review` (medium):** no correctness bugs. Fixed: the ready expressions checked the current tab twice (`has.myList` plus `has.myListPieces`), and the desktop tab skeleton's width was a bare number (now a `calc()` of the same values). Declined: raising the `.tabs` overrides' specificity over `.segmented`, since `globals.css` loads first so module rules win ties (Section 3's convention, which every step relies on). The other two findings were the docs below, not written yet when the review ran.
- `docs/UI_REVIEW.md`: views 20, 21 and 22 and the skeleton line. `docs/UI_DIRECTION.md`: step 7 ticked, with an as-built note in the My List spec. `CLAUDE.md`: the step 7 pieces.
- Checked: typecheck, lint and 664 tests clean (`format:check` flags only `CLAUDE.md`, CRLF working copy, as before); `ui-capture` against a local build; local smoke 47/47.; committed and pushed as `c4eb30d`; **production smoke 47/47** after the deploy.
- Next step: `docs/UI_DIRECTION.md` step 8 (sign in, reset, privacy, 404, error, skeletons).

### 2026-11-09 (UI step 6) — Post-M8 task 5: browse
- **Browse page** (`app/browse/[provider]/page.tsx`) per `docs/UI_DIRECTION.md` Section 4. It keeps every query parameter (`sort`, `type`, `avail`, `genre`) and server rendering.
  - The header's width and `--gutter`.
  - A header block: the service's dot and name as the `h1`, then a muted count line ("8 titles"; with filters "6 of 8 titles · Clear filters").
  - The four selects (`SortFilterBar`, restyled): 2×2 on phones, one row from 601 px.
  - The shared `.title-grid` of `TitleCard`s. The empty states keep their copy, now in a `.card` panel.
  - The loading skeleton follows the new shape and reuses the bar's grid.
- **Logic and tests** (22 new, 657 total):
  - `lib/browse.ts`: `parseBrowseParams()` (moved out of the page: an unknown sort falls back, an unknown type or availability is ignored), `hasActiveFilters()` and `clearFiltersHref()`.
  - `browseCountLabel()` in `lib/format.ts`: `titleCountLabel()` without filters, "N of M titles" with them, pluralized on M, and never showing M below N (the two are separate reads).
  - `getProviderFacets()` in `lib/catalog.ts` replaces `getProviderGenres()`: the genres plus PostgREST's exact count, from the same read. A missing count throws rather than showing "0 titles".
- **Decisions** (recorded in the spec's as-built note):
  - **Clear filters keeps the sort**, so sort alone isn't a filter: no "of M" and no link. Sort orders the list rather than narrowing it, the spec lists it apart from the filters, and the old empty-state link already kept it.
  - **The link sits in the count line, not the filter bar.** The first build put it after the selects. On phones that gave it a row of its own and left a gap (seen in the screenshots); next to the count it also explains itself.
  - When nothing matches, only the empty panel's "Clear filters" shows.
  - The Genre select always shows (just "All" for a service with no titles), so the bar keeps its 2×2 shape. A genre from the URL that isn't in the list still shows as selected.
- **Smoke** (47 checks, was 43):
  - `has.browsePieces(clearHref)`: the count's wording, the four labelled selects in order, and `data-clear-filters` only when filtered, pointing at the right URL. It runs on "browse" and "browse sorted"; the old `main select` check is replaced.
  - New checks "browse filtered" (`?sort=rating&type=tv_series` → `/browse/netflix?sort=rating`) and "browse no matches" (`?avail=free`: one Clear filters link, no grid).
  - Both new checks rely on the mock seed, like the Partner TV check.
- **`/code-review` (medium)**, fixed:
  - The total was `rows.length`, which PostgREST caps at 1,000 rows. A large service would read "1,000 titles" on browse and "3,456 titles" on its home tile. It's now the exact count, and the unfiltered label uses it too.
  - Two Clear filters links on the no-matches view.
  - The skeleton copied the bar's grid CSS.

  Declined:
  - The second read of the provider's rows (the old page did it too; paging will restructure these reads).
  - Sorting or dropping a URL genre missing from the list: showing what the grid is filtered by is honest.
  - The new smoke checks depending on the seed: noted in the script, revisit at the real-feed cutover.
- Noted, not changed: with filters, N is still the length of the rows read, so it would stop at 1,000. This comes with paging, which the real feed will need anyway (`docs/UI_REVIEW.md` view 02).
- `docs/UI_REVIEW.md`: views 02, 03 and 04 and the skeleton line (view 18 is "as view 02", still true). `docs/UI_DIRECTION.md`: step 6 ticked, with an as-built note in the Browse spec. `CLAUDE.md`: the step 6 pieces.
- Checked:
  - Typecheck, lint and 657 tests clean. `format:check` flags only `CLAUDE.md` (CRLF working copy, as before).
  - `ui-capture` against a local build: views 02, 03, 04 and 18 reviewed in both themes at both widths.
  - Local smoke 47/47.
  - Committed and pushed as `e3a4969`; **production smoke 47/47** after the deploy.
- Next step: `docs/UI_DIRECTION.md` step 7 (My List).

### 2026-11-09 (UI step 5) — Post-M8 task 5: search
- **Search page** (`app/search/page.tsx`) per `docs/UI_DIRECTION.md` Section 4: the header's width and `--gutter`; the `h1` "Search", then the field; with a query, the line "N results for “q”" (`role="status"`) and, after a typo, a muted "Showing closest matches"; results in one column, two from 900 px. The empty copy is unchanged, and the no-results copy is unchanged too but sits in a `.card` panel ("browse by service" is still a link home). The loading skeleton follows the new shape.
- **Field:** `SearchBar` now looks like the home page's field (both import `app/components/search-field.module.css`, renamed from `home-search.module.css`, and a shared `SearchIcon` in `search-icon.tsx`, which the header uses too). It stays live and debounced and keeps `/search?q=`, and it is now also a GET form with a Search button, so Enter works before JavaScript and commits right away after it (closing a phone keyboard). It autofocuses only when the page has no query.
- **Fix (old bug, already in production):** after each debounced commit, the field blanked until the navigation landed ("strnger" → "" → "strnger", seen by sampling the input in headless Chrome), and anything typed in that window was lost. The render-time check compared the new `initialQuery` with the query just committed, which always differ until the navigation lands. It now reacts only when `initialQuery` changes, and replaces the text only if it isn't one of the field's own last few commits (back/forward and shared links still replace it). Enter also cancels the pending debounce, so it doesn't search twice. Checked with the same probe: no blank, typing during a navigation is kept, one request on Enter, back still restores the old query.
- **Result card** (`app/components/search-result-card.tsx`): no longer one big link. An `article` with the poster link (skipped by keyboard and screen readers: the same destination as the title) and an `h2` title link, "year · type · ★ rating", then one item per service, sorted subscription/free first: a service-colored `.btn-service` "Watch on Netflix →" (new tab; named "Watch on Netflix, Subscription (opens in a new tab)") or, without a link, a `.chip` pill "● Partner TV · Subscription". `ProviderBadges` was removed (search was its only user).
- **Logic and tests** (10 new, 635 total): `showsClosestMatches()` and `resultsLine()` in `lib/search.ts`; `serviceColorVars()` in `lib/providers.ts`, now shared by `WhereToWatch` and the result card.
- **Deviations** (recorded in the spec's as-built note):
  - "Showing closest matches" shows when *no* result contains the query, not when the best match doesn't. `search_titles` ranks by trigram similarity, so a short near-miss ("Kong" for "king") can rank above a title that contains the query.
  - Case, accents, punctuation and spaces are ignored in that check.
  - At the 20-result limit the line says "Top 20 results", since there may be more.
- **Smoke** (43 checks, was 42):
  - The search page check now also needs `has.searchPieces` (the field keeps the query, the results line and the hint, every Watch button reads "Watch on … →" and opens a new tab, at least one: Stranger Things' Netflix link, a mock-seed row) and `has.noNestedLinks`.
  - New check "search page: results as you type".
- **Found in the screenshots and fixed:**
  - the no-link service chip was as big as a Watch button and read as a disabled one (now a normal pill);
  - the no-results line was bare text (now a panel).

  Several services per card were checked by injecting extra items in the browser, since no title in the catalog has more than one.
- **`/code-review` (medium)**, fixed:
  - the field blanking (above);
  - the double commit on Enter;
  - the hint judging only the first result;
  - spaces counting in the match;
  - the copied service-color mapping (now `serviceColorVars()`);
  - the results section labelled by the changing results line.

  Declined:
  - folding accents in the hint although the database's `ilike` doesn't: "amelie" finding "Amélie" isn't a typo the user needs warning about;
  - smoke needing a Watch button: tied to the mock seed, like the Partner TV check; revisit at the real-feed cutover.
- Noted, not changed: `search_titles` doesn't filter providers by region (the step 4 fix was for `getCatalogByTitle`). It needs a migration, so it's left for the real-feed cutover, when a second region could appear.
- `docs/UI_REVIEW.md`: views 05, 06 and 07, plus the search result card, service colors and loading skeleton lines. `docs/UI_DIRECTION.md`: step 5 ticked, with an as-built note in the Search spec.
- Checked:
  - Typecheck, lint and 635 tests clean. `format:check` flags only `CLAUDE.md` (CRLF working copy, as before).
  - `ui-capture` against a local build: views 05, 06 and 07 reviewed in both themes at both widths, and view 01 (shared field and icon) is unchanged.
  - Local smoke 43/43.
  - Committed and pushed as `c2089cc`; **production smoke 43/43** after the deploy.
- Next step: `docs/UI_DIRECTION.md` step 6 (browse).

### 2026-11-09 (UI step 4) — Post-M8 task 5: the home page
- **Home** (`app/page.tsx`) per `docs/UI_DIRECTION.md` Section 4, top to bottom:
  - **Search first:** the `h1` "Where can I watch…", a short line, and `app/components/home-search.tsx`: a plain `<form action="/search" role="search">` with `name="q"` (placeholder "e.g. Stranger Things") and a primary Search button. It works before JavaScript and lands on `/search?q=…`.
  - **Service tiles** ("Browse by service"): `ProviderPicker` changed in place. Each tile has a 3 px top bar in the service color, the dot and name, "N titles" and the two most popular titles, and links to `/browse/<slug>`. Phones: one sideways-scrolling row with snap, to the screen edges; from 761 px, one row of equal columns. The Suspense fallback is `ProviderTiles` without counts, so the links work while data loads, and a failed read leaves just the names.
  - **Trending now:** `app/components/featured-title.tsx`, the top trending title as a wide card (poster, linked title, "year · type · ★", a 3-line overview) with its Where to watch rows (`WhereToWatch`'s new `plain` prop: no card frame, an `h3`). A failed read leaves the section out; a skeleton shows while loading.
  - **For You / Trending:** the grid as before, minus the featured title.
- **Data** (no migration):
  - `getProviderSummaries(providers)` in `lib/catalog.ts`: one request per provider returning the exact count and its top 2 rows by popularity, with a `tmdb_id` tie-break. Rows equal titles, since `provider_availability` is unique per (provider, region, title). A missing count throws rather than showing "0 titles".
  - `getFeaturedTitle()`: the top row's key (`limit(1)`), then `getCatalogByTitle`; null for an empty catalog or a title that went away. The page reads it once per request through a React `cache()` wrapper (`getHomeFeatured`), shared with the grid.
  - `withoutTitle()` in `lib/recommendations.ts`: the grid asks for 13 and drops the featured title, so both reads run in parallel and the title isn't shown twice.
  - `titleCountLabel()` in `lib/format.ts` ("1 title", "1,234 titles", "No titles yet"), for browse in step 6 too.
  - **Fix found in review:** `getCatalogByTitle` didn't filter by region, so once the feed has a second region the title page and featured card would list its services. It now filters by `REGION`.
  - Tests: 18 new (625 total).
- **Deviations:**
  - The spec's placeholder "Where can I watch… (e.g. Stranger Things)" doesn't fit a phone-width field, so it's split: the `h1` asks the question and the placeholder gives the example.
  - A Search button was added beside the field.
  - The desktop tile row is "one column per provider" rather than a fixed 5.
  - All recorded in the spec's as-built note.
- **Smoke** (42 checks, was 41):
  - `has.homePieces`: the search form, every tile showing a count, and the featured card with a title link and Where to watch, not repeated in the grid. It runs on the home page signed out and signed in.
  - New check "home search form → search results": types a typo, submits, and expects the search page with Stranger Things.
- **Found in the screenshots and fixed:**
  - the tiles' colored top border curved with the corners (now a straight bar);
  - a large gap under the featured card's "Where to watch";
  - an orphaned word in the intro line on phones.
- **`/code-review` (medium)**, fixed:
  - the region filter above;
  - `getFeaturedTitle` read a whole 100-row trending page for one title (now `limit(1)` of two columns);
  - an inline copy of `titleKey()`;
  - the fixed 5-column tile row;
  - the signed-in smoke check not covering the featured card;
  - `docs/UI_REVIEW.md`.

  Declined:
  - caching the five tile counts: they are small indexed reads today; revisit at the real-feed cutover, if home latency shows it;
  - filtering the featured title by the viewer's dislikes or watchlist: it's the global "Trending now" pick by spec, not a recommendation.
- `docs/UI_REVIEW.md`: views 01 and 17, and the service-colors and loading-skeleton lines. `docs/UI_DIRECTION.md`: step 4 ticked, with an as-built note in the Home spec.
- Checked:
  - Typecheck, lint and 625 tests clean. `format:check` flags only `CLAUDE.md` (CRLF working copy, as before).
  - `ui-capture` against a local build: views 01 and 17 reviewed in both themes at both widths, and view 08 (the title page, after the region filter) is unchanged.
  - Local smoke 42/42.
  - Committed and pushed as `dbd863d`; **production smoke 42/42** after the deploy.
- Next step: `docs/UI_DIRECTION.md` step 5 (search).

### 2026-11-09 (UI step 3) — Post-M8 task 5: title cards and grids
- **Card** (`app/components/title-card.tsx`) per `docs/UI_DIRECTION.md` Section 4: the 2:3 poster (`--radius`, a border) with a **★ rating badge** at its top inline-end corner (`--rating` on `--surface`), the title clamped to 2 lines, and "year · type". The poster, title and meta are one link; the badge is last in its DOM, so it reads "title, meta, TMDB rating 7.8", and the poster image is decorative (new `decorative` prop on `Poster`) so the title isn't read twice. Below: only **♡ and +**, 36 px icon buttons with a 44 px hit area (`::after`), pressed in the accent tint with an accent icon, pinned to the card's bottom so a row keeps them aligned when a title wraps.
- **`TitleActions`**: without `labeled` it now renders only favorite and watchlist (like, dislike and Rate are the title page's alone). `data-action` stays on both.
- **Data:** `vote_average` added to `TitleSummary` and its `title_cache` embed (`lib/user-titles.ts`) and to `CatalogTitle` and its columns (`lib/catalog.ts`; the For You cards come from it). No migration: the column was already in `title_cache` and `v_catalog`. Tests assert the select strings (`user-titles`, `catalog`) and the recommendations fixture got the field.
- **`ratingLabel()`** (`lib/format.ts`, 5 tests, 607 total): one decimal, null for an unknown score or 0 (TMDB's value for no votes), including values that round to "0.0". The card, the title page and the search result card all use it, so a zero-vote title shows no "★ 0.0" anywhere.
- **Grid:** a shared `.title-grid` in `app/globals.css` (2 / 3 from 601 px / 5 from 900 px / 6 from 1180 px), replacing three copies of an `auto-fill` grid (home For You, browse, My List). `TitleCardSkeleton` replaces three skeleton copies; the For You skeleton draws `HOME_LIMIT` cards. Home, browse and My List adopted `--gutter`.
- Deviation: row gaps are 20/24 px rather than the spec's 12–16 px (column gaps are 12/16), to keep each card's buttons clearly apart from the poster below them (a judgment call, not tried at 16 px). Recorded in the spec's as-built note.
- **Smoke** (still 41 checks): `has.titleCards` (♡ and + on cards, no like or dislike) on signed-out browse and home, and `has.cardsIfAny` (the same, only if the page has cards) on the signed-in home and both My List tabs.
- `docs/UI_REVIEW.md`: the Title card and Grids lines, plus views 01 and 18. `docs/UI_DIRECTION.md`: step 3 ticked, with an as-built note in the cards spec.
- **Found in the screenshots and fixed:** the ♡/+ row of a card with a two-line title sat lower than its neighbors' (now pinned to the bottom); ♡ drew smaller than + (bigger glyph).
- **`/code-review` (medium)**, all fixed: the search result card still printed "★ 0.0" (now `ratingLabel`); the For You skeleton drew 6 cards for up to 12 (a layout shift on desktop); the card guard only ran on browse (now home and My List too); the `.card > :last-child` rule depended on DOM order (now a wrapper with its own class); the step tick and this entry.
- Checked: typecheck, lint and tests clean; `format:check` flags only `CLAUDE.md` (CRLF working copy, as before). `ui-capture` against a local build: views 01, 02, 03, 17, 18, 20 and 21 reviewed in both themes at both widths, plus 06 and 08 (rating helper). Local smoke 41/41. Committed and pushed as `7764c75`; **production smoke 41/41** after the deploy.
- Next step: `docs/UI_DIRECTION.md` step 4 (home).

### 2026-11-09 (UI step 2) — Post-M8 task 5: the title page
- **Title page** (`app/title/[media_type]/[tmdb_id]/page.tsx`) per `docs/UI_DIRECTION.md` Section 4. Phones: a compact top block (120 px poster beside the title, "year · type · ★ rating", genre chips and Share), then Where to watch, the actions and the overview. Desktop (above 800 px): the 260 px poster beside one column holding the same blocks. The page uses the header's width and `--gutter`, so the poster lines up with the logo. The loading skeleton follows the new shape.
- **Where to watch** is a new component, `app/components/where-to-watch.tsx` (step 4's featured title will reuse it). It is a card with one row per service: a dot, the name, the availability (Subscription and Free in `--success`), and a service-colored "Watch →" `.btn-service` that opens in a new tab, or muted "No direct link yet". On desktop, 3 or more services become tiles (CSS `:has()`, so no prop is needed). It was checked with 4 rows cloned in the browser, since every title has one service today.
- **Availability sort:** `lib/availability.ts` orders subscription, free, rent, buy, keeping the input order within a kind, and provides the labels. It has 11 tests (602 total), including unknown kinds and `Object.prototype` names.
- **Actions:** `TitleActions` has a `labeled` mode for the title page ("♡ Favorite", "+ Watchlist" / "✓ On watchlist", 👍, 👎, "Rate"), as `.btn-secondary` with the accent-tinted pressed state. Behavior is unchanged, and cards keep the compact icons until step 3. Up to 800 px the actions sit in two rows: Favorite and Watchlist first, then like, dislike and Rate. **Share** is a `.btn-secondary` with an icon.
- **Markup the scripts rely on:** every title action button now has `data-action` (`favorite`/`watchlist`/`like`/`dislike`). The labeled Favorite and Watchlist buttons are named by their visible text (WCAG 2.5.3, so "On watchlist" matches the screen), so `scripts/smoke.ts` and `scripts/ui-capture.ts` now select by `data-action` (`has.enabledAction`, which replaces `has.enabledButton`). The smoke title checks also wait for the "Where to watch" heading. There are still 41 checks.
- A shared `.sr-only` class in `app/globals.css` (used for "TMDB rating").
- `docs/UI_REVIEW.md`: views 08, 09 and 19, plus the service-colors line. `docs/UI_DIRECTION.md`: step 2 ticked, with as-built notes in the title page spec (the 800 px breakpoint, the column cap, `data-action`, the button naming) and `.sr-only` in the shared pieces.
- **`/code-review` (medium)**, fixed:
  - an unknown availability kind showed no label (it now shows the raw value);
  - `Object.prototype` keys broke the sort rank (now `Object.hasOwn`);
  - label-in-name on "On watchlist";
  - the one-off `.srOnly` moved to globals;
  - a gray dot beside an accent button for an unknown provider (both now use the accent);
  - the 600 vs 800 px action breakpoint.

  Declined:
  - the specificity of module rules against the shared classes (by design since step 0: `globals.css` is imported first, so module rules win ties);
  - the `grid-column` rule on `.info`'s children above 800 px (it has no effect in the flex column).
- Checked: lint, typecheck and build clean. `format:check` flags only `CLAUDE.md`, whose working copy has CRLF line endings from `core.autocrlf` (the committed file is LF and passes). `ui-capture` against a local build: views 08, 09 and 19 were reviewed in both themes at both widths, plus a 360 px phone and a 4-service page (scratch script), and browse cards are unchanged. Local smoke 41/41. Committed and pushed as `bce6ede`; **production smoke 41/41** after the deploy.
- Next step: `docs/UI_DIRECTION.md` step 3 (title cards and grids).

### 2026-11-09 (UI step 1) — Post-M8 task 5: header and footer
- **Header** (`app/components/header.tsx`, `auth-nav.tsx`) per `docs/UI_DIRECTION.md` Section 4. It is `--surface` with a bottom border and isn't sticky. It has the logo, a magnifier icon link to `/search` (`aria-label="Search"`), Browse (desktop only), My List, and either a primary "Sign in" button or the first name (muted) plus "Sign out". Every item is a 44 px target with a `--surface-2` hover fill. The auth skeleton now matches the Sign in button's height.
  - Deviations: the signed-in name is the first name at every width (it used to be the full name on desktop; the spec says "the same" on desktop). The name is hidden below 400 px, so the row fits on a 360 px phone. The email tooltip stays.
- **Footer**: the same surface and border as the header, "PlayNext" in bold, and muted underlined links with 44 px targets. Privacy stays on every page.
- **New layout token `--gutter`** in `app/globals.css` (1.5rem, 1rem at 600 px and below): the header and footer use it, and steps 2–8 should adopt it for page padding. Until then some phone pages sit 8 px further in than the logo (recorded in `docs/UI_DIRECTION.md` Section 3 and in `docs/UI_REVIEW.md`).
- **Smoke** (41 checks): `has.headerNav` (search icon link plus My List) on the home and My List pages, and a new "header one row on phones" check, signed out and signed in, at 412 and 360 px.
- No new logic, so no new unit tests (591).
- `docs/UI_REVIEW.md`: Header, Footer, and the Search and signed-in-home text updated.
- **`/code-review` (medium)**, fixed:
  - the 360 px signed-in wrap;
  - the phone padding override on `.btn` (dropped);
  - the duplicated `.iconLink` reset (now `.link.iconLink` once);
  - no layout guard in smoke (the one-row check above).

  Declined:
  - the auth skeleton can't match the signed-in width (the session is unknown until it streams; this was already the case);
  - the TMDB link's inline alignment (it looks aligned in all 92 captures).
- Checked: lint, typecheck, format and build clean. `ui-capture` against a local build: the header and footer were reviewed in every view, both themes and both widths (contact sheets of the top and bottom strips). Local smoke 41/41. Committed and pushed as `b2e2c24`; **production smoke 41/41** after the deploy.
- Next step: `docs/UI_DIRECTION.md` step 2 (title page).

### 2026-11-09 (UI step 0) — Post-M8 task 5: the foundation (tokens, theme setting, Geist, shared styles)
- **Tokens** for light and dark in `app/globals.css` (`docs/UI_DIRECTION.md` Section 3), with dark under both `data-theme="dark"` and the device preference unless Light was chosen. `lib/color.test.ts` reads them from the stylesheet and asserts WCAG AA for every text token on every background in both themes.
  - Two starting values failed on `--surface-2` and were darkened (light `--rating` `#a3480a`, `--danger` `#c81e1e`).
  - Two tokens were added: `--border-strong` (3:1 form-control borders) and `--accent-soft` (pressed fill).
  - Deviation, recorded in the doc's table.
- **Theme setting** System · Light · Dark:
  - `lib/theme.ts` holds the parsing, the attribute value and the no-flash `<head>` script. The script is unit-tested by running it against a fake DOM.
  - `app/components/theme-control.tsx` is a segmented control in the footer, using `useSyncExternalStore`, following other tabs, and still working when storage is blocked.
  - `<html suppressHydrationWarning>`. Pages are still prerendered (no cookies).
- **Geist** is the body font now. **Shared global classes:** `.btn`(-primary/-secondary/-service), `.input`, `.select`, `.chip`, `.card`, `.segmented`, `.text-link`, `.skeleton`, `:focus-visible`.
- Every CSS module moved onto the tokens. Existing components use the shared classes where they map directly:
  - the login and reset forms, the search input, the browse selects (now an aligned grid: 2×2 on phones, one row on desktop), the provider tiles, the search result cards, the chips, the "Where to watch" rows, and the status pages.
  - Text links use the accent; pressed title actions use the accent tint; hard-coded reds became `--danger`; logical properties where touched.
  - The per-view restructures stay for steps 1–8.
- **`onColor`** per provider (`lib/color.ts`: WCAG luminance and contrast, white or dark text). Netflix and Disney+ get white; Prime, yes and Partner TV get dark. All pass AA (tested).
- **`npm run ui-capture`** shoots every view in both themes:
  - `<view>-<width>-<light|dark>.png`, 92 images; views 24–25 are dropped.
  - Each view is loaded once and the emulated preference is switched in place.
  - A full run clears old PNGs and fails if `docs/UI_REVIEW.md` links to an image it didn't take.
  - `docs/UI_REVIEW.md` has a light and a dark row per view, and its Tech, Footer and pressed-state text is updated.
- **Smoke:** a new "theme setting" check (39 checks): Dark sticks across a reload, Light beats a dark device, System clears the choice.
- **`/code-review` (medium)**, fixed:
  - `globals.css` is imported first in the root layout, so module rules win ties with shared classes regardless of bundler order.
  - `global-error.tsx` carries the theme script.
  - The status pages use the shared `.btn` classes instead of a copy (global-error already imports `globals.css`).
  - `.segmented` ignores `aria-current="false"`.
  - The script's values are derived from `themeAttribute`.
  - The 3:1 border check covers `--surface-2`.
  - `useId` for the control's label.
  - Removed the unused `resolveTheme`.

  Declined: caching the control's `localStorage` read (one read per render of one small control).
- Checked: 591 tests; lint, typecheck, format and build clean. `ui-capture` against a local build was reviewed sheet by sheet in both themes at both widths (the filter grid was fixed from it). Local smoke 39/39. Committed and pushed as `2084a7d`; **production smoke 39/39** after the deploy.
- Next step: `docs/UI_DIRECTION.md` step 1 (header and footer).

### 2026-11-09 (UI direction chosen) — Post-M8 task 5: Direction 1 + two additions, light and dark; build plan written
- The user published Gemini's three mockups as Google Sites pages. Claude captured them with headless Chrome (the mockups are in cross-origin frames; their tabs were clicked with real mouse events), and the screenshots are in `.ui-review/gemini/` (gitignored). They were compared against the platform's four jobs.
- **Decided (user):** Direction 1 "Watch-First / Quick Guide" plus a Watch button per service on search results (from Direction 3) and service tiles with counts and sample titles on home (from Direction 2). Both light and dark themes; the build order was left to Claude: **foundation tokens first, then one view at a time in both themes**.
- Wrote **`docs/UI_DIRECTION.md`**: the decision, rules (only data we have, keep routes, no component library, AA contrast, logical CSS properties for later RTL), the visual system (tokens for both themes, a System/Light/Dark setting in localStorage with an inline no-flash script, Geist, provider `onColor`), a spec per view, and steps 0–9 with a per-step check routine. `CLAUDE.md` now lists it as required reading.
- Earlier the same day (2026-11-07 session, continued): `docs/UI_REVIEW.md` gained a "Purpose of the platform" section, and its brief now asks first for 2–3 directions with mockups; `ui-capture --doc-only` rebuilt the PDF.
- No app code changed.
- **Code review** (`/code-review` medium) of all the uncommitted work, before committing. Fixed 7 findings:
  - The watchlist is restored oldest first, so its order survives a capture.
  - A crash later in the run no longer drops the view failures already recorded.
  - `1. ` lists render in the PDF (the purpose list was one paragraph).
  - The reset-form shot is refused if the test account's email is still on the page.
  - That shot also checks the page's origin, since Supabase silently falls back to production for an unlisted redirect URL.
  - `CdpClient` (`scripts/smoke-lib.ts`) now fails every request at once after its socket closes, instead of each one waiting out 30 s; this also covers the smoke script.
  - The run warns when a PDF section hits Chrome's 200-inch page limit.

  Not changed: the header shows the account's display name ("Test Bot"), not its email; the argv parser that `ui-capture` and `smoke` each have stays as is; one redundant `setEmulatedMedia` call per view.
- After the fixes: 567 tests; lint, typecheck and format clean; a full `npm run ui-capture` against production (50 images, watchlist restored); production smoke 38/38. Everything from the 2026-11-07 session and this one was committed and pushed.
- Next step: `docs/UI_DIRECTION.md` step 0 (foundation), in a new session.

### 2026-11-07 (UI review captures) — Post-M8 task 5, first item: screenshots and descriptions for Gemini
- Built `npm run ui-capture` (`scripts/ui-capture.ts`, pure helpers plus 18 tests in `scripts/ui-capture-lib.ts`): full-page screenshots of 25 views and states at phone and desktop widths, signed out and signed in, including the empty states (no filter matches, no search results, empty My List), the login variants (sign up, forgot password, link error), both reset-password states, 404, and 2 dark-mode views. 50 images. Details and gotchas are in Section 8 Testing.
- Wrote `docs/UI_REVIEW.md`: a brief asking Gemini for concrete suggestions per view (what, why, size S/M/L, priority P1–P3, a cross-cutting section and a top 10, no redesign), the product context and constraints, the recurring elements, the states that aren't screenshotted (skeletons, error page, save failure, post-submit messages), and a description per view.
- Deliverable folder (gitignored, regenerate with `npm run ui-capture`): `.ui-review/`, with `images/`, `PlayNext-UI-review.md` and `PlayNext-UI-review.pdf` (29 pages, about 32 MB, one view per page). The PDF is there because the Gemini app caps how many files one message takes.
- Other changes: `scripts/smoke.ts` now exports `has` and `signIn` (no behavior change); `sharp` is a pinned devDependency (the version Next already installed). No app UI changes. The test account's watchlist was emptied and restored during the captures (The Witcher, `created_at` now 2026-11-07).
- State: 565 tests; lint and typecheck clean; production smoke 38/38 after the changes. Committed on 2026-11-09 after a code review (see that entry).
- Scope change, same session (user): the review now first asks Gemini for 2–3 UI directions with mockups (home, browse, search, title page; phone first), plus a recommendation. The per-view suggestions became part 2. `docs/UI_REVIEW.md` gained a "Purpose of the platform" section, and the triage step now starts with choosing a direction.
- Next step: the user gives the folder (or just the PDF) to Gemini and pastes its suggestions back; then we triage them together (Post-M8 task 5, items 2–3) before implementing anything.

### 2026-11-07 (session end) — ingestion paused for Noam; next: UI review with Gemini
- Ingestion is built and running on GitHub with a mock stand-in. It's paused until Noam's collector passes `docs/FEED_REQUIREMENTS.md` section 7 (what's left: `docs/INGESTION.md` Status steps 5-6).
- Open product decision for the cutover: what the site shows for the providers still on mock data (Netflix, Disney+, Prime) next to real YES/Partner TV.
- The user queued **Post-M8 task 5: a UI review with Gemini**. Claude provides screenshots and descriptions of every view, the user brings back Gemini's suggestions, and we decide together. `CLAUDE.md` now names it the current workstream.
- State: everything committed and pushed; 547 tests; production smoke 38/38.
- Next step: Post-M8 task 5, first item (the screenshots and descriptions), in a new session.

### 2026-11-07 (wrong-id safeguard) — and the mock Shtisel id fixed
- The ingest job now flags a likely wrong IMDb id: the feed's type differs from TMDB's and no title matches. It's flag only, recorded in the run's `error_summary` and the job's report (`docs/INGESTION.md` Section 3). On live data it flagged exactly the mock "Shtisel" row (Phantom Thread's id).
- The mock fix: Shtisel is `tt3069894`, applied through the pipeline itself (1 new, 1 removed). The site no longer lists Phantom Thread on YES. Production smoke 38/38. 547 tests.
- Next step: wait for Noam's collector, then the cutover (`docs/INGESTION.md` Status 5-6).

### 2026-11-07 (pipeline step 5, part 1) — the job, minus the collector
- `npm run ingest` (archive to `raw-feeds`, then `processRun`), `npm run ingest:mock` (the collector's stand-in) and a manual-only `.github/workflows/daily-ingest.yml`. Details and the three `/code-review` passes are in `docs/INGESTION.md`. 534 tests; no site changes.
- First live run on the mock output, 2026-11-07: both providers completed, 0 removed, archived to `raw-feeds`. The site is unchanged (production smoke 38/38). It found a mock-data bug from M1: "Shtisel" carried Phantom Thread's IMDb id (fixed the same day, see the entry above).
- The user added the GitHub secrets; a manual `workflow_dispatch` run passed (both providers unchanged, 0 removed, archived).
- Next step: wait for Noam's collector, then add it and the daily schedule to the workflow and do the cutover (`docs/INGESTION.md` Status 5-6).

### 2026-11-07 (pipeline step 4) — staging + upsert + anti-join
- Migration `0009` adds `apply_ingestion_run`: one transaction per provider for the upsert, the anti-join with the complete/partial removal rules, and the run's bookkeeping. `ingestion/src/pipeline/process-run.ts` orchestrates a whole run. Details, the six `/code-review` passes and the 50-check rolled-back live dry run are in `docs/INGESTION.md`.
- Only `lib/id-chunks.ts` (a size parameter) touches the site: production smoke 38/38 after the deploy of `d1ba201`. 495 tests.
- Migration 0009 applied live with the user's approval and verified (service role only); production smoke 38/38 afterwards.
- Next step: `docs/INGESTION.md` step 5 (the GitHub Action; needs the user's GitHub secrets).

### 2026-11-06 (pipeline step 3) — TMDB resolution with the imdb_tmdb_map cache
- `ingestion/src/tmdb/` resolves feed imdb_ids to title keys through `imdb_tmdb_map`: a 30-day retry for unresolved ids, a capped 7-day `title_cache` refresh, and TMDB being down never blocks availability (a failed lookup caches nothing, and the run stops asking TMDB when it looks down). Details and the `/code-review` passes are in `docs/INGESTION.md`'s Progress Log.
- `lib/tmdb-resolve.ts`: `fetchTitleDetails` is split out, and both functions take optional fetch options. An empty-string imdb_id from TMDB now falls back to the feed's id, for the seed too. New `lib/in-pool.ts`; `chunkIds` is generic.
- No migration, and no site changes (no smoke needed). 459 tests. A live dry run (nothing written) resolved all 32 mock ids to the same keys production uses.
- 2026-11-07, with the user's approval: `imdb_tmdb_map` filled live for the 32 mock titles (32/32 resolved, keys equal production's; a second run was all cache hits). Production smoke 38/38 afterwards.
- 2026-11-07, the user's decision on removals: a `complete` run removes missing titles at once; a `partial` run only once a title has been missing from the provider's last 7 completed runs (`docs/INGESTION.md` Section 4 step 3).
- Next step: `docs/INGESTION.md` step 4 (staging + upsert + anti-join), applying those removal rules.

### 2026-11-06 (pipeline step 2) — pipeline tables, feed validation, circuit breaker
- Migration `0008` (the pipeline's own tables, service-role only) plus `ingestion/src/` feed schema, line reader and circuit breaker, with 53 tests (403 total). Details are in `docs/INGESTION.md`'s Progress Log, including:
  - one deviation: rows with no imdb_id are "unmatched", counted but not stored;
  - the review fix that makes the breaker judge matched rows;
  - a real-data check: today's collector output is rejected safely.
- `scripts/seed-mock-data.ts`: a literal invisible BOM in a regex (from this morning) was replaced by relying on `trim()`.
- No app code changed, so no smoke run was needed (the site is untouched).
- Migration 0008 applied live with the user's approval; production smoke 38/38.
- Next step: `docs/INGESTION.md` step 3, TMDB resolution with the `imdb_tmdb_map` cache.

### 2026-11-06 (title keys) — Post-M8 task 3, pipeline step 1: (media_type, tmdb_id) keys
- Did: migration `0007` plus app changes so titles are keyed on (media type, TMDB id), not TMDB id alone. Title URLs are now `/title/movie/603` / `/title/tv/1396`; old `/title/<id>` links 308-redirect. Details in `docs/INGESTION.md`'s Progress Log; the code is in `lib/title-ref.ts`.
- `/code-review` (medium), three passes:
  - Fixed:
    - The migration's feedback backfill would have reset every `updated_at` (0006's trigger), scrambling recommendation seeds. The trigger is now off for the backfill.
    - The old-link redirect first guessed by popularity, then by oldest row. It's now a frozen `legacy_title_ids` table, so a cached 308 can't go stale.
    - The redirect keeps the query string (`queryString` in `lib/query-params.ts`, tested).
    - The smoke check rejects a "Not found" landing.
    - `Seed` is now a `TitleRef`.
    - Removed a redundant sort key.
    - Stale comments fixed.
  - Fixed in the third pass:
    - The smoke redirect check picks a title that is both in `legacy_title_ids` and live now (`pickLegacyTitle`, tested). It expects that exact path, and skips with a note if none is live.
    - Dropped an unused index.
    - `SearchResultRow` uses `MediaType`.
    - The browse Type filter now filters on TMDB's media type (what cards show and link by) instead of the feed's label.
    - `findLegacyTitle` uses `maybeSingle()`.
  - Fixed in the fourth pass:
    - An old link to a title no longer on any provider returns not-found directly, instead of a cached 308 to a not-found page.
    - The smoke lookup reads the whole frozen map (32 rows), not the first 100 ids. It's renamed `findLiveLegacyTitle` and uses `createPublicClient()`.
    - The Type filter maps labels to media types with an explicit `Record`.
  - Declined:
    - `getCatalogByTitle` has no region filter: it didn't before either, and the MVP is IL-only.
    - A shared helper for the two per-media-type query fan-outs: only two call sites.
    - Computing related refs twice in recommendations (negligible).
    - Tabs left open from before the deploy can't save until reloaded: their old bundle's upserts name the dropped key. They show the existing "couldn't save" state, nothing is lost, and the user base is tiny.
    - `legacy_title_ids` is empty on a freshly built database: old links only exist on production.
- Smoke: "old title link is an HTTP 308" (fetch with `redirect: "manual"`) plus "old title link redirects" (both viewports): 38 checks.
- **Migration 0007 applied live (the user approved)**, then deployed as `eafa191`. See `docs/INGESTION.md` for the `--yes` incident, about a minute of new code on the old schema.
- After deploy, the old-link "308" turned out to be a 200 shell with a client-side redirect.
  - First fix: a middleware lookup. Two more `/code-review` passes found request-time latency, timeout and outage cases in the auth middleware.
  - Final fix: the frozen map (32 rows, never changes) is a static copy in `lib/legacy-title-ids.ts`, served by `next.config.ts` `redirects()` as real 308s, with no database on the request path.
  - `middleware.ts` is unchanged, and `/title/<one segment>` has no page (Next's not-found).
  - Declined from the last review: a 308 to a title that has left every provider. Its new URL is still that title's canonical one, it works again if the title returns, and the old URL was a not-found too. Also declined: the map living in two places, since the table is frozen and smoke checks the copy.
  - Smoke checks the copy against the DB (`legacyMapDrift`, tested) and the 308 at the HTTP level.
  - Removed the now-unused `queryString` and `parseLegacyTitlePath`.
- Verified:
  - `npm test` 350 passing; lint, `tsc`, `format:check` and `build` clean.
  - Smoke on a local production build against the migrated DB: 38/38, including `308 → /title/tv/456?from=smoke`. Port 3000 was free; only the session's server was stopped.
- **Production, after the deploy of `4310149`:**
  - `npm run smoke` passed 38/38. Old links get real 308s (`308 → /title/tv/456?from=smoke`), and `/title/tv` gets a real 404. The signed-in watchlist journey works on the new keys.
  - `npm run seed:mock` against the migrated schema: 32/32 resolved.
- Next step: `docs/INGESTION.md` step 2: migration `0008` for the pipeline tables, plus the Zod feed schema from `docs/FEED_REQUIREMENTS.md`.

### 2026-11-06 (feed review) — Post-M8 task 3 started: feed reviewed, Partner TV added
- **Ingestion:** reviewed and ran the external developer's (Noam's) collector branch. It isn't the agreed feed yet: no IMDb IDs, home and marketing pages instead of full catalogs, YES and Partner TV only. Details are in `docs/INGESTION.md`'s Progress Log. The change requests are in `docs/FEED_REQUIREMENTS.md`, which the user sent him. **He works only on `provider-catalog-fetchers`; we merge through a pull request when we decide it's time.**
- **The user's decisions:**
  - Netflix, Disney+ and Prime stay on mock data until Noam covers them (phase 2, after YES and Partner TV are signed off).
  - Add Partner TV to the app.
- Did:
  - `lib/providers.ts`: Partner TV (`PARTNER_TV`, slug `partner-tv`, the code agreed in `docs/FEED_REQUIREMENTS.md`). The home page picker and `/browse/partner-tv` follow from the list.
  - `data/mock-feed.jsonl`: six Partner TV rows (The Bear, Yellowstone, 1883, Downton Abbey: The Grand Finale, Project Hail Mary, Hamnet). The titles appeared in Partner's real listing on 2026-11-06. Their IMDb IDs were checked on TMDB. `watch_url` is `null`: the title page renders it as a per-title "Watch →" link, and there's no real per-title Partner link yet. `npm run seed:mock` was run against Supabase: 32/32 resolved, and the Partner rows were confirmed stored with `watch_url` null.
  - Tests: Partner TV slug and code lookups. New guard tests over `data/mock-feed.jsonl`, using the seed's own `loadFeed` (now exported): every row passes the seed schema, uses a listed provider code, every listed provider has at least one row, and no duplicate keys. The "every provider has a row" check is deliberate while the mock is the catalog; relax it at the real-feed cutover.
  - `npm run smoke` covers `/browse/partner-tv` (it waits for Yellowstone), and home checks the Partner TV tile (34 checks).
  - `/code-review` (medium): fixed the generic Partner watch link (now null), the duplicated feed parsing, a cwd-relative path, the weak smoke check, a stale comment in `lib/providers.ts`, and a stray empty file. Declined: "smoke fails on production before deploy" (expected; run after deploy) and "the every-provider test ties the list to fixtures" (intentional, see above).
  - Second `/code-review` pass, fixed:
    - `loadFeed` reports real file line numbers, including for malformed JSON (+3 tests).
    - The seed resolves `MOCK_FEED_PATH` from its own file, so it works from any directory.
    - The guard tests load the feed once.
    - The Bear's `seasons_available` was a guess, so it's now `null`.
  - Second pass, declined:
    - The test importing the seed loads `.env.local`. That was true before this change.
    - A separate smoke check for the home tile (two more page loads for little gain).
    - FREETV/HOT missing from `PROVIDERS`: the pipeline's allow-list handles it when built.
    - Smoke's Yellowstone wait stays, with a comment to switch to `has.titleLinks` at the cutover.
  - Third pass, fixed:
    - The seed loads `.env.local` inside `main()` (resolved from its own file), so importing it from a test no longer puts real credentials in `process.env`.
    - Smoke's home check requires a tile for every provider in `PROVIDERS`, not just Partner TV.
    - The temp-file helper uses a counter.
  - Third pass, declined: repeats of the items above.
  - Fourth pass: no correctness bugs. Fixed:
    - Partner TV's color is now green `#2bb673`; the first pick was nearly Prime's cyan.
    - `feedRowSchema` accepts only `PROVIDERS` codes and region `IL` (+6 tests).
    - `loadFeed` strips a UTF-8 BOM (+1 test).
    - The `getCatalogTitlesByIds` headroom note now says 500 rows per chunk.
- Verified:
  - `npm test` 319 passing; `lint`, `tsc`, `format:check` and `build` clean.
  - Smoke on a local production build: 34/34. Port 3000 was free first, and only the session's own server was stopped.
  - Screenshots: the home picker with five tiles on a phone, and the Partner TV browse page.
  - **Production, after the deploy of `14ebb8c`: `npm run smoke` 34/34.** The desktop home screenshot shows five tiles, with Partner TV's green distinct from Prime's cyan.
- Next step: Noam's YES/Partner work, judged against `docs/FEED_REQUIREMENTS.md` section 7. Meanwhile, our pipeline side can be built against that contract (see `docs/INGESTION.md`).

### 2026-11-06 (SMTP live) — Post-M8 task 4 done: custom SMTP via Gmail
- The user got 2-Step Verification on for `play.next.app8@gmail.com`, created an app password, and saved Supabase's SMTP settings: `smtp.gmail.com:465`, sender "PlayNext". Supabase shows a "personal rather than transactional provider" warning. That's expected with Gmail and acceptable until there's a domain (then Resend). Rate limit: Supabase's default 30/hour after enabling SMTP, left as is.
- The user set the Confirm signup template to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`; Reset Password stays at its default.
- **The user confirmed both round trips with an address that isn't a Supabase team member:** an email sign-up's confirmation link worked, and a password reset email's link worked. **The reset email landed in spam** (Gmail-sent mail from a new account; marking it "Not spam" helps, and a domain plus Resend is the real fix).
  - A first attempt used "Continue with Google", which sends no email by design; explained.
- `/privacy`: Google is now also named as the account-email sender (Gmail). Supabase no longer "sends account emails" there.
- Verified: smoke on production after the deploy; `/code-review` clean before commit.
- Next step: Post-M8 task 3, the real catalog ingestion, in a new session (see the previous entry for how to start it). Later, when PlayNext gets a domain: move email to Resend (fixes spam placement and the warning) and consider Google brand verification.

### 2026-11-06 (session end) — Google sign-in confirmed; SMTP deferred; next: real catalog ingestion
- **The user confirmed "Continue with Google" works** for an account that was never a test user, in an incognito window, on production. Post-M8 task 1 (Google side) is done.
- SMTP is still blocked: 2-Step Verification on the new Gmail account. At the user's request it moved to a deferred **Post-M8 task 4** with every remaining step written out; the user will come back to it in a few days. Meanwhile, email sign-up confirmations and resets only reach Supabase team members.
- Docs: Post-M8 reordered (task 3 ingestion is next, task 4 SMTP); `docs/INGESTION.md` Status updated (MVP done, this pipeline is next, the feed's readiness is the first question); `CLAUDE.md` now points at `npm run smoke` for live checks.
- Verified: no code changes since `3fe6310` (32/32 smoke checks on production after that deploy). `/code-review` clean before this commit.
- Next step: **Post-M8 task 3, the real catalog ingestion**, in a new session. Start by reading `docs/INGESTION.md` in full, and ask the user whether the external developer's daily feed exists yet (a sample file, the delivery method, which providers). If not, the agreed path is to build against the agreed schema with sample files, keeping the mock seed live. Task 4 (SMTP) when the user returns to it.

### 2026-11-06 (published) — Google consent screen in production
- The user saved the Branding links (home page, `/privacy`) and pressed Publish app, earlier than the "together with SMTP" plan. The Audience page shows **In production**, External, with no verification prompt.
- Still owed for task 1: a Google sign-in from an account that was never a test user (needs the user), and everything SMTP (on hold, see the previous entry).
- Next step: unchanged. Retry 2-Step Verification for the SMTP account; Post-M8 task 3 (ingestion) can start any time.

### 2026-11-06 (privacy) — Post-M8 1 (cont.): SMTP on hold, privacy policy for Google publishing
- SMTP is on hold. The user created the dedicated Gmail `play.next.app8@gmail.com`, but Google refused to turn on 2-Step Verification ("We couldn't verify that it's you"; the attempt was from a phone, on a brand-new account), so there's no app password. Plan: retry from the computer the account was made on, on home Wi-Fi, possibly after a few days; fallback is the user's personal Gmail. The Confirm signup template edit waits too, since templates stay locked until custom SMTP.
- Google consent screen, from the user's screenshots:
  - Data access lists no scopes (Supabase's default openid/email/profile needn't be declared).
  - Branding has the name, the support and developer emails (`play.next.app8@gmail.com`), no logo, and authorised domains `playnext-beta.vercel.app` and the Supabase project domain.
  - **Publish app was disabled**: "complete your configuration on the Branding page". The home page and privacy policy links were empty, so Google requires both before publishing.
- The user asked whether publishing is premature. Explained: it lists nothing anywhere, it only lets any Google account use "Continue with Google" (the site and email sign-up are already public), and it's reversible. **The user chose to publish later**, together with SMTP, before inviting real users.
- Did:
  - New `/privacy` page (`app/privacy/page.tsx`): what's stored, why, who handles it (Supabase EU/Frankfurt, Vercel, Google only for Google sign-in, TMDB gets only title ids for recommendations), session-only cookies, no ads or trackers, and deletion or copy by email to `SUPPORT_EMAIL`.
    - Each statement was checked against the code: the schema's user tables; no analytics; posters go through Next's image proxy, so TMDB never sees visitors.
    - Not legal advice. **If what's stored or who handles it changes, update the page in the same change.** For example, when Gmail SMTP goes live, add Google as the account email sender.
  - A site-wide footer (`app/components/footer.tsx`): Privacy, plus a TMDB credit. The home page must link the policy for Google's review. `margin-top: auto` keeps it at the bottom of short pages.
  - `lib/seo.ts`: `SUPPORT_EMAIL`, `PRIVACY_PATH`, `PRIVACY_METADATA` (indexable, canonical `/privacy`).
  - `npm run smoke` covers `/privacy` and the footer link: 32 checks.
- Verified:
  - `npm test` 303 passing (+1, the privacy metadata and its stable path); `lint`, `tsc` and `build` clean.
  - Smoke on a local production build: 32/32. Port 3000 was free first, and only the session's own server was stopped.
  - Screenshots: `/privacy` on a phone, and the footer at the bottom of `/login` on desktop.
- Next step (user): Branding → home page `https://playnext-beta.vercel.app`, privacy policy link `https://playnext-beta.vercel.app/privacy` → Save; Publish then becomes available, to use when inviting users. Retry 2-Step Verification for the SMTP account. Then Post-M8 task 3 (real ingestion, `docs/INGESTION.md`) can start regardless.

### 2026-11-06 (SMTP) — Post-M8 1 (code side) and 2: sign-up links via `/auth/confirm`, `npm run smoke`
- **SMTP choice: Gmail SMTP with an app password, from a dedicated Gmail account** (a new address just for PlayNext, so the user's personal address isn't the sender).
  - Resend was ruled out for now: without a verified domain it only sends to the Resend account's own address (a 403 for anyone else), so it can't reach real users. It's the better choice once there's a domain (DKIM/SPF on our own domain, a proper From).
  - Gmail: free, no domain, mail is DKIM-signed by Google so it lands in inboxes; about 500 recipients a day, and the From is a `@gmail.com` address. Needs 2-Step Verification on that account to create an app password.
  - "Verify a single sender" services (e.g. Brevo) were skipped: they'd send a `@gmail.com` From from their own servers, which fails DMARC alignment.
- **Template decision:**
  - Reset Password stays at its default. The implicit-flow link already works from any browser (confirmed on the user's phone), and moving it to `/auth/confirm` would need a coordinated template edit and deploy for no user-visible gain. Both spend the one-time token on a GET, so scanner exposure is the same.
  - Confirm signup moves to `/auth/confirm`. It was still PKCE through `/auth/callback`, so a confirmation opened in a mail app's browser or on another device failed the code exchange (the email still got confirmed, but the user landed on a sign-in error). `login-form.tsx` now sends `emailRedirectTo: <origin>/auth/confirm`; the template should read `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`.
  - `/auth/confirm` also accepts the default template's `?code=` and exchanges it (the old behaviour), so this deploy is safe before the template edit, and the edit is safe whenever it happens. A token hash wins over a code; a bad `type` fails instead of falling back. Supabase's own `?error=` is logged. `/auth/callback` keeps exchanging codes (Google, and confirmation emails sent before this deploy).
- **Live smoke checks built** (Post-M8 task 2): `npm run smoke`, see Section 8 Testing.
  - The first run found a real flake: clicks before React hydration are silently dropped, so the watchlist toggle never flipped (a probe showed sign-in could fail the same way). `click`/`fill` now wait for the element to be hydrated. A stray watchlist add from the first run was undone; the journey itself restores state in a `finally`.
  - Production: **30/30 passed** (16 signed-out pages across phone and desktop, sign-in, 10 signed-in pages, the watchlist journey, the reset-link gate). Screenshots spot-checked.
- `/code-review` (medium), all 10 findings fixed:
  - Chrome is stopped and its profile removed if startup fails, and a spawn `error` no longer crashes the run.
  - CDP requests time out (30s), and a failed send rejects instead of hanging.
  - Chrome's stderr listener is detached once the DevTools URL is found (still drained).
  - The journey's `finally` restores only when the in-line restore didn't happen.
  - `.env.local` is loaded inside `main()`, so importing the script has no side effects.
  - `--url` with a path is rejected instead of silently checking the bare origin.
  - The selector label is escaped.
  - "My list favorites" now proves the favorites view rendered: My List's active tab got `aria-current="page"` (an accessibility fix too), and the checks wait for it.
  - Stale comments about moving the reset template to `/auth/confirm` were fixed in `lib/auth.ts`, `lib/supabase-browser.ts`, `app/reset-password/page.tsx` and `app/login/page.tsx`.
- Verified: `npm test` 302 passing (+28: `/auth/confirm` sign-up, code fallback, precedence and error-logging cases; `scripts/smoke-lib.ts` arguments, Chrome paths, DevTools URL, names, summary, the CDP client incl. timeouts). `lint`, `tsc`, `format:check` and `build` clean. After the fixes, `npm run smoke -- --url http://localhost:3000` against a local production build: 30/30. Port 3000 was free first, and only the server this session started was stopped.
- **Needs the user** (dashboard steps; see Post-M8 task 1's checklist): SMTP settings and the rate limit, the Confirm signup template, publishing the Google consent screen, then the email round trips at a non-team address and a Google sign-in from an account that isn't a test user. Claude can't check those: they need a real inbox and a real Google account. After the SMTP save, `npm run smoke` re-checks that nothing else moved.
- Next step: finish Post-M8 task 1 with the user's results; then Post-M8 task 3, the real catalog ingestion (`docs/INGESTION.md`).

### 2026-11-06 (wrap-up) — session-end review fixes; next-session plan
- The user confirmed **"Secure password change" was already on** in Supabase; that item was struck from the pre-launch list.
- `/code-review` (medium) over the session's commits (`a63d4c4..HEAD`):
  - Fixed: `/reset-password` showed the new-password form to any signed-in session, even with no reset link.
    - It's now gated server-side on how the session authenticated: `lib/supabase-server.ts` `hasRecentEmailLinkSession()` reads the JWT `amr` via `getClaims()`, and `lib/auth.ts` `isRecentEmailLinkSession(amr, now)` requires an `"otp"` entry no older than `RECOVERY_SESSION_MAX_AGE_S` (1h).
    - The method name was checked live: an admin `generateLink({ type: "recovery" })` session, followed with no email sent, has `amr: [{ method: "otp" }]`, while a password sign-in has `"password"`.
    - `RecoverySession`'s prop is now `canReset`.
  - Fixed: `/login` redirected a signed-in visitor home even when sent back from a failed reset link, so they couldn't request a new one. It now stays on the reset form for `?error=reset_link`.
  - Fixed: `/auth/callback` had no route test. Added `app/auth/callback/route.test.ts` (success, same-origin vs. off-site `next`, reset failure → reset form, other failures, no code → no Supabase call).
  - Fixed: the retryable-error check now uses supabase-js's `isAuthRetryableFetchError`, and the test builds a real `AuthRetryableFetchError`.
  - Fixed: stale comments on `/auth/confirm` and `RESET_PASSWORD_PATH`. `/auth/confirm` is documented as unused until custom SMTP, with both switch-over steps (template and `login-form.tsx`).
  - Fixed: `createImplicitFlowClient` renamed `getImplicitFlowClient`, since it returns a singleton.
  - Declined: if `setSession` succeeds but the refreshed server render still can't see the session, the one-time link is already consumed. It's logged; no repro, and retrying can't recover a spent link anyway.
- Second `/code-review` pass on those fixes:
  - The `amr` gate only hides the form. It's documented in `isRecentEmailLinkSession` as a UI guard: session cookies are script-readable, so a borrowed session could call `updateUser` directly, and Supabase's "Secure password change" (on) is the real backstop.
  - The `"otp"` gate also admits sign-up confirmation sessions. Documented as intended: they prove the same inbox control a reset does.
  - Added `?mode=reset` (`RESET_MODE_PARAM`). `/reset-password`'s fallback, reworded to "open the link in your reset email (links work once, for an hour)", links to the reset form without the misleading "your link expired" error, and a signed-in visitor isn't redirected away from it.
  - The page's two auth reads run in parallel.
  - `hasRecentEmailLinkSession` moved below `getCurrentUser`, so `cache()`'s comment sits on its function again, and got `lib/supabase-server.test.ts` (mocked `@supabase/ssr`/`next/*`: fresh, expired and password sessions, signed out, the seconds conversion).
  - `/auth/callback`'s stale comment fixed.
- Verified:
  - `npm test` 274 passing (+13 this round); `lint`, `tsc` and `build` clean.
  - An end-to-end gate check with the test account in headless Chrome on a local production build (the run actually hit a `next dev` already listening on :3000, serving the same code; see below):
    - A password session on `/reset-password` gets no form.
    - A real recovery link (admin `generateLink`, no email) gets the form for the test account.
    - Reusing that link is refused.
    - No new password was submitted.
- Incident: that check found port 3000 already in use (PID 23672, judging by the page text the user's own `next dev` for this repo). The script stopped it at the end, assuming it was the server it had started. Lesson for next time: check the port first and never kill a process the session didn't start, or use a free port. `localhost:3000` is the only local origin in the Redirect URLs allow-list, so use it only when it's free.
- Next step: see Post-M8 in Section 9. In order: (1) custom SMTP plus publishing the Google OAuth consent screen; (2) live smoke checks against production with the test account; (3) the real catalog ingestion (`docs/INGESTION.md`).

### 2026-11-06 (close) — M8 complete
- At the user's request, created a dedicated test account for signed-in checks: `playnext-test-bot@example.com` (user id `27e2adbb-933d-45b9-a170-653488beabf9`, `full_name` "Test Bot"). It was made with the service-role admin API `createUser({ email_confirm: true })`, so no email was sent. The random password lives only in `.env.local` (gitignored) as `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`, and was never shown in chat. Delete it under Authentication → Users when no longer needed.
- Signed-in run on production in phone-emulated headless Chrome:
  - Signed in through the real `/login` form.
  - Through the real buttons: Breaking Bad favorited + liked, Stranger Things liked, The Witcher watchlisted (all registered).
  - The title page shows the pressed states, and My List → Watchlist lists The Witcher with ✓.
  - The header reads "Test · Sign out" on one row.
  - Home's For You correctly excludes all three, then falls back to trending ("Nothing like your picks is in our catalog yet"): the 26-title mock catalog holds none of TMDB's related ids for those seeds. That's expected until the real feed.
  - No horizontal overflow on any signed-in page at 412px.
- End-to-end journey, combined across this day's checks:
  - Browse, sort/filter and search: emulated screenshots.
  - Sign up: by the user in M5. Google sign-in: by the user, after today's URL Configuration fix. Password reset: by the user, from Gmail.
  - Favorite/like/watchlist, My List and recommendations: the test-account run above.
  - SEO/OG: the live `curl` checks and the user's WhatsApp preview.
  - **M8 checked off; the MVP plan (M0–M8) is complete.**
- Still owed before real users (not M8 scope):
  - Custom SMTP: Supabase's built-in sender only delivers to project team members and is heavily rate-limited, so real users' sign-up confirmations and resets wouldn't arrive.
  - Publishing the Google OAuth consent screen out of Testing mode.
  - (Enabling "Secure password change": the user confirmed it was already on.)
- Next step: post-M8 — the real daily ingestion pipeline per `docs/INGESTION.md` (start with its Status/Progress Log), which replaces the mock catalog and gives recommendations real candidates. Custom SMTP can be done any time before inviting users.

### 2026-11-06 (end) — M8 (cont.): emulated phone screenshots, full-width `<main>` fix
- The user asked whether I could check the phone layout myself. There's no `adb` on this machine, but Chrome is installed, so a throwaway script drove headless Chrome over the DevTools Protocol with `Emulation.setDeviceMetricsOverride` (412×915, DPR 2, `mobile: true`). It measured `scrollWidth` and captured each page.
  - Gotchas: plain `chrome --headless --window-size=412,…` won't go below about 500px on Windows, so its screenshots looked cropped and misleading. Git Bash rewrites `name=/path` arguments into Windows paths (fixed with `MSYS_NO_PATHCONV=1`). The script was deleted afterward; recreate it if needed.
- Result: home, browse (incl. sort/filter applied), search, title, `/login`, `/reset-password` and not-found have no horizontal overflow at 412px, and browse wraps to two cards a row with the filters wrapping cleanly. One real bug: on content-light pages (`/login`, empty states, not-found) `<main>` was narrower than the screen. `body` is a flex column, and a flex child with `max-width` + `margin: 0 auto` shrinks to its content instead of stretching. Fixed globally in `app/globals.css` with `body > main { width: 100%; }`; `max-width` still caps it on desktop. Verified on a local production build: every page's `<main>` is a direct child of `<body>` and 412px wide.
- Not covered: signed-in pages (My List with saved titles), since the headless browser has no session.
- Next step: the user checks signed-in My List on the phone and does the end-to-end smoke test; then check off the responsive item and close M8.

### 2026-11-06 (latest) — M8 (cont.): reset links via implicit flow (templates are locked on the free plan)
- The user went to edit the Reset Password template and found it read-only: "Set up custom SMTP to edit templates". On the free plan with Supabase's built-in email sender, templates stay at their defaults, so the previous entry's `/auth/confirm` template change can't be made, and the default link (`{{ .ConfirmationURL }}`) uses whatever flow the request used.
- Did:
  - The reset request now uses implicit flow. `lib/supabase-browser.ts` has `createImplicitFlowClient()`, a plain `supabase-js` client with `flowType: "implicit"` that stores nothing; `@supabase/ssr`'s `createBrowserClient` hard-codes `flowType: "pkce"`, so it can't be used for this. `login-form.tsx` requests the reset with `redirectTo: <origin>/reset-password`.
  - The default email link then verifies at Supabase and lands on `/reset-password#access_token=…&refresh_token=…&type=recovery`, which works in any browser, Gmail's included.
  - New `app/components/recovery-session.tsx` wraps the page. It parses the fragment with the new `lib/auth.ts` `parseRecoveryHash` (session, Supabase's `error_code=otp_expired`-style error, or none), clears the fragment from the URL, calls `setSession` on the cookie-backed client, and runs `router.refresh()` inside a transition. Until that server render lands it shows "Checking your reset link…", so if a different account was already signed in, its form never flashes.
  - The link's session always wins over an existing one, so the right account gets reset.
  - The setSession work is an async `consumeResetLink()` whose result sets state in a callback (the `react-hooks/set-state-in-effect` lint rule), with a ref guard for Strict Mode's double effect.
  - `/auth/confirm` stays, documented as the route for a future custom template.
- `/code-review` (medium) findings, all fixed:
  - The link-consuming logic moved to `lib/recovery-link.ts` `consumeRecoveryLink(env)`, with location, history and `setSession` injected, and got its own tests.
  - The fragment is now cleared only after `setSession` succeeds, or on Supabase's error. A failed `setSession` (e.g. offline) returns `"retry"` and keeps the tokens, so "reload to retry" works and a valid link isn't reported as expired.
  - A URL without a reset link (e.g. `#anchor`) is left alone, and clearing keeps the query string.
  - A session that's stored but invisible to the server after the refresh is now logged.
  - `createImplicitFlowClient` is a lazy singleton with its own `storageKey`, so there's no "Multiple GoTrueClient instances" warning.
  - The component's doc comment is back on the component.
  - The future `/auth/confirm` template example uses `{{ .RedirectTo }}` again, so localhost resets stay local.
- Verified:
  - `npm test` 261 passing (+9: `parseRecoveryHash`, `consumeRecoveryLink`; a follow-up low review split `setSession` failures: `AuthRetryableFetchError`/thrown means "retry", any other auth error means "invalid", so bad tokens never loop on "reload to retry"); `lint`, `tsc` and `build` clean.
  - A live `resetPasswordForEmail` in implicit flow against the project, for a nonexistent address (so no email is sent): `{ error: null }`.
  - Not verified: the real email round trip (needs the user).
- Pre-launch item, recorded here: Supabase's built-in email sender is for development only. It's heavily rate-limited (a few emails an hour) and, per Supabase's docs, only delivers to addresses of the project's team members, so real users' sign-up confirmations and resets wouldn't arrive. Before a public launch, set up custom SMTP (e.g. Resend, or Gmail SMTP with an app password); that also unlocks templates, and `/auth/confirm` is ready for them.
- **Confirmed by the user on their phone:** the reset email's link, tapped from Gmail, landed on the new-password form and the reset worked. The header shows "shahar" (email account, so the name comes from the email's local part) beside "Sign out" on one row.
- Next step: the remaining phone pass (a provider's browse page with the sort/filter bar, My List, `/login`); then the final end-to-end smoke test, which closes M8. Then custom SMTP before any real users (see above), then the post-M8 ingestion pipeline (`docs/INGESTION.md`).

### 2026-11-06 (later) — M8 (cont.): reset links that work from a mail app, name in the header
- User's results after applying the Supabase URL Configuration fix:
  - **Google sign-in now works on production**, confirming the Redirect URLs/Site URL diagnosis.
  - **The reset email arrived, but its link landed on `/login?error=reset_link`.** So the allow-list passed and the PKCE `exchangeCodeForSession` failed. The cause (inferred; there's no Vercel CLI here to read logs): the PKCE code verifier is a cookie in the browser that requested the email, and Gmail on Android opens links in its own in-app browser, which doesn't have it. The earlier "open it in this browser" hint is unworkable on phones.
  - Asked for the user's name to show in the header.
- Did:
  - Added `app/auth/confirm/route.ts`, Supabase's documented SSR pattern for email links. It takes `?token_hash=&type=&next=`, calls `verifyOtp({ type, token_hash })`, and redirects with the same `safeRedirectUrl`/`callbackFailureUrl` as `/auth/callback`. It needs no verifier cookie, so it works in any browser or on another device. `lib/auth.ts` gains `parseEmailOtpType` (allow-list of Supabase's email OTP types).
  - The user must point Supabase's **Reset Password** email template at it: `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery`. `login-form.tsx` now passes `redirectTo: <origin>/auth/confirm` (covered by the `/**` Redirect URLs), so a reset requested on localhost comes back to localhost. A `recovery` link always goes to `/reset-password` and fails to the reset form, whatever `next` says, so a template typo can't strand the user. `/auth/callback` keeps serving Google and the sign-up confirmation email (unchanged; those could move to `/auth/confirm` the same way if confirmation links hit the same problem).
  - The two routes now share `lib/auth-redirect.ts` `completeAuthRedirect(label, origin, next, signIn)`: run the exchange or verification, log, and redirect to `safeRedirectUrl` or `callbackFailureUrl`. Only the Supabase call differs between them.
  - Dropped the "open it in this browser" wording from the reset info and the expired-link messages.
  - Header: `lib/auth.ts` `userDisplayName(user)` returns the provider's `full_name`/`name`, else the email's local part, plus `short` (first word). `auth-nav.tsx` shows the full name on desktop and the first name on phones (≤600px; max-width ellipsis, tighter gaps, smaller logo so it fits one row), with the email as a tooltip. This replaces the email, which was hidden on phones. It reads `user_metadata` from the session, so there's no extra `profiles` query.
- `/code-review` (medium):
  - Fixed: recovery routing keyed on `type`, not `next`; `redirectTo`/`{{ .RedirectTo }}` so localhost resets stay local; stale comments on the shared redirect helpers; duplicated route logic (now `completeAuthRedirect`); `EMAIL_OTP_TYPES` is `satisfies` the SDK's `EmailOtpType`; display names capped at 40 chars (`MAX_DISPLAY_NAME_LENGTH`), since `user_metadata` is user-editable.
  - Declined: (1) email link scanners (Outlook Safe Links, corporate gateways) could spend the one-time token with a GET before the user taps. The fix is a GET page with a button that POSTs to `verifyOtp`, at the cost of an extra tap for everyone. Gmail, the user's client, doesn't pre-fetch, so it's left as a known limitation and is the first thing to revisit if a user reports reset links failing on first tap. (2) On phones the full account (email) is only in a `title` tooltip, which touch can't show. The first name plus "Sign out" is enough for MVP; an account menu is post-MVP.
- Verified: `npm test` 252 passing (+15: `/auth/confirm` route test with mocked Supabase covering success, recovery-ignores-`next`, `next` for other types, expired link, bad type/missing token, thrown `verifyOtp`; `parseEmailOtpType`; `userDisplayName` incl. the length cap). `lint`, `tsc`, `build` clean. Not verified: a real reset round trip through the new template (needs the user's template edit) and the header on a phone.
- Next step: (superseded by the next entry: the template turned out to be locked) the user checks the header name on the phone. Then the remaining phone pass (browse grid, sort/filter bar, My List, `/login`) and the final end-to-end smoke test.

### 2026-11-06 — M8 (cont.): live check, password reset, share button, mobile header/title layout
- Context: the user did a first phone pass on production and reported (1) "Continue with Google" doesn't work there, plus a forgotten password with no way to reset; (2) screenshots: the header's links wrapped onto two lines ("My / List", "Sign / in") and the title page's poster filled the screen; (3) a WhatsApp link preview of `/title/456` (title, "Where to watch…" description and poster all correct), and a request for a share button "on a title page and to list".
- Live check of commit `a63d4c4` on https://playnext-beta.vercel.app via `curl`: canonical and `og:url` use the production domain (not localhost) on title and browse pages; `og:image` is the TMDB poster; search is `noindex`; `/nope` is a 404 and `/title/0456` gets the "Not found" title and `noindex`. The home page has no canonical/`og:url` (it sets none); harmless, left as-is.
- Did:
  - Password reset. `lib/auth.ts` now has `RESET_PASSWORD_PATH`, `resetRequestSchema`, `newPasswordSchema` (shares the 8-char rule with sign-up), `safeRedirectUrl(next, origin)` (resolves `?next=` with `new URL` and keeps it only if it's same-origin, so the callback is no open redirect), `callbackFailureUrl` (a failed reset link goes to `/login?error=reset_link`, which opens the reset form with its own message, not the generic sign-in error), `NETWORK_ERROR_MESSAGE`, and a friendly message for Supabase's "should be different from the old password". `login-form.tsx` has a third mode, `"reset"` ("Forgot password?" under sign-in), which calls `resetPasswordForEmail` with `redirectTo: /auth/callback?next=/reset-password`. `/auth/callback` honors `next`. The new `/reset-password` page (`instant = false`, `noindex`, like `/login`) shows `reset-password-form.tsx` (`updateUser({ password })`, then home) when there's a session, or "invalid or expired" otherwise.
  - Share button: `lib/share.ts` `shareLink(target, data)` uses `navigator.share` (if `canShare` allows it), treats `AbortError` (sheet closed) as cancelled without copying, and otherwise falls back to `clipboard.writeText`. `app/components/share-button.tsx` sits next to `TitleActions` on the title page and shows "Link copied" / "Couldn't share" for 2s. The title text comes from the new `lib/format.ts` `titleWithYear`, which `lib/seo.ts` now uses too.
  - Mobile: the header `nav` wraps as a fallback, links are `nowrap`, and at ≤600px the padding and gaps are tighter, with "Browse" (same target as the logo) and the signed-in email hidden. Title page at ≤600px: 160px poster (was 260px), less padding, and `sizes` updated to match.
- Deviations:
  - Password reset and share weren't in the plan; both are added to M8's checklist.
  - Sharing My List isn't built. Lists are private under RLS, so a shareable list needs a public, read-only list page (a share token or public profile), which is new schema and privacy design. Post-MVP.
- `/code-review` (medium) findings, fixed:
  - `safeNextPath`'s hand-rolled regex became the `new URL` origin check; its tests now include tab-in-path and `javascript:` cases.
  - A failed reset link landed on the generic sign-in error; it now reopens the reset form.
  - The share button's timer didn't restart on a repeat outcome; it now stores a fresh object per click.
  - Both password forms could stay disabled forever if the Supabase call threw. They now use a try/catch with `NETWORK_ERROR_MESSAGE`, and the reset form stays disabled after success while navigating, so it can't be double-submitted.
  - `titleWithYear` had no tests; tests added.
  - This log entry and the checklist (also flagged by the review).
- Second `/code-review` pass, all fixed:
  - Sign-in, sign-up and Google had the same stuck-on-throw gap. All five Supabase calls now go through `lib/auth.ts` `runAuthCall` (returns the result plus a friendly or network message), and `firstIssueMessage` replaces three copies of the Zod-message expression.
  - A successful reset now also calls `signOut({ scope: "others" })`, best effort, so a reset after a compromise ends the attacker's sessions.
  - The expired-link page's "Request a new one" opens the reset form directly (`/login?error=reset_link`).
  - `LoginForm` is keyed on the error param, so a soft navigation between `/login` variants remounts it.
  - `ShareButton` ignores taps while a share is in flight, so a second tap's `InvalidStateError` can't copy behind the open sheet.
  - `/login`'s CSS module moved to `app/components/auth-page.module.css`, shared with `/reset-password` instead of one route importing the other's.
- `/code-review` findings left as dashboard config (not code):
  - `/reset-password` accepts any signed-in session, not just a recovery one. Gating the page wouldn't help, because `updateUser({ password })` accepts any session at the API, so the real control is Supabase's **Authentication → Providers → Email → "Secure password change"**. It requires reauthentication for sessions older than 24h, and a fresh recovery session passes. The user should enable it.
  - The reset `redirectTo` carries a query string, which an exact-match Redirect URL entry may reject. Covered by the Redirect URLs fix below.
- Google sign-in on production (likely cause, not yet confirmed): Supabase's `/authorize` accepts `redirect_to=https://playnext-beta.vercel.app/auth/callback` and forwards to Google, but its `state` is opaque, so it's impossible to tell from outside whether that URL passed the allow-list. If it didn't, Supabase silently returns the user to its Site URL, presumably still `http://localhost:3000` from M5. The fix is in the Supabase dashboard under **Authentication → URL Configuration**: Site URL `https://playnext-beta.vercel.app`, and Redirect URLs `https://playnext-beta.vercel.app/**` and `http://localhost:3000/**`. The same allow-list governs the reset link and sign-up confirmation emails. The other candidate is the Google consent screen still being in Testing mode (Prerequisites), which blocks any Google account not listed as a test user.
- Verified:
  - `npm test`: 237 passing (+22: auth schemas, redirect/failure URLs, `runAuthCall`/`firstIssueMessage`, friendly message, `shareLink`, `titleWithYear`).
  - `lint`, `format:check`, `tsc` and `build` clean.
  - Local production server on :3100: `/reset-password` signed out shows the expired-link message with "Set a new password · PlayNext" and `noindex`; `/login` has "Forgot password?"; the title page renders Share; the header markup carries the mobile class.
  - Not verified (needs a browser and an inbox): the full reset email round trip, the share sheet on a phone, and the new mobile layout.
- Next step:
  1. User: apply the Supabase URL Configuration fix (and "Secure password change"), retry Google, and test the reset with the forgotten password.
  2. User: a phone pass over the browse grid, sort/filter bar, My List and `/login`, plus the new header and title page.
  3. Fix what that turns up, check off the responsive item, then do the final end-to-end smoke test to close M8.

### 2026-11-02 — M8 (partial): TMDB errors/rate limits, skeletons, empty/error states, SEO metadata
- Did:
  - **TMDB errors/rate limits** (`lib/tmdb.ts`). `tmdbFetch(path, params, options)` takes `{ signal, maxRetries, maxRetryDelayMs }`; the third argument was a bare `AbortSignal`. It retries 429/500/502/503/504 and network errors up to 2 times, honoring `Retry-After` (seconds or an HTTP date, `parseRetryAfter`), otherwise backing off 500ms then 1s (never less, even on `Retry-After: 0`), plus up to 250ms of random jitter. Every wait, and so the cooldown after a 429, is capped at 60s. After a 429, a module-level cooldown makes every request on that server instance hold off until the limit should reset, so one page view's 20 seed lookups can't keep hammering TMDB. A caller whose wait would exceed its `maxRetryDelayMs` fails at once (`TmdbError` 429). Recommendations pass 1s, so they fail fast and the page shows trending with the existing "Couldn't fetch personal picks" caption. The seed script uses the 60s default, so it waits instead. Failed response bodies are cancelled so they don't hold sockets. A caller's own abort is never retried. `recommendFromSeeds` now logs failed seed lookups once per call ("N of M ... first: <reason>") instead of once per seed.
  - **Posters**: new `app/components/poster.tsx` (client) replaces the three copies of `poster ? <Image> : fallback`, and also falls back to the title text when the image fails to load (TMDB CDN error, stale path) instead of showing a broken image.
  - **Skeletons**: audited, nothing missing. Every data-fetching route already has a `loading.tsx` (browse, search, title, my-list), the home page streams For You behind `ForYouSkeleton`, and `/login` fetches nothing.
  - **Empty/error states**: the existing empty states now offer a next step. Browse with filters gets "Clear filters" (keeps a non-default sort). Search no-results gets a spelling hint and a link to browse. Each My List view names the control to tap (♡ or +) and links home. The For You empty/error captions are from M7. New `app/not-found.tsx` (unknown URLs, unknown provider, unknown or no-longer-available title) and `app/error.tsx` (uses Next 16's `retry` prop, not `reset`; logs the error and shows its digest as a reference) and `app/global-error.tsx` (root-layout errors only), sharing `app/status-page.module.css`.
  - **SEO** (`lib/seo.ts`). The root layout sets `metadataBase` from `siteUrl()` (`NEXT_PUBLIC_SITE_URL`, else `https://$VERCEL_PROJECT_PRODUCTION_URL`, else localhost; a scheme is added if missing and an unparseable value is skipped, since a throw there would break every page), a `%s · PlayNext` title template, and site-wide OG defaults. `browseMetadata()` gives "Watch on <provider>", with the unfiltered URL as canonical. `titleMetadata()` gives "<Title> (<year>)" with a description leading with "Where to watch X: <providers>." then the overview, cut to 160 chars at a word boundary, plus canonical, `og:type` `video.movie`/`video.tv_show` and the w500 poster as `og:image` (no declared dimensions). Search (`searchMetadata()`): "Search", or the query (cut to 60 code points) with noindex. My List: noindex. Login: "Sign in". The title page wraps `getCatalogByTmdbId` in React `cache()` so metadata and page share one query. That query now orders by provider and availability type, so the provider order is stable.
  - New/updated tests: `lib/tmdb.test.ts` (retry/backoff/jitter/Retry-After/cooldown/abort/body-release/caps), `lib/tmdb-related.test.ts`, `lib/seo.test.ts` (new), `lib/query-params.test.ts` (`parseTmdbId`), `lib/recommendations.test.ts`, `lib/catalog.test.ts`, `lib/tmdb-resolve.test.ts` (its failure case now uses a non-retried 401).
- Decisions / deviations:
  - The rate-limit cooldown is per server instance (module state), like M7's `use cache`. On Vercel, separate instances don't share it. Accepted for MVP.
  - The title page streams (it has a `loading.tsx` and reads the session), so a title that's not found still returns HTTP 200 with the not-found UI and `noindex`. This is Next's documented behavior once streaming has started. Unknown URLs return a real 404. Metadata on streamed pages is appended to `<body>` for JS-capable crawlers and blocks in `<head>` for HTML-only bots (checked with a `facebookexternalhit` user agent).
  - Not added: per-title OG image generation (the TMDB poster is used directly) and `sitemap.xml`/`robots.txt` (not in the task; easy to add at the real-feed cutover when the catalog is worth indexing).
- `/code-review` before committing (seven passes).
  - Pass 1 fixed: unconsumed failed-response bodies; `new URL(siteUrl())` able to throw on a bad env value; all cooldown waiters retrying in the same tick (jitter); the 10s default cap making the seed script give up on a long `Retry-After` (default now 60s); the network-error retry ignoring `maxRetryDelayMs`; `error.tsx` swallowing the error; nondeterministic provider order in descriptions; an unbounded search query in `<title>`.
  - Pass 2 fixed: `export default function Error` shadowed the global `Error`, so `error instanceof Error` was always false and the digest never showed (renamed `ErrorPage`); `Retry-After: 0` letting every waiter retry with no wait (retry delays are now floored at the backoff); jitter able to push a wait past the caller's cap (clamped); `parseRetryAfter` accepting `1e3`/`0x3C`/`1.5` (only digit seconds or a GMT HTTP-date now, since `Date.parse` is loose); a garbled 200 body not being retried (now retried like a network error); duplicated id parsing on the title page (`parseTmdbId`); a double pass over the seed lookups; `/login` indexable while the other user-specific pages aren't (noindex).
  - Pass 3 fixed: an uncapped 429 cooldown (a `Retry-After: 3600` would have blocked TMDB for the whole instance for an hour; capped at `MAX_COOLDOWN_MS` = 60s); pass 2's jitter clamp, which removed jitter for waits right at the cap (reverted: the cap now applies to the base delay, and up to 250ms of jitter always comes on top, harmless inside the 5s abort budget); `parseTmdbId` accepting `0x52b`/`1e3` (digits only now); a test sleeping on real timers; the hand-built "Clear filters" URL (now `withUpdatedParam` + `DEFAULT_SORT`). Added `app/global-error.tsx` for errors in the root layout itself.
  - Declined: when another caller raises the cooldown past this caller's cap, it fails with a "skipped" 429 instead of using its remaining retries. That's the intended fail-fast. Also declined: `Poster` being a client component adds hydration per card. Every browse/My List card already hydrates a `TitleActions` island, so the extra cost is one small shared component.
  - Pass 4 fixed: a `/title/<id>` beyond Postgres `integer` sending an out-of-range query (a 500 instead of not-found) and leading-zero ids rendering duplicate pages (`parseTmdbId` now takes `^[1-9]\d*$` up to 2147483647); every wait is now capped at `MAX_COOLDOWN_MS` (60s), not just the stored cooldown, so the seed script retries after a capped wait instead of giving up on a `Retry-After: 120`.
  - Declined: retrying only network-class fetch errors (a malformed URL is a dev-time bug and surfaces either way); deriving "in Israel" in the browse description from `REGION` (single region per MVP scope); "pages without their own `openGraph` get no og:title" (the smoke test shows Next fills og:title/og:description for `/search` and `/login`); failing fast during a cooldown longer than the 1s render-path cap (as in pass 3).
  - Pass 5 fixed: `parseTmdbId` moved to `lib/query-params.ts` with tests; `DEFAULT_MAX_RETRY_DELAY_MS` is now defined as `MAX_COOLDOWN_MS` (one limit, not two equal constants); not-found pages had the generic "PlayNext" title, because a page's own metadata wins over `not-found.tsx`'s (now `NOT_FOUND_METADATA` from `lib/seo.ts`, returned by the browse/title `generateMetadata` too); the search `<title>` went through the description helper, which stripped the query's trailing punctuation (now a plain cut at 60 chars).
  - Declined: keeping a seed's `/recommendations` ids when its `/similar` top-up fails (a partial result would be cached for hours by `use cache`, while a thrown error isn't cached and retries on the next view); a per-caller-class cooldown (same fail-fast decision as passes 3-4); Geist fonts in `global-error.tsx` (it uses no Geist variables, since body text is `globals.css`'s Arial); de-duplicating `.emptyLink` across three CSS modules (matches the existing per-module `.empty` convention).
  - Pass 6 fixed: the search-title cut could split an emoji's surrogate pair (now `searchMetadata()` in `lib/seo.ts`, cut by code point, with tests); `DEFAULT_SORT` defined twice (now exported once from `lib/catalog.ts`); hard-coded 500x750 og:image dimensions (dropped: TMDB posters aren't always exactly 2:3).
  - Declined: redirecting leading-zero title ids to the canonical URL instead of a 404 (the app never generates those links); retrying only network-class errors and the synthetic "skipped" 429 (both declined in earlier passes); logging every distinct seed-failure reason (a revoked token fails every lookup, so it would still be the reason logged).
  - Pass 7 fixed: `truncateDescription` could split an emoji in a long space-free overview (now counts and cuts by code point); "Clear filters" built its path from the raw route param instead of `provider.slug`. Everything else in pass 7 repeated an item settled above (jitter on top of the cap, the cooldown design, redirecting non-canonical ids, global-error fonts, the `.emptyLink` copies) or asked to undo pass 2's garbled-body retry. Stopped there, since the review had converged on repeats and nits.
- Verified: `npm test` (215 passing), `npm run lint`/`format:check`/`build` clean. On the production build (port 3100): every page's `<title>`/description/OG/canonical/robots tags as described above; the not-found UI and a "Not found · PlayNext" title for an unknown URL (404), unknown provider, and bad title ids (`0456`, `0x1c8`, past int4, unknown); "Clear filters" links with and without a sort; the search no-results link. A live `tmdbFetch` call (scratch script, not committed) still returns results with the new options, and a TMDB 404 still surfaces as `TmdbError(404)` without a retry.
- **Not verified**: `error.tsx` rendering (needs a forced server error), the poster `onError` fallback, and the new empty-state copy in a real browser. Canonical/OG URLs on Vercel (they show `localhost:3000` locally since no site env var is set; Vercel sets `VERCEL_PROJECT_PRODUCTION_URL`). Check them on the live site after the deploy.
- Next step: the rest of M8. (1) Responsive layout pass (mobile/tablet/desktop), which needs a real browser at phone width: header + search bar, sort/filter bar wrapping, the card grid and `title-actions` at 140px, the title detail layout. (2) Final production deploy + full manual smoke test of the end-to-end journey on https://playnext-beta.vercel.app, including view-source checks of canonical/OG URLs and the error page.

### 2026-11-02 — M7 complete: recommendations
- Did: added `lib/recommendations.ts` (`getRecommendations(viewer, limit)`, where `viewer` is `{ supabase, userId }` or null when signed out, plus pure `isSeed`/`hasOpinion`/`pickSeeds`/`scoreCandidates`/`parseLimit`), `lib/tmdb-related.ts` (`getRelatedTmdbIds`: `/recommendations`, plus `/similar` when it returns under 10 results, cached with `use cache` + `cacheLife("hours")`, one 5s timeout per seed, a TMDB 404 cached as an empty list), and two catalog reads in `lib/catalog.ts` (`getTrendingTitles(limit, excludeIds)` across all providers, paging through `v_catalog` 100 rows at a time until it has `limit` distinct titles; `getCatalogTitlesByIds(ids)`). Moved `tmdbFetch` out of `lib/tmdb-resolve.ts` into a shared `lib/tmdb.ts`. It now throws `TmdbError` (which carries `status`) and accepts an optional `AbortSignal`; the seed script passes none, so it has no timeout, same as before. Extracted the `.in()` id chunking from `lib/user-titles.ts` into `lib/id-chunks.ts` (`chunkIds`, `ID_CHUNK_SIZE`; replaces `STATE_QUERY_CHUNK_SIZE`), now used by both. `app/api/recommendations/route.ts` is `GET ?limit=` (digits only, clamped to 1-20, default 20) and returns `{ hasSeeds, seedLookupsFailed, titles }` (each title has `source: "seeds" | "trending"`), or a generic 500. The home page has a "For You" section (`app/components/for-you.tsx`, 12 cards, behind `<Suspense>` with a skeleton, so the rest of `/` stays prerendered), with a caption for each state: signed out ("Trending" + sign-in prompt), cold start, seed-based, no catalog matches, TMDB lookups failing, and a load error. Added a `@` alias to `vitest.config.ts` so `app/` code using `@/` imports can be tested. New tests: `lib/recommendations.test.ts`, `lib/tmdb-related.test.ts`, `lib/tmdb.test.ts`, `lib/id-chunks.test.ts`, `app/api/recommendations/route.test.ts`, more in `lib/catalog.test.ts`.
- Decisions / deviations (Section 6 updated to match):
  - **Trending top-up.** Before building, I measured TMDB's recommendations+similar against the 26-title mock catalog: only 6 titles have any related title in the catalog (e.g. Loki↔WandaVision, Wednesday→Stranger Things). A seed-only list would be empty for most users, so seed-based picks come first and trending titles fill the rest. Trending is fetched in parallel with the TMDB lookups, not after them.
  - **Wider exclusion than Section 6 originally said**: any title with a favorite, like, dislike, or *any* rating (not just favorite/watchlist/dislike) is excluded, since recommending something already liked or rated is pointless. All-empty feedback rows (M6 leaves these when every field is cleared) don't count.
  - **Signed-out viewers get trending** from both the API (no 401) and the home page, under a "Trending" heading. No cookie-bound client is created for them.
  - **No TTL cache table**: `use cache` covers step 7 without a migration. The cache is per instance, so on Vercel a cold instance refetches. Errors aren't cached, so a failing seed is retried on the next view; `Promise.allSettled` logs and skips it.
  - "For You" is on the home page only, not the browse page: browse is per-provider, recommendations are cross-provider.
  - For You cards show the like/favorite/watchlist controls without a state read, since every recommended title has no saved state by construction. Acting on one refreshes the page and the title drops out of the list (verified live via the API).
  - The viewer's feedback and watchlist reads page in 1000-row pages, so PostgREST's max-rows cap can't silently drop exclusions or seeds. Seeds sort by `Date.parse(updated_at)`, not string comparison (Postgres trims trailing zeros from fractional seconds).
  - In `for-you.tsx`, `await connection()` must stay **outside** the try/catch: during prerendering it rejects on purpose, and catching that rejection logs "connection() rejects when the prerender is complete" in `next build` (caught and fixed this session). The session lookup and recommendations are inside the try, so a failure shows the section's error state instead of breaking `/`.
  - Found while scoring: `title_cache.tmdb_id` is the PK alone, but TMDB ids are only unique per media type. Scoring keys candidates on (media type, id), so M7 is safe either way, but the schema could collide at real-feed scale. Noted in `docs/INGESTION.md` Section 5 for the cutover. Not changed now.
- `/code-review` (three passes before committing). Fixed: PostgREST max-rows truncation and the rows-per-title guess in trending (now pages); no TMDB timeout on the render path (then scoped so it no longer applies to the seed script, and shared across a seed's two calls); TMDB 404s refetched on every view; `localeCompare` on timestamps; unpaged feedback/watchlist reads; a TMDB outage captioned as "nothing in the catalog"; the error-state heading; session failure crashing `/`; `parseLimit` accepting `" "`/`0x5`; duplicated chunking and de-dup code; error messages not naming the table; no tests for `lib/tmdb.ts`.
- Declined from those passes (revisit in M8 if needed):
  - Caching the shared signed-out trending list, and replacing the page walk with a per-title RPC/`NOT IN` query. Both are performance work: the walk takes one 100-row page at MVP size, and it only takes many pages for a user with hundreds of exclusions among top titles.
  - `getCatalogTitlesByIds` can exceed max-rows in theory: 100 ids × providers rows per chunk, so 500 today (five providers since Partner TV, 2026-11-06). Becomes possible only past 10 providers; lower `ID_CHUNK_SIZE` or page it if the real feed gets there.
  - `hasSeeds` counting a seed row whose `title_cache` embed is null. That can't happen: the FK cascades on delete and `title_cache` is public-readable. Two review passes also asked for opposite fixes here.
  - `scoreCandidates` re-checking `excluded` after the caller already filtered: kept so the pure function is correct on its own.
- Verified: `npm test` (172 passing), `npm run lint`/`format:check`/`build` clean (build log has no errors; `/` partial-prerendered, `/api/recommendations` dynamic). A throwaway script (not committed) ran against the final production build on port 3100 and the live project, using a confirmed account created via the admin API and deleted afterwards (0 rows left). 16/16 passing:
  - Signed out: the API returns 20 popularity-ordered, de-duplicated trending titles, and the home page shows "Trending" with the sign-in prompt.
  - Cold start: with one dislike and one watchlisted title, both are excluded.
  - Seeded: liking Wednesday and rating Loki 8 yields Stranger Things + WandaVision as seed picks ahead of trending, never the seeds themselves.
  - Watchlisting a pick removes it, and `?limit=3` is honored.
- Notes on that verification: the script's first run reported 3 failures from a bug in the script itself (a plain upsert on `user_watchlist`, which has no UPDATE grant; the app passes `ignoreDuplicates`). Also, stopping `npx next start` through the task runner on Windows left the `next` child process running on the port, so one rerun hit the old build. Start `node node_modules/next/dist/bin/next start` directly and stop it by PID.
- **Not verified**: the For You section in a real browser (layout, skeleton, clicking a control on a recommended card). Still also pending from M6: the browser click-through of the M6 controls.
- Noticed: a stale `next start` from an earlier session is still holding port 3000 (PID 23488), so it serves an old build. Left running in case it's the user's; kill it before the next smoke test on 3000.
- Next step: browser click-through of M6 + M7 (like two titles on the home page, see For You update). Then M8 — Polish & production hardening (Section 9), starting with TMDB error/rate-limit handling, which now matters for recommendations too (see the declined items above).

### 2026-10-31 — M6 built: favorites, watchlist, like/dislike, rating (browser click-through still pending)
- Did: added `lib/user-titles.ts` (`getTitleStates`, `setFavorite`/`setSentiment`/`setRating`, `setInWatchlist`, `getWatchlistTitles`/`getFavoriteTitles`, pure `nextSentiment`/`parseRating`; every function takes the Supabase client as a parameter so the same module works from Client and Server Components) and `lib/viewer-titles.ts` (`getViewerTitleStates`, server-only, returns the viewer's id + states or null + empty when signed out), with `lib/user-titles.test.ts` (25 tests) and `lib/viewer-titles.test.ts` (2 tests). Built `app/components/title-actions.tsx` (client component: favorite, watchlist, like, dislike, 1-10 rating select) and put it on `title-card.tsx` and `app/title/[tmdb_id]/page.tsx`. Added `app/my-list/` (`?view=favorites` or the default watchlist, redirects to `/login` when signed out, per-view empty state, `loading.tsx`) and made the header's "My List" placeholder a real link. No migration needed: M1's tables, RLS and grants already cover this.
- Decisions / deviations:
  - Writes go directly from the browser to PostgREST under RLS, as Section 3 specifies, not through Server Actions. Controls update optimistically, roll back with an inline error if the write fails, and stay disabled during a write so quick clicks can't land out of order. Each successful write calls `router.refresh()` so already-visited pages and My List don't show stale state.
  - `upsertFeedback` sets `updated_at` itself because no trigger maintains it, and sends only the changed column, so setting one field never resets the others (confirmed live).
  - Clearing every field leaves an all-empty `user_title_feedback` row rather than deleting it. Harmless: My List filters on `is_favorite`, and M7's seed set filters on favorite/like/rating.
  - `title-card.tsx` is now a `<div>` holding the `<Link>` and the controls as siblings, since buttons can't be nested in a link. Its `row` prop narrowed to `TitleSummary` so My List can render it from an embedded `title_cache` row.
  - Controls are on the browse card and detail page only, per this milestone's task. `search-result-card.tsx` has none.
  - Known limitations: a saved title with no live provider rows still appears in My List, but its link goes to the detail page's not-found (`getCatalogByTmdbId` only returns live rows). Can't happen with today's mock data; revisit at the real-feed cutover. Sign-in from a control always lands on `/`, not back on the original page, since `/login` has no return-path support.
- Verified: `npm test` (103 passing), `npm run lint`/`format:check`/`build` clean. Two throwaway scripts against the live project (confirmed accounts created via the admin API, deleted afterwards, not committed): (1) RLS, 17 checks passing: a second account can't read the first's rows, can't insert or upsert as them, and its update/delete attempts change nothing; a user can't reassign their own row to someone else; anon can't read or write. It also confirmed the real upsert and FK-embed behavior that mocks can't. (2) Production build fetched signed out and with a real session cookie, 13 checks passing: saved state renders on browse/detail, each My List view shows the right titles, signed-out `/my-list` redirects to `/login`.
- **Not verified**: clicking the controls in a real browser (no browser automation in this session). The write functions were run live, but the client component's click handling, optimistic update, rollback, `router.refresh()` and the card layout at 140px width have not been exercised or looked at.
- **`/code-review` rounds (2026-11-02, three passes before committing)**. Fixed:
  - `getTitleStates` put every browse-page id into one `.in()` GET URL, which would exceed URL limits at real-feed catalog size. It now splits ids into chunks of `STATE_QUERY_CHUNK_SIZE` (100).
  - A failed viewer-state read threw and took down the whole browse/detail page. `getViewerTitleStates` now returns `unavailable: true` and the controls render disabled (not empty, which would misreport saved state). My List now uses the same helper, so it gets the same fallback.
  - `title-actions.tsx` never adopted new server state after mount (it used `useState(initialState)` only). The first fix, remounting via a key on the server state, caused a regression the next pass caught: a refresh from an earlier write could remount the controls in the middle of a second write. Final version: adjust-state-during-render, adopting server state only when it *changes* and no write is in flight. If a write fails after fresher server state arrived, it adopts that state rather than rolling back to the older one. Helper is `titleStateKey()` in `lib/user-titles.ts`.
  - The Favorites tab sorted by `updated_at`, which every rating/like change bumps, and `updated_at` came from the browser clock. **New `supabase/migrations/0006_feedback_timestamps.sql`**: a `favorited_at` column plus a `before insert or update` trigger that sets `updated_at = now()` and sets `favorited_at` on favorite (kept across other edits, cleared on unfavorite), so clients can't forge either. The favorites index is now `(user_id, favorited_at desc) where is_favorite`. The client no longer sends `updated_at`, and Favorites sorts by `favorited_at`.
- Declined from those passes:
  - Running `getCurrentUser()` in parallel with the catalog fetches, and folding My List's state read into its list query: each saves about one round trip, not worth the extra code at MVP scale.
  - Per-card `router.refresh()` re-rendering the whole route: accepted for MVP; revisit with `revalidatePath` if it becomes noticeable.
  - Duplicate cards for one title on a browse page: can't happen, because `provider_availability`'s unique key is `(provider, region, imdb_id, type)`.
  - A stale refresh landing after the next write finishes: the refresh that write issues supersedes it, and Next discards superseded navigations (verified in M4).
  - The signed-out rating select via keyboard: the select is controlled and `apply` redirects before changing state, so no value is ever shown.
- **Migration 0006 applied live** (`supabase db push --db-url`, with the user's explicit approval after the session's auto-mode check first blocked it as a production change). Re-ran both live scripts afterwards. RLS + trigger: 23/23 passing, including favorited_at set on favorite, kept across a rating change, cleared on unfavorite, re-set on re-favorite, and a client unable to forge `updated_at`/`favorited_at`. Pages against the production build: 13/13 passing. Unit tests: 111 passing. Lint/format/build clean.
- Note for future migrations: `supabase` CLI v3 warns that `--db-url` is deprecated (removed in v4) in favor of `--remote=<db-url>`. It still works for now.
- Next step: do the M6 browser click-through: toggle each control on a card and on the detail page, reload, check My List (Favorites order follows when each was favorited) and remove a title from it. Then M7 — Recommendations (Section 9). M7's seed set can use `favorited_at`/`updated_at` for "most recent ~20" (Section 6).

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
- **Google OAuth app** — created in M5 (Google Cloud Console, OAuth consent screen + a Web application client; redirect URI `https://qtwozjmpysbrwzynmyoq.supabase.co/auth/v1/callback`, origins `http://localhost:3000` + the production URL). Client ID/Secret entered into the Supabase dashboard under Authentication → Providers → Google and enabled there. Note: the consent screen was published to **In production** on 2026-11-06 (home page and `/privacy` set under Branding, no logo, no verification needed for basic scopes), so any Google account can sign in.
- **Supabase Auth URL Configuration** — set 2026-11-06: Site URL `https://playnext-beta.vercel.app`; Redirect URLs `https://playnext-beta.vercel.app/**` and `http://localhost:3000/**`. Email/password, Google and password reset all depend on it. "Secure password change" is on.
- **Email sending** — custom SMTP since 2026-11-06 (Post-M8 task 4): Gmail via `play.next.app8@gmail.com` and an app password; the Confirm signup template points at `/auth/confirm`, Reset Password is the default. Reset emails were seen landing in spam. Previously Supabase's built-in sender. The built-in sender is development-only: heavily rate-limited, delivers only to project team members, and locks the email templates. Chosen replacement: Gmail SMTP (`smtp.gmail.com:465`, a dedicated Gmail account with 2-Step Verification and an app password, about 500 emails a day). Move to Resend (or similar) once PlayNext has its own domain.
- **Test account** — `playnext-test-bot@example.com` (created 2026-11-06 with the admin API, email pre-confirmed, `full_name` "Test Bot"). Credentials are only in `.env.local` as `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`; never print or commit them. It's for signed-in checks by Claude (headless Chrome over the DevTools Protocol, see Section 8 Testing), and its likes and saved titles don't touch real users'. `admin.auth.admin.generateLink({ type: "recovery" })` mints reset links for it without sending email.

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
  favorited_at timestamptz,  -- added in 0006; null unless is_favorite
  primary key (user_id, tmdb_id)
);
```

`updated_at` and `favorited_at` are maintained by a trigger (`0006_feedback_timestamps.sql`) from the DB clock, since these rows are written directly from the browser.

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

1. Seed set = user's favorited/liked/highly-rated (≥7) `tmdb_id`s (most recent 20 by `updated_at`).
2. **Cold start** (no seeds yet, or signed out) → fall back to the "Trending" order used for browse (`popularity desc`), across every provider in the region.
3. Per seed, call TMDB `/recommendations` (also fetching `/similar` when it returns fewer than 10 results).
4. Merge + score by (# seeds recommending it) + a genre-overlap boost (0.5 × the share of the candidate's genres the seeds have), so overlap only breaks ties between equal seed counts. Candidates key on (media type, TMDB id).
5. **Filter to our actual catalog**: only keep candidates with a currently-available `provider_availability` row. At MVP catalog size most TMDB suggestions won't be carried locally (measured in M7: only 6 of 26 mock titles have any related title in the catalog). That's an accepted MVP limitation, so when the picks run short, the list is **topped up with trending titles** (marked `source: "trending"`) after the seed-based ones (`source: "seeds"`).
6. Exclude anything the user has an opinion on (favorite, like, dislike, any rating) or has watchlisted. Return up to 20 (`?limit=`); the home page shows 12.
7. TMDB responses are cached per seed with Next's `use cache` + `cacheLife("hours")` (`lib/tmdb-related.ts`) instead of a TTL table: no migration, no cron. The cache is per server instance, so a cold serverless instance refetches.

Code: `lib/recommendations.ts` (scoring + orchestration), `lib/tmdb-related.ts` (cached TMDB calls, 5s timeout per seed; retry waits capped at 1s so a rate limit fails the seed fast and the list falls back to trending), `lib/catalog.ts` (`getTrendingTitles`, `getCatalogTitlesByRefs`). Titles are identified by (media type, TMDB id) throughout (`lib/title-ref.ts`), since TMDB ids repeat across movies and TV. Response: `{ hasSeeds, seedLookupsFailed, titles }`. `GET /api/recommendations` and the home page's "For You" section (`app/components/for-you.tsx`) both call `getRecommendations()`; the page calls it directly rather than fetching its own API.

**Explicit non-goal**: collaborative filtering — a clear post-MVP step once there's a real user base with enough interaction density to make it outperform content-based.

---

## 7. Mock data seeding (stand-in until the real feed ships)

- `data/mock-feed.jsonl` — 20-30 hand-picked real titles (movies + series, spread across Netflix IL, Disney+ IL, Amazon Prime IL, YES), shaped like a real feed row (`imdb_id`, `provider`, `region`, `type`, `availability_type`, `watch_url`).
- `scripts/seed-mock-data.ts` — resolves each `imdb_id` → `tmdb_id` → metadata via a **shared resolver module** (`lib/tmdb-resolve.ts`) that the real ingestion pipeline will also use, so there's one matching codepath, never two that can drift. Upserts into `title_cache` + `provider_availability` exactly like a real feed row would (plain idempotent upsert — no staging/anti-join diffing needed for a manual one-off seed).
- When the real feed ships, this script is simply retired; the app never changes.

---

## 8. Explicit out-of-scope for MVP

Multi-region/i18n beyond Israel; native/mobile apps; collaborative-filtering recommendations; social features (sharing, following, reviews); price comparison/deal alerts; "leaving soon"/availability-change notifications; real usage-based "most watched" (needs watch-event tracking); offline support; admin dashboard/CMS (use Supabase Studio); payments/subscriptions; multiple profiles per account; content moderation; A/B testing; dedicated search service; precomputed/batch recommendation jobs; component/UI test automation (rendering tests); browser checks are live smoke checks against the real site instead, see Testing below; full accessibility audit; theming beyond one default look.

### Testing

**Standing rule (see `CLAUDE.md` Workflow): every feature or bug fix gets unit test(s) in the same session**, scoped to data-access, resolver, API-route, and other pure/testable logic in `lib/`, `scripts/`, and `app/api/` — e.g. `lib/catalog.ts`'s query builders (mocked Supabase client), `lib/tmdb-resolve.ts`'s TMDB mapping (mocked `fetch`), `scripts/seed-mock-data.ts`'s feed-row Zod schema, and (from M7 on) `app/api/recommendations/route.ts`'s scoring/filtering logic. Vitest, `*.test.ts` colocated next to the code they cover, run via `npm test`. Added starting M2; M1's testable logic was backfilled at the same time.

**Still out of scope**, per the "explicit out-of-scope" list above: component/page rendering tests, and any *unit* test (`npm test`) that talks to a real Supabase/TMDB backend.

**Live smoke checks (`npm run smoke`, built 2026-11-06):** the user wants Claude to check the real platform itself, signed in, instead of asking for phone screenshots. `scripts/smoke.ts` (helpers and their unit tests in `scripts/smoke-lib.ts`) is a separate command, not part of `npm test`:
- Headless Chrome over the DevTools Protocol, with no new dependency: Chrome is installed (or `CHROME_PATH`), and Node 24 has `WebSocket` and `fetch` built in. It starts its own Chrome on a random debugging port with a throwaway profile, and only ever stops that Chrome.
- Two viewports via `Emulation.setDeviceMetricsOverride`: phone (412×915, DPR 2, `mobile: true`) and desktop (1280×800).
- Signed out, at both widths: home, a provider's browse page (plain and sorted), a typo search (`strnger` → Stranger Things), a title page (the first title on Netflix's browse page, so no id is hard-coded), `/login`, `/reset-password`, `/privacy` and a 404. Home must link to `/privacy` in the footer (Google's OAuth review expects it).
- Then it signs in as the test account through the real `/login` form and checks home (For You), My List (both views), the title page and `/reset-password` (a password session must get no form), at both widths.
- The watchlist journey: toggles the title's watchlist button (`[data-action="watchlist"]`; title action buttons carry `data-action` since UI step 2) through the real UI, checks My List agrees, toggles it back (restored in a `finally`). The title page checks also wait for its "Where to watch" heading.
- The reset gate: an admin `generateLink({ type: "recovery" })` link (no email sent) must show the new-password form once and be refused on reuse. No password is ever submitted.
- The theme setting (phone, signed out): the footer's Dark sets `data-theme` and the dark `--bg`, and survives a reload (only the `<head>` script sets the attribute on load); Light wins over an emulated dark device preference; System removes the stored choice and follows the device. The stored choice is cleared afterwards.
- The header (UI step 1): home and My List must show its search icon link (`aria-label="Search"`) and My List link, and on the home page, signed out and signed in, the header must stay one row (at most 70 px tall) at 412 px and at a 360 px narrow phone.
- Per page: waits for its key content, asserts no error page and no horizontal overflow (`scrollWidth <= innerWidth`), and saves a screenshot to `.smoke/` (gitignored). Exit code 1 if any check fails.
- Defaults to production. `--url http://localhost:3000` checks a local build (only that local origin is in the Redirect URLs allow-list, so the reset check needs it; check the port is free before starting a server, and never stop a process you didn't start). On Windows, stopping a backgrounded `npm start` leaves its `next start` child holding the port: find it by port, confirm from its command line and start time that this session started it, then stop that process. (`npx next start` does the same; starting `node node_modules/next/dist/bin/next start -p 3000` with `exec` leaves no wrapper.) `--signed-out` skips everything that needs the test account.
- Gotchas it handles: plain `chrome --headless --window-size` can't go below about 500px on Windows (hence device-metrics emulation). Server HTML appears before React hydrates it, and a click or input before hydration is silently lost, so `click`/`fill` first wait for React's `__reactProps$…` key on the element. React inputs need the native value setter plus an `input` event.
- If you write a one-off DevTools script under Git Bash, set `MSYS_NO_PATHCONV=1` (it rewrites `name=/path` arguments).

**UI review captures (`npm run ui-capture`, built 2026-11-07 for Post-M8 task 5):** `scripts/ui-capture.ts` (helpers and tests in `scripts/ui-capture-lib.ts`) reuses the smoke script's Chrome helpers to take **full-page** screenshots of 23 views and states (signed out, signed in, empty states) at both widths and **in both themes** into `.ui-review/images/` (gitignored), named `<view>-<phone|desktop>-<light|dark>.png` (92 images). It then copies `docs/UI_REVIEW.md` (the review brief plus one description per view, which links to those image names) next to them and prints it to one PDF with the images inline. `--doc-only` rebuilds just the document and PDF.
- Full-page shots are taken in 1200px tiles and stitched with `sharp` (now a pinned devDependency; Next already shipped that version): a single full-page PNG of a poster-heavy page is too big for one DevTools message, and Chrome drops the socket (close 1006). The PDF is read the same way, as a stream (`transferMode: "ReturnAsStream"` plus `IO.read`).
- Lazy posters are switched to eager before each shot, or below-the-fold posters come out blank.
- Themes: each view is loaded once and shot light, then dark, by switching the emulated `prefers-color-scheme` in place (no reload), so a `prepare` state or a single-use reset link is shot in both. A full run first deletes the old PNGs in `images/`, and fails if `docs/UI_REVIEW.md` links to an image the run didn't take (`referencedImages`).
- Live side effects: the "empty My List" shot removes the test account's watchlist titles through the UI and restores them in a `finally` (their `created_at` changes). The reset-form shots use admin-minted recovery links, as in the smoke check. The form's "For <email>" line is replaced with a placeholder before the shot, since these images go to a third party.
- When a view's markup or copy changes, update its description in `docs/UI_REVIEW.md`, and add a `ViewSpec` for any new page.

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
- [x] Title detail page (`/title/[tmdb_id]`, since 2026-11-06 `/title/[media_type]/[tmdb_id]` with old links redirected) — overview, genres, rating, list of providers/watch links
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

- [x] Favorite / like-dislike / rating controls on the title card and detail page
- [x] Wire mutations to `user_title_feedback` (upsert)
- [x] Wire watchlist add/remove to `user_watchlist`
- [x] "My List" page (watchlist + favorites, each with its own view)
- [x] Verify RLS: a second test account cannot see or modify the first account's data

*Demo: favorite/like/rate a few titles, see them reflected in My List.*

### M7 — Recommendations
**Story:** As a signed-in user, I want to see titles recommended to me based on what I've liked or rated highly, so I can discover something new to watch.

- [x] `/api/recommendations` route handler
- [x] Seed-set gathering from `user_title_feedback` (favorites/likes/rating ≥ 7)
- [x] Cold-start fallback to the Trending query when there's no seed data yet
- [x] Per-seed TMDB `/recommendations` (fallback `/similar`) calls
- [x] Merge + score candidates (seed count + genre overlap)
- [x] Filter results to titles currently available in our catalog
- [x] Exclude already favorited/watchlisted/disliked titles
- [x] "For You" UI section on the home/browse page (home page only)
- [x] (Optional) TTL cache for TMDB recommendation responses (`use cache` + `cacheLife("hours")`, not a table)

*Demo: like two titles, see the "For You" section update accordingly.*

### M8 — Polish & production hardening
**Story:** As a user, I want the app to behave well when things are empty, loading, or go wrong, and to work on my phone, so the MVP feels like a finished product rather than a prototype.

- [x] Loading skeletons across all data-fetching pages
- [x] Empty states (no search results, no favorites yet, no recommendations yet), plus `error.tsx`/`not-found.tsx`
- [x] Graceful handling of TMDB errors/rate limits
- [x] Responsive layout pass (mobile/tablet/desktop): header and title page fixed from phone screenshots; every page, signed out and signed in, checked at 412px via emulated screenshots; narrow-`<main>` bug fixed (2026-11-06)
- [x] Basic SEO metadata (titles, OG tags)
- [x] Forgot-password / reset flow (added 2026-11-06; surfaced by the phone smoke test)
- [x] Share button on the title page (OS share sheet, clipboard fallback)
- [x] Final production deploy + full manual smoke test of the end-to-end journey (2026-11-06; see that day's last Progress Log entry)

*Demo: complete user journey — browse → search → sign up → favorite titles → see recommendations — on the live production URL.*

### Post-M8 (queued, not MVP work)
Agreed order (2026-11-06; SMTP moved last the same day, when it got blocked):
1. [x] **Google sign-in for everyone** (plus the code side of custom email).
   - [x] Choose an email sender: Gmail SMTP with an app password, from a dedicated Gmail account, until there's a domain (Resend needs a verified domain to send to anyone but the account owner). See the 2026-11-06 (SMTP) Progress Log entry.
   - [x] Code: sign-up confirmation links go to `/auth/confirm` (token hash, works in any browser); the Reset Password template stays at its default (implicit flow already works anywhere).
   - [x] Privacy policy page `/privacy` plus a site footer linking to it (Google's Publish button stays disabled until Branding has a home page and privacy policy link).
   - [x] User: in Google Auth Platform → Branding, set Application home page `https://playnext-beta.vercel.app` and privacy policy link `https://playnext-beta.vercel.app/privacy`, and save. No logo (a logo forces brand verification, which needs an owned domain).
   - [x] User: publish the Google OAuth consent screen (Google Auth Platform → Audience → Publish app). Done 2026-11-06: status **In production**, user type External. The 100-user cap shown there only counts unapproved sensitive/restricted scopes, and PlayNext requests none. Reversible ("Back to testing").
   - [x] User: Google sign-in works for an account that was never a test user (confirmed 2026-11-06, incognito window).
2. [x] **Live smoke checks** per Section 8 Testing: `npm run smoke` (`scripts/smoke.ts`), run against production with the test account (2026-11-06: 30/30; 32 checks after `/privacy` was added).
3. [ ] **Real catalog ingestion**, below. **In progress.** Steps 1–4 done (step 4 on 2026-11-07; migration 0009 live); **step 5 (the daily GitHub Action) is in progress**: built and passing on GitHub with a mock stand-in; only the collector and the daily schedule wait for Noam. The step checklist and the feed's state are in `docs/INGESTION.md` Status, and the feed contract is in `docs/FEED_REQUIREMENTS.md`.
5. [ ] **UI review with Gemini** (queued 2026-11-07 by the user, while waiting for Noam's collector). **Current workstream.**
   - [x] Claude: screenshots of every view, plus a description of each, for the user to give Gemini. Done 2026-11-07: `npm run ui-capture` writes `.ui-review/` (50 full-page images, `PlayNext-UI-review.md` copied from `docs/UI_REVIEW.md`, and the same as one PDF).
     - Cover phone and desktop widths, signed out and signed in (the test account), and full page, not just the first screen.
     - Include the states a user can meet: empty My List, no search results, not found, the login and reset forms, and a title page with and without a watch link.
     - `npm run smoke` already captures most views in `.smoke/` (gitignored), but as viewport shots. Extend it, or add a separate capture script, rather than asking the user for screenshots.
     - Each description says what the view is for, what's on it, how the user gets there, and the known constraints. Constraints: Israeli audience, phone first, the mock catalog (Netflix, Disney+ and Prime titles are made up until phase 2), Next.js with server-rendered pages, no design system.
     - Deliver one folder of images plus one document, with a short brief at the top. The brief asks Gemini for concrete, prioritized suggestions per view (what, why, and how big a change). **Changed 2026-11-07 by the user:** it now first asks for 2–3 distinct UI directions with mockups, so we can choose a direction, and the per-view suggestions are part 2. The document opens with the platform's purpose, so the directions are grounded in it.
   - [x] User: gave them to Gemini, which returned 3 UI directions as published mockups (2026-11-09).
   - [x] Together: chose a direction. **Direction 1 "Watch-First" plus two additions, both light and dark themes** (2026-11-09). The decision and the full spec are in **`docs/UI_DIRECTION.md`**. Gemini's per-view suggestions (Part 2 of the brief) were never requested: the direction replaced them.
   - [ ] Implement it, in the steps of `docs/UI_DIRECTION.md` Section 6 (0 foundation, 1 header/footer, 2 title page, 3 cards, 4 home, 5 search, 6 browse, 7 My List, 8 auth/static pages, 9 wrap-up). Each step is checked in both themes with `npm run ui-capture` and `npm run smoke` (no component tests, per Section 8); any logic it touches gets unit tests. Progress is ticked there, not here.
4. [x] **Custom SMTP** (deferred, then finished later the same day, 2026-11-06). Email sign-up confirmations and resets now reach any address (reset emails may land in spam until there's a domain + Resend).
   - [x] User: turn on 2-Step Verification for `play.next.app8@gmail.com` and create an app password (first blocked with "We couldn't verify that it's you", a common hold on brand-new accounts when tried from a phone; it worked on a later attempt).
   - [x] User: Supabase → Authentication → Emails → SMTP Settings (saved; Supabase warns Gmail is a personal provider, expected until there's a domain): host `smtp.gmail.com`, port `465`, username = the full Gmail address, password = the app password, sender email = the same address, sender name `PlayNext`. Then raise Authentication → Rate Limits → emails per hour (custom SMTP starts at about 30).
   - [x] User: "Confirm signup" template → `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`. Leave Reset Password at its default.
   - [x] Code: add Google (Gmail) as the account-email sender in `/privacy`'s "Who else handles it".
   - [x] User: a sign-up confirmation and a reset email arrive at an address that isn't a Supabase team member, and their links work from a phone's mail app. Then `npm run smoke`.

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
- `lib/recommendations.ts` — recommendation seeds, scoring, exclusions, trending top-up

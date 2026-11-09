# UI direction: the decision and the build plan

Post-M8 task 5 (`docs/MVP.md`). This file is the spec for the UI rebuild: what was decided, what each view becomes, and the order to build it in. Read it in full before working on any UI step. The step checklist and its progress are in Section 6.

## 1. The decision (2026-11-09)

- Gemini proposed three directions from `docs/UI_REVIEW.md` (published mockups: `sites.google.com/view/playnext-direction-1-mockup`, `…/playnext-direction-2-mockup`, `…/playnextdirection3mockup`; screenshots in `.ui-review/gemini/`, gitignored).
- **Chosen: Direction 1, "Watch-First / Quick Guide"**, plus two ideas from the others:
  1. From Direction 3: a **Watch button straight on search results**, for each service that has a link, so it's one tap from search to the service.
  2. From Direction 2: **service tiles on the home page that show a title count and sample titles**, so browsing by service invites a tap.
- Why Direction 1: it is built around the platform's main job, "where can I watch X?" (`docs/UI_REVIEW.md` "Purpose"). Search comes first on the home page, and the title page leads with where to watch. It also needs almost no data we don't have.
- Not taken: Direction 3's subscriptions dashboard ("Included / Rent/Buy" per service needs a "my services" feature we don't have; its "Queue" rename) and Direction 2's service-first home (it buries search).
- **Both light and dark themes**, designed together (Section 3).
- The mockups are a direction, not a pixel spec. Their desktop title pages are broken (breadcrumb crammed into an empty column), and they show data we don't have. Section 4 is the spec; where it and the mockups differ, Section 4 wins.

## 2. Rules for every step

- **Only show data we have.** Never add: season counts, "Trending in Israel" (our trending is TMDB's worldwide popularity: say "Trending now"), "Updated today/live", "Popular searches", "Catalog only", or per-user subscriptions. If a mockup shows it, leave it out.
- **Keep every route, URL and query parameter** (`/browse/<slug>?sort=&type=&avail=&genre=`, `/search?q=`, `/title/<type>/<id>`, `/my-list?view=favorites`), and keep server rendering. This is a restyle and restructure, not new pages.
- **Keep the existing components and data paths** and change them in place (`app/components/*`); add new components only where a view needs one (listed per step).
- **No component library and no new CSS framework.** Hand-written CSS modules on shared tokens (Section 3). No new runtime dependencies.
- **Phone first** (412 px), then desktop (1280 px). Tap targets at least 44×44 px. Visible focus rings. Text contrast at least WCAG AA (4.5:1 body text, 3:1 large text and icons) in both themes.
- **No streaming-service logos** (no rights). Names and brand colors only, as today.
- **English, left to right.** Use logical CSS properties (`margin-inline-start`, `padding-inline`, `inset-inline-end`) instead of left/right, so a later Hebrew RTL version costs less.
- **Tests:** any logic a step adds or touches gets Vitest tests (`docs/MVP.md` Section 8). UI is checked with `npm run ui-capture` (every view, both themes, both widths) and `npm run smoke`. Update the smoke script's selectors in the same step when markup it relies on changes.
- **Keep `docs/UI_REVIEW.md` true:** when a view changes, update its description there, since the next review starts from it.

## 3. Visual system

### Theme mechanism (step 0)

- Three settings: **System** (the default: follows the device), **Light**, **Dark**. They're picked with a small segmented control in the footer ("Theme: System · Light · Dark"), so the header stays uncluttered.
- Stored in `localStorage` (`playnext-theme`). A tiny inline script in `<head>` (root layout) sets `data-theme` on `<html>` before first paint, so there's no flash. Without a stored choice there's no attribute, and CSS follows `prefers-color-scheme`. `<html>` gets `suppressHydrationWarning`. Not a cookie: reading cookies in the root layout would make every page dynamic (the codebase avoids that; see `app/components/auth-nav.tsx`).
- The pure logic (parse the stored value, the `data-theme` value per setting, and the inline script, built as a string from the same values) lives in `lib/theme.ts` with unit tests; the script is tested by running it against a fake `localStorage` and `<html>`. The footer control is `app/components/theme-control.tsx`. `app/global-error.tsx` (its own `<html>`) carries the script too.
- CSS: light tokens on `:root`; dark tokens under `:root[data-theme="dark"]` and under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`. `color-scheme` follows, so native selects and scrollbars match.

### Tokens (in `app/globals.css`; components use only these)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f6f7fb` | `#0b0e1a` | page background |
| `--surface` | `#ffffff` | `#151a29` | cards, panels, header |
| `--surface-2` | `#eef0f6` | `#1e2436` | inputs, chips, pressed buttons, skeletons |
| `--border` | `#e1e4ee` | `#2a3148` | card borders, dividers |
| `--border-strong` | `#7c859b` | `#6b7591` | form control and secondary button borders (3:1 on every background, WCAG 1.4.11) |
| `--text` | `#111827` | `#eef1f8` | main text |
| `--text-muted` | `#5b6478` | `#9aa3b9` | secondary text (must still pass AA on `--surface`) |
| `--accent` | `#4f46e5` | `#818cf8` | links, focus ring, selected tab, primary buttons |
| `--accent-contrast` | `#ffffff` | `#0b0e1a` | text on `--accent` |
| `--accent-soft` | `#e6e5fb` | `#2b2f5c` | pressed/selected fill behind `--text` |
| `--rating` | `#a3480a` | `#fbbf24` | ★ rating text/badge |
| `--danger` | `#c81e1e` | `#f87171` | errors |
| `--success` | `#047857` | `#34d399` | "Subscription"/"Free" availability text |

Checked in step 0: `lib/color.test.ts` reads these from `app/globals.css` and asserts AA for every text token on `--bg`, `--surface` and `--surface-2` in both themes, plus the accent pairs and `--border-strong`'s 3:1. Step 0 changed the starting values: light `--rating` (was `#b45309`, 4.41:1 on `--surface-2`) and `--danger` (was `#dc2626`, 4.24:1), and added `--border-strong` and `--accent-soft`. Radius: `--radius-sm 8px`, `--radius 12px`, `--radius-lg 16px`. Spacing on a 4 px grid. Layout: `--control-height` 44 px and (step 1) `--gutter`, the side padding: 1.5rem, 1rem at 600 px and below. The header and footer use it; each page adopts it in its own step, so content lines up with the logo. Shadows only in light mode (dark uses borders).

- **Font:** Geist, already loaded in `app/layout.tsx` but unused today (the body says Arial). Switch the body to `var(--font-geist-sans)`. Headings 700, body 400/500. Sizes: page title 28/32 px (phone/desktop), section title 18 px, body 15–16 px, meta 13 px.
- **Service colors** stay in `lib/providers.ts`. Add an `onColor` field (text color on that brand color) chosen by a contrast helper in `lib/color.ts`, unit-tested so each Watch button passes AA (e.g. yes amber gets dark text). Service colors appear as: a dot next to the name everywhere, the Watch button background, and a thin accent on service tiles.

### Shared pieces (styled in step 0, used everywhere)

Buttons (primary = accent, secondary = surface plus border, service = brand color), inputs and native selects (same height, 44 px), chips/pills, cards (surface, border, radius), segmented control, skeletons (on `--surface-2`), focus ring (2 px `--accent` outline, offset 2 px).

Built in step 0 as global classes in `app/globals.css`: `.btn` with `.btn-primary` / `.btn-secondary` / `.btn-service` (the last reads `--service-color` and `--service-on`, set inline from a provider's `color` / `onColor`), `.input`, `.select`, `.chip`, `.card`, `.segmented` (children selected by `aria-pressed="true"` or `aria-current`), `.text-link`, `.skeleton`, and `:focus-visible`. Components combine them with their module class (`className={`card ${styles.tile}`}`); `globals.css` is imported first in the root layout so module rules win ties.

## 4. The views

The current state of each is in `docs/UI_REVIEW.md` (same view numbers).

### Header and footer (step 1)

- Header, phone: logo · search icon button (`/search`) · **My List** · signed out "Sign in" / signed in first name plus Sign out. Desktop: the same with a "Browse" link. It's `--surface` with a bottom border, and it isn't sticky.
- Footer: PlayNext · Privacy (must stay on every page: smoke checks it) · "Title data from TMDB" · the theme control.

### Title page (step 2; the most important view)

- Phone order: a compact top block (poster ~120 px wide at the inline start; next to it the title, year · type · ★ rating, genres as small chips), then **Where to watch**, then the action buttons, then the overview. Share moves to the top block (icon plus "Share").
- **Where to watch** is a card titled "Where to watch". One row per service: dot, name, availability ("Subscription", "Rent", "Buy", "Free"; subscription/free in `--success`), and at the inline end a **Watch button in the service's color** ("Watch →", opens the service in a new tab). A row without a link shows muted text "No direct link yet" instead of a button. With several services, subscription and free rows come first, then rent and buy. That sort is a pure function with tests.
- Actions: labeled buttons ("♡ Favorite", "+ Watchlist" / "✓ On watchlist", "👍", "👎", "Rate ▾"). Pressed is accent-tinted. The behavior is exactly today's `TitleActions`; only markup and style change.
- Desktop: two columns. Poster (260 px) at the inline start; on the right the title block, Where to watch (rows, or cards side by side when there are 3 or more), actions, overview. No breadcrumb.

### Title cards and grids (step 3; used by home, browse, My List)

- Card: poster (2:3, radius) with a **★ rating badge** in the corner, title (2 lines max), year · type. Below it a compact row with just **♡ and +** (favorite, watchlist) as 36 px icon buttons. Like, dislike and rating move to the title page only. The poster and title link to the title page.
- Add `vote_average` to `TitleSummary` (`lib/user-titles.ts` embed) so cards everywhere can show the badge, with tests updated.
- Grid: 2 columns on phones, 3 on tablets, 5–6 on desktop, 12–16 px gaps.

### Home (step 4)

1. **Search first:** a large search field "Where can I watch… (e.g. Stranger Things)". It's a plain `<form action="/search">` with `name="q"`, so it works before JavaScript loads and lands on the search page.
2. **Services:** a row of service tiles (horizontal scroll with snap on phones, a 5-column row on desktop). Each tile: dot, name, "N titles", and up to 2 sample titles (most popular) in muted text; it links to `/browse/<slug>`. Data: a new `getProviderSummaries()` in `lib/catalog.ts` (count plus top titles per provider, from `v_catalog`), with tests and no migration.
3. **Featured:** "Trending now" shows the top trending title as a wide card: poster, title, meta, and its Where to watch rows with Watch buttons (the title page's component, reused).
4. **For You** (signed in) / **Trending** (signed out): the card grid, with today's captions and the signed-out "Sign in…" line. Keep the `h2` texts "For You" and "Trending" (smoke checks them) or update the smoke script.

### Search (step 5)

- Search field (as on home, filled in), then a line "N results for “q”". When the best match's title doesn't contain the query (a typo match), add "Showing closest matches"; that's a pure function with tests.
- Result card: poster and title/meta link to the title page. Below them, **one button per service**: with a link it's a service-colored "Watch on Netflix →" (opens the service); without one, a plain chip "Partner TV" with the availability. The card is no longer one big link, so links don't nest.
- The empty and no-results states keep their copy, restyled. "browse by service" stays a link.

### Browse (step 6)

- Header block: dot plus service name (page title) and "N titles" (with filters: "N of M titles").
- Filter bar: **all four selects stay** (Sort, Type, Availability, Genre), styled; 2×2 on phones, one row on desktop. When filters are active, a "Clear filters" link appears.
- Card grid (step 3). Empty states as today, restyled.

### My List (step 7)

- Title plus a segmented control: Watchlist · Favorites (still links: `aria-current` stays, smoke uses it). Card grid.
- Empty state: a centered panel with a short line ("Your watchlist is empty") and a primary button "Find something to watch" (home).

### Sign in, reset, privacy, 404, error, loading (step 8)

- Sign in: a centered card (max 400 px); Sign in / Sign up as a segmented control; the page title follows the tab ("Sign in" / "Create account"); full-width inputs; a primary button; a "Continue with Google" secondary button with the "or" divider. Errors in `--danger` with an icon; info in `--success`. Forgot-password mode as today.
- Reset password (both states), Not found, Error: the same centered-card style with clear primary and secondary actions.
- Privacy: a readable text column (max ~70 characters per line) and headings on the type scale.
- Skeletons: match the new layouts (title page, grids, search) on `--surface-2`.

## 5. Build order and how each step is checked

**Order: foundation first, then one view at a time, each in both themes before moving on.** Because every color is a token, a view built on tokens works in both themes from the start, so checking both per step costs little. It also avoids a whole-app light-mode pass at the end that would find the same problems everywhere at once.

For every step:
1. Build it on a local production build (`npm run build && npm start`; check port 3000 is free first, and never stop a process this session didn't start).
2. `npm test`, `npx tsc --noEmit -p .`, `npm run lint`, `npm run format:check`.
3. `npm run ui-capture -- --url http://localhost:3000`, then look at the step's views in both themes at both widths (the images, not just the pass/fail), and fix what looks wrong.
4. `npm run smoke -- --url http://localhost:3000`, all passing (update its selectors if markup changed).
5. Update `docs/UI_REVIEW.md` for the changed views, tick the step in Section 6, commit, push (Vercel deploys main), then `npm run smoke` against production.

## 6. Steps

- [x] **0. Foundation.** Done 2026-11-09 (see `docs/MVP.md` Progress Log). Tokens for both themes; the theme mechanism (`lib/theme.ts` plus tests, the inline script, the footer control); Geist font; shared button/input/select/chip/card/segmented/focus styles; `onColor` per provider (`lib/color.ts` plus tests). Extend `npm run ui-capture` to shoot every view in both themes (a light and a dark image per view and width, set with `Emulation.setEmulatedMedia`; drop the separate dark views 24–25), and update the document's image references. Existing pages should already look coherent in both themes.
- [x] **1. Header and footer.** Done 2026-11-09 (see `docs/MVP.md` Progress Log). Search is an icon link named "Search"; the signed-in name is the first name at every width; Sign in is a primary button; the footer matches the header's surface. Added a `--gutter` layout token (Section 3) that steps 2–8 should use for page side padding.
- [ ] **2. Title page** (Where to watch first, service-colored Watch buttons, labeled actions, desktop two-column; availability sort plus tests).
- [ ] **3. Title cards and grids** (rating badge, ♡ and + only; `vote_average` in `TitleSummary` plus tests).
- [ ] **4. Home** (search form, service tiles via `getProviderSummaries()` plus tests, featured trending title, grid).
- [ ] **5. Search** (results line, closest-match hint plus tests, per-service Watch buttons, no nested links).
- [ ] **6. Browse** (header with counts, 4 styled selects, clear filters).
- [ ] **7. My List** (segmented control, empty-state panel).
- [ ] **8. Sign in, reset, privacy, 404, error, skeletons.**
- [ ] **9. Wrap-up.** A full `ui-capture` in both themes, reviewed view by view; contrast and focus pass; `docs/UI_REVIEW.md` fully updated; production smoke. Then ask the user whether to send the new screenshots to Gemini for a second review.

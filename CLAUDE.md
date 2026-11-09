# PlayNext

Helps users find where to watch a movie/show across streaming services (Netflix, YES, etc.), sort/filter/search the catalog, track favorites/watchlist/ratings, and get basic recommendations.

## Required reading — before doing anything else

1. **`docs/MVP.md`** — product scope, architecture, and the ordered implementation plan (milestones M0→M8 with task checklists). This is the source of truth for what the app is and what's left to build.
2. **`docs/INGESTION.md`** — the daily catalog ingestion pipeline design (Post-M8 task 3). Built and running on GitHub with a mock stand-in; **paused until the external developer's collector arrives** (its Status section says what's left). Read its Status and Progress Log; read it in full when working on ingestion.
3. **`docs/FEED_REQUIREMENTS.md`** — the contract for the external developer's feed (row format, provider codes, the manifest, an acceptance checklist). The pipeline's code in `ingestion/src/` validates against it.
4. **`docs/UI_DIRECTION.md`** — the chosen UI direction (Direction 1 "Watch-First" plus two additions, light and dark themes): rules, visual system, a spec per view, and the build steps 0–9 with their checklist. Read it in full before any UI work.

The **current workstream** is Post-M8 task 5 in `docs/MVP.md`: building the UI direction in `docs/UI_DIRECTION.md`, one step at a time (next unchecked step in its Section 6). `docs/UI_REVIEW.md` describes every view as it is now (keep it updated as views change), and `npm run ui-capture` screenshots them all, in light and dark. Components use only the theme tokens and shared classes in `app/globals.css` (built in step 0); page side padding uses the `--gutter` token (added in step 1, so content lines up with the header), adopted page by page in steps 2–8. Title action buttons (favorite, watchlist, like, dislike) carry `data-action` (step 2); `scripts/smoke.ts` and `scripts/ui-capture.ts` select on it, so keep it when restyling. The "Where to watch" card is `app/components/where-to-watch.tsx`, reusable on home (step 4). Title cards (step 3) are `app/components/title-card.tsx` (only ♡ and +; like, dislike and Rate are the title page's) in the shared `.title-grid` class, with `TitleCardSkeleton` for loading; ratings display through `ratingLabel()` in `lib/format.ts`, and smoke's `has.titleCards` checks the card shape.

`docs/MVP.md` and `docs/INGESTION.md` each have a **Progress Log** near the top — read it first to see what prior sessions already did and what the next step is. Don't ask the user to re-explain context that's already in these files.

## Workflow for every session

1. Read the Progress Log in `docs/MVP.md` (and `docs/INGESTION.md` if relevant) to find the current state.
2. Implement the next unchecked task(s) in `docs/MVP.md` Section 9 — usually one milestone, or part of one, not the whole remaining backlog at once (currently Post-M8 task 5). For the ingestion work, the next unchecked step in `docs/INGESTION.md` Status.
3. **Every feature or bug fix gets unit test(s) in the same session**, per the scope in `docs/MVP.md` Section 8 "Testing" — i.e. data-access, resolver, API-route, and other pure/testable logic in `lib/`/`scripts/`/`app/api/`/`ingestion/src/` always gets Vitest tests (`npm test`); UI/component/page rendering stays manual-smoke-test-only (no component/E2E framework), as that section spells out. When touching an un-guarded script or module with side-effecting top-level code, make sure it's safe to `import` from a test before writing one against it (see that section's safety rule).
   For UI and integration checks, don't default to asking the user for screenshots: run `npm run smoke` (headless Chrome against production at phone and desktop widths, signed out and signed in as the dedicated test account, with screenshots in `.smoke/`; credentials in `.env.local`, never printed), and extend it when a change adds a page or flow. See `docs/MVP.md` Section 8 "Testing" (live smoke checks) and Prerequisites (test account). Before starting a local server, check the port is free, and never stop a process the session didn't start.
4. Check off (`- [x]`) each task as it's completed.
5. **Before ending the session**, append a new Progress Log entry (date, what was done, any deviations from the doc, explicit next step).
6. If something in either doc turns out wrong or outdated once actually building it, update that doc directly rather than leaving it stale, and note the change in the Progress Log entry.
7. **Database migrations** (`supabase/migrations/`): dry-run each one on the live DB inside a rolled-back transaction first. Apply it only with the user's explicit approval, using `npx supabase db push --yes --db-url "$SUPABASE_DB_URL"` as its own step, and confirm the output says "Applying migration". Only then push code that depends on it (2026-11-06: chaining the two pushed code ahead of an unapplied migration).

This applies automatically, every session, without the user needing to ask.

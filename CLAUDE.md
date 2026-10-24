# PlayNext

Helps users find where to watch a movie/show across streaming services (Netflix, YES, etc.), sort/filter/search the catalog, track favorites/watchlist/ratings, and get basic recommendations.

## Required reading — before doing anything else

1. **`docs/MVP.md`** — product scope, architecture, and the ordered implementation plan (milestones M0→M8 with task checklists). This is the source of truth for what the app is and what's left to build.
2. **`docs/INGESTION.md`** — the daily catalog ingestion pipeline design. Only needed in depth when touching `title_cache`/`provider_availability` schema or the post-M8 real-feed cutover, but skim its Status section regardless.

Both files have a **Progress Log** near the top — read it first to see what prior sessions already did and what the next step is. Don't ask the user to re-explain context that's already in these files.

## Workflow for every session

1. Read the Progress Log in `docs/MVP.md` (and `docs/INGESTION.md` if relevant) to find the current state.
2. Implement the next unchecked task(s) in `docs/MVP.md` Section 9 — usually one milestone, or part of one, not the whole remaining backlog at once.
3. Check off (`- [x]`) each task as it's completed.
4. **Before ending the session**, append a new Progress Log entry (date, what was done, any deviations from the doc, explicit next step).
5. If something in either doc turns out wrong or outdated once actually building it, update that doc directly rather than leaving it stale, and note the change in the Progress Log entry.

This applies automatically, every session, without the user needing to ask.

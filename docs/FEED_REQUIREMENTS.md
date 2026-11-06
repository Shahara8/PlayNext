# PlayNext catalog feed: requested changes (phase 1: YES and Partner TV)

**For:** Noam, owner of the `provider-catalog-fetchers` branch
**From:** Shahar (PlayNext app)
**Date:** 2026-11-06

Thanks for the fetchers. They install cleanly and all 45 tests pass (1 skipped without the local HARs). A live `python -m playnext fetch` on 2026-11-06 returned 329 YES and 108 Partner TV records. This document lists what needs to change before the PlayNext app can use that output as its real catalog.

**Scope of this phase: YES and Partner TV only.** Once both are complete and we've signed off on them (see the [acceptance checklist](#7-acceptance-checklist-phase-1)), you add the other providers ([section 8](#8-phase-2-other-providers-after-sign-off)). Please don't start new providers before then, so whatever we learn from these two applies to all of them.

---

## 0. First: merge `main` into your branch, and move the package

Your branch was created from `main` at commit `6f8acaf` (2026-10-24), and `main` has moved on since. **Please merge the latest `origin/main` into `provider-catalog-fetchers` before making any other change**, and again before opening a pull request.

```powershell
git fetch origin
git checkout provider-catalog-fetchers
git merge origin/main
```

You'll get conflicts or collisions in these files. Here's how to resolve each one:

| File | What happened on `main` | What to do |
|---|---|---|
| `README.md` | `main` has the web app's README. | Keep `main`'s version. Move your README to `ingestion/collector/README.md` (see the layout below). |
| `docs/INGESTION.md` | The app team maintains this file (Status and Progress Log), and `main` has edited it. | Keep `main`'s version and drop your edits to it. Put your notes and progress log in your own README instead. We'll update `INGESTION.md` from your README when we integrate. |
| `.gitignore` | `main` has the app's ignore rules. | Keep `main`'s rules. Move your rules to `ingestion/collector/.gitignore`. **Important:** your rule `data/*` would also cover `data/mock-feed.jsonl` at the repo root, which the app uses, so it must not sit at the root. |
| `data/` | `main` keeps `data/mock-feed.jsonl` (the app's current mock catalog) here. | Don't write output into the root `data/` folder. Use `ingestion/collector/data/` instead (ignored by your `.gitignore` there). |

**Requested layout:** everything Python lives in `ingestion/collector/`, so it doesn't mix with the Next.js app at the repo root:

```text
ingestion/collector/
  pyproject.toml
  README.md
  .gitignore
  src/playnext_collector/...   (renaming the package is optional; "playnext" alone is fine)
  tests/...
  examples/...
  data/                        (generated output; ignored by Git)
```

Please don't change anything outside `ingestion/collector/` (the app code, `docs/MVP.md`, `docs/INGESTION.md`, `package.json`, etc.). If you think something there should change, tell Shahar instead.

---

## 1. How we'll run it

You don't need to upload files anywhere. **We'll run your fetcher ourselves**, once a day, in a GitHub Actions job on Linux (`ubuntu-latest`) with Python 3.12. The job will roughly do:

```bash
cd ingestion/collector
python -m pip install .
python -m playnext fetch --output-dir "$OUT"
# then our own TypeScript pipeline reads $OUT and updates the database
```

So the fetcher must:

- **Run unattended:** no prompts, no browser, no HAR files, no logged-in cookies.
- **Work on Linux from a cloud IP address.** YES already needed a 403 workaround from your machine, and data-center IPs are more likely to be blocked. If you can, test it from a GitHub Actions run on your own fork (a `workflow_dispatch` workflow is enough) and tell us the result.
- **Finish in under 20 minutes** for both providers.
- **Be polite to the provider sites:** at most about 2 requests per second per site, retries with backoff (you already have this), a real User-Agent, and respect for `robots.txt`.
- **Report problems through exit codes:** `0` when every provider succeeded; non-zero otherwise, with a clear message on stderr.
- **Keep secrets out of the code.** Read any API key (for example TMDB, see [section 3](#3-imdb-id-required)) from an environment variable such as `TMDB_API_KEY`, and never commit it.
- **Pin your dependencies** to a working range. Your current `pyproject.toml` already does this.

---

## 2. Output format changes

### 2.1 One file per provider, plus a run report

Today all providers go into one merged `catalog.jsonl`, and if one provider fails, nothing is updated. We process each provider separately, so that a YES failure doesn't block Partner TV. Please write:

```text
$OUT/YES.jsonl
$OUT/PARTNER_TV.jsonl
$OUT/manifest.json
```

- Each `.jsonl` file holds that provider's **complete** list for this run, one JSON object per line, in UTF-8.
- **If a provider fails, don't write its `.jsonl` file at all.** Never write a partial or empty file. Still write the other providers' files and the manifest, and exit non-zero.
- `manifest.json` describes the run. You already have most of this in `CatalogSnapshot.report()`. For example:

```json
{
  "generated_at": "2026-11-06T03:00:12Z",
  "collector_version": "0.2.0",
  "providers": {
    "YES": {
      "status": "ok",
      "coverage": "complete",
      "file": "YES.jsonl",
      "records": 2841,
      "provider_reported_total": 2850,
      "source_urls": ["https://..."],
      "null_counts": {"imdb_id": 112, "watch_url": 0},
      "unmatched_titles": ["...", "..."]
    },
    "PARTNER_TV": {
      "status": "failed",
      "error": "HTTP 503 after 3 retries"
    }
  }
}
```

`coverage` must be `"complete"` only when the file really contains the provider's whole catalog (see [2.2](#22-full-catalog-coverage-the-most-important-change)). `provider_reported_total` is the provider's own total count, if the site exposes one; use `null` if it doesn't.

### 2.2 Full catalog coverage (the most important change)

The current sources are the **YES home page** (`/content/main/`) and **Partner's marketing page** (`n/tv-content`). They show curated selections, not the catalog. YES's VOD library is far larger than 329 titles.

This matters because our pipeline treats each daily file as the full truth: **a title missing from today's file gets marked "no longer available"** on the site. With a home-page snapshot, titles would appear and disappear every day as the page rotates.

Please:

- Find the endpoints that list **every** movie and series available on YES VOD and on Partner TV. Likely candidates are category or genre listing APIs and "all movies" / "all series" pages, with pagination.
- Walk all the pages and categories, then remove duplicates.
- Document in your README which endpoints you use, how pagination works, and how you know the list is complete (for example, it matches a total shown on the site, or the category counts add up).
- Set `coverage: "complete"` only when you're confident. If a provider can only be fetched partially, say so with `"partial"`; we'll then handle it more conservatively.

### 2.3 Provider codes

Use these exact values in the `provider` field. They match the app's database:

| Provider | `provider` value |
|---|---|
| YES | `YES` |
| Partner TV | `PARTNER_TV` |
| FreeTV (later) | `FREETV` |

Use uppercase with underscores, and no spaces. Today the code writes `"Partner TV"`; please change it to `PARTNER_TV`.

### 2.4 Field-by-field requirements

Each line keeps the agreed 14 fields, with one optional addition, `match_source` (explained in [section 3](#3-imdb-id-required)).

| Field | Required? | Today | What we need |
|---|---|---|---|
| `provider` | Yes | OK, except `"Partner TV"` | The codes from [2.3](#23-provider-codes). |
| `region` | Yes | OK | `IL`. |
| `title` | Yes | Includes season suffixes, e.g. `הטבח \| עונה 3` | The title as shown on the provider, **without** season or dubbing suffixes (see [2.5](#25-one-row-per-title)). |
| `original_title` | Strongly preferred | YES OK; Partner 1 of 108 | The English or original-language name. Take it from the provider if it's there; otherwise from TMDB once matched ([section 3](#3-imdb-id-required)). |
| `type` | **Yes, on every row** | 58 of 108 Partner rows are `null` | `movie` or `tv_series`. Take it from the title's detail page/API or from the category, and if still unknown, from the TMDB match. A row with no type is rejected. |
| `release_year` | Strongly preferred | YES 222/329; Partner 0/108 | We need it to match titles reliably. Take it from the provider (detail page) or TMDB. |
| `imdb_id` | **Yes** | **0 of 437** | See [section 3](#3-imdb-id-required). |
| `tmdb_id` | Strongly preferred | 0 | Fill it whenever you have it ([section 3](#3-imdb-id-required)). |
| `availability_type` | **Yes** | Always `null` | One of `subscription`, `rent`, `buy`, `free`. Determine it per title from the provider (included in the package, rental, purchase, free). **Don't use `ads`**: our database doesn't accept it, so remove it from your enum; ad-supported free titles are `free`. If a provider only has package content, `subscription` for all rows is fine; note that in the README. |
| `watch_url` | **Yes** | Always `null` | The direct link to the title's own page on the provider's site/app (an `https` URL), not the home page or a category page. Users click it to start watching. |
| `seasons_available` | For series | Partner partly; YES none | The season numbers available, e.g. `[1, 2, 3]`. `null` only if truly unknown. Always `null` for movies. |
| `added_date` | Optional | `null` | Only if the provider explicitly shows it. **Don't** use the date your script first saw the title; we track that ourselves. |
| `removed_date` | Optional | `null` | Leave it `null`. We work out removals ourselves by comparing days. |
| `last_verified` | Yes | OK | The UTC date of this fetch, `YYYY-MM-DD`. |

### 2.5 One row per title

- **Dubbed versions.** Today `דרדסים` and `דרדסים (מדובב)` are two rows for the same movie. Merge them into one row for the title (the subtitled and dubbed versions are the same title for us). If you'd like to keep the information, put it in your manifest or README notes, not in a second row.
- **Season suffixes.** Seasons of one series (`... \| עונה 3`, `... עונות 1-5`) become **one row per series**: strip the suffix from `title` and combine every season seen into `seasons_available`.
- **No episodes.** Never output episode-level rows (you already handle this).
- **Unique rows.** Within one provider's file, no two rows may share the same `imdb_id` + `type`.

---

## 3. IMDb ID (required)

`imdb_id` is the key the app uses to connect a provider row to its poster, synopsis, rating and genres, and to tell that "YES's Fauda" and "Partner's Fauda" are the same show. **Today it's missing on all 437 rows.** That's the biggest gap.

Please fill it in this order:

1. **From the provider.** First check whether YES or Partner expose an IMDb ID or link anywhere: title detail APIs, page metadata, JSON-LD (`sameAs`), or the IMDb rating widgets some VOD pages show. A provider-supplied ID is the most reliable source.
2. **Otherwise, from TMDB, with strict matching.** Get a free TMDB API key (read it from the `TMDB_API_KEY` environment variable). Then:
   - Search `GET /3/search/movie` or `/3/search/tv`, with the right one chosen by `type`. Query the English/original name with `language=en-US` and the Hebrew title with `language=he-IL`, and pass the year when known (`primary_release_year` / `first_air_date_year`).
   - **Accept a candidate only if all of these hold:**
     - Its title, original title or Hebrew title matches after normalization (case, punctuation, whitespace).
     - Its type matches.
     - Its year is within ±1 of `release_year`, when we know the year.
     - **It's the only candidate that passes.**
   - Then call `GET /3/{movie|tv}/{id}/external_ids` to get `imdb_id`, and fill `tmdb_id` too.
   - Cache the results locally between runs (a JSON file is fine), so the daily run doesn't search for the same title every day.
   - Stay within TMDB's rate limit (about 40 requests per second; staying well below that is fine) and retry on 429.
3. **If there's still no confident single match, leave `imdb_id` `null` and list the title under `unmatched_titles` in the manifest.** **Never guess.** A wrong ID is worse than no ID, because it shows users the wrong movie.

Add a `match_source` field to each row, with one of these values:

- `"provider"`: the ID came from the provider.
- `"tmdb_search"`: it came from the TMDB matching above.
- `null`: unmatched.

That way we can audit the matches.

**Rough baseline:** we tried a quick TMDB title search on the 2026-11-06 output. About 77% of distinct titles (YES 249/325, Partner 83/108) had an exact title match in TMDB's top 3 results. That's before year and uniqueness checks, so the real accepted rate will be lower. Better data from the provider (English names and years for Partner, removing dubbing and season suffixes) should raise it. **Target: at least 90% of rows with an `imdb_id` per provider.**

Your validator's strict mode already requires `imdb_id`. Keep it that way, and make sure the target above is visible in the manifest's `null_counts`.

---

## 4. Validation and safety

- Keep the "never replace good output with a failed fetch" behaviour, now per provider (see [2.1](#21-one-file-per-provider-plus-a-run-report)).
- **Add a sanity check:** if a provider's row count drops by more than 30% compared with the previous successful run, treat it as a failure and don't write that provider's file. A broken parser or a blocked request often looks like "the catalog got smaller". Our pipeline has the same check, but catching it early is better.
- `python -m playnext validate <file>` in strict mode must pass on every delivered file. Strict mode checks:
  - The fields from [2.4](#24-field-by-field-requirements) are present.
  - The provider codes come from [2.3](#23-provider-codes).
  - `imdb_id` matches `^tt\d{7,8}$` when it's not `null`.
  - The dates are valid.
  - `seasons_available` is `null` for movies.

  Rows with a `null` `imdb_id` are allowed in strict mode only if the provider is still within the 90% target.

---

## 5. Tests

Keep the offline test suite: no live requests in tests. Add tests for:

- Pagination and complete-coverage logic, using saved sample responses.
- Merging dubbed variants and season rows into one row per title.
- Provider codes.
- `availability_type` and `watch_url` extraction.
- TMDB matching with mocked TMDB responses: an exact match, a year mismatch, two candidates (must stay `null`), and a type mismatch.
- The per-provider failure behaviour and the 30% drop check.
- The manifest contents.

**Sample responses in tests must not contain cookies, tokens or personal data.**

---

## 6. Documentation

In `ingestion/collector/README.md`:

- Which endpoints each provider uses, how pagination works, and why the output counts as complete.
- How IMDb matching works, and the current match rate per provider.
- The latest run's numbers per provider: records, `null` counts per field, unmatched count.
- Anything the provider simply doesn't expose (for example, if a site never shows years).
- Your progress log.

---

## 7. Acceptance checklist (phase 1)

We'll sign off on YES and Partner TV when all of these are true for a fresh run:

- [ ] `origin/main` is merged in; everything lives under `ingestion/collector/`; nothing outside it changed.
- [ ] `python -m playnext fetch --output-dir out` writes `YES.jsonl`, `PARTNER_TV.jsonl` and `manifest.json`, and exits `0`.
- [ ] It works on Linux from a GitHub Actions runner (no 403s), in under 20 minutes.
- [ ] Both providers report `coverage: "complete"`, and the README explains why.
- [ ] Every row has `provider` (from the code list), `region`, `title` (no season or dubbing suffix), `type`, `availability_type`, `watch_url` and `last_verified`.
- [ ] At least 90% of rows per provider have `imdb_id` (and `tmdb_id`), and a sample of 20 random matches we check by hand are all correct.
- [ ] No duplicate `imdb_id` + `type` within a provider file; no episode rows.
- [ ] Strict `validate` passes on both files.
- [ ] All tests pass offline.
- [ ] The README is updated per [section 6](#6-documentation).

When you think it's ready, open a pull request from `provider-catalog-fetchers` into `main`. We'll run it, check the data, and give feedback on the PR.

---

## 8. Phase 2: other providers (after sign-off)

After phase 1 is accepted, add the other providers. They go through **the same format, rules and checklist** as above: one file per provider, full coverage, IMDb IDs, and so on. Planned codes:

| Provider | `provider` value |
|---|---|
| Netflix | `NETFLIX` |
| Disney+ | `DISNEY_PLUS` |
| Prime Video | `PRIME` |
| HOT | `HOT` |
| FreeTV | `FREETV` |

Before you start, confirm the order and the list with Shahar. Others (for example Apple TV+, Max, Cellcom TV) may be added. For the global services, find a source for the **Israeli** catalog specifically (`region: "IL"`), not the US one.

---

## Questions?

If something here can't be done (for example a site that doesn't expose years or title links at all), say so in the README and tell Shahar. Don't work around it by guessing values.

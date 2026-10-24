# PlayNext catalog fetching

This project collects lists of movies and TV shows from provider websites in
Israel, starting with YES and Partner TV. FreeTV remains a placeholder until its
catalog source is established. Our deliverable is one UTF-8 JSON Lines file,
`data/catalog.jsonl`, containing all providers in the format requested by the
main developer. Each row keeps its `provider` field. That developer handles the consuming application and metadata
enrichment such as posters, synopses, cast, ratings, and genres.

**Current status: automatic HTTP fetching for YES and Partner TV using
`requests`.** HAR files were used to identify the requests and test their
response formats. Normal fetching does not read or require HAR files.
No recurring job has been scheduled.

The application roadmap and downstream ingestion design are in
[`docs/MVP.md`](docs/MVP.md) and [`docs/INGESTION.md`](docs/INGESTION.md).
This Python package implements the provider collection side. The current
single-file export and nullable fields follow the fetching requirements agreed
for this work; the downstream design still describes a future complete daily
feed with required IMDb IDs. Connecting those two stages remains future work.

## What is implemented

- Automatic YES and Partner TV HTTP requests, using the supplied HAR captures
  to identify the source endpoints and response structures.
- Shared parsing, source-record deduplication, schema validation, and one merged
  JSONL output. Re-running a fetch refreshes the selected providers in that file.
- A YES HTTP 403 fix using browser-style headers and a Chrome-compatible
  `curl-cffi` fallback. The YES fetch path was verified live on 2026-10-24.
- Provider-supplied English/international names and conservative reuse of those
  names across providers after their records are combined. No translation API.
- Optional offline HAR import and an offline test suite covering fetching,
  failures, file replacement, parsing, validation, and name matching.
- A FreeTV adapter placeholder and a shared interface for adding providers.

## Latest local snapshot

The local `data/catalog.jsonl` observed on **2026-10-24** contains **417 records**:

| Provider | Records | Known types | Supplied English/international names | Release years |
| --- | ---: | --- | ---: | ---: |
| YES | 316 | 212 movies, 104 series | 316 | 212 |
| Partner TV | 101 | 17 movies, 29 series, 55 unknown | 2 | 0 |

Partner's two supplied English names are `CIA` and `Hacks`; its other 99
`original_title` values remain `null`. Twenty-three Partner records have explicit
numbered season information. All current IMDb/TMDB IDs, watch URLs, availability
types, and provider addition/removal dates are `null` because these sources do
not establish them. Counts describe this observed snapshot, not a guarantee
about future runs or the providers' full catalogs.

Generated catalogs and raw HAR captures stay local and are ignored by Git.
HARs can contain browsing/session data and token-bearing URLs. A fresh clone
can fetch a catalog without them; only the optional recorded-capture integration
test needs the original local HARs. The fictional example file is versioned.

## Intended flow

```text
Provider catalog source
    -> provider-specific collector
    -> common catalog records
    -> output validation
    -> data/catalog.jsonl (all providers)
    -> handoff to the main developer
```

Each collector handles its own provider's source format; pagination can be added
to the relevant collector if a source requires it.
The shared code handles the output format. Additional providers can be added
without changing that format.

## Output contract

Each line contains one title's availability at one provider in one region.
Use `movie` or `tv_series` for `type`; do not emit separate episode records.
Provider names are fixed as `YES`, `Partner TV`, and `FreeTV` for now.

| Field | Requirement | Meaning |
| --- | --- | --- |
| `provider` | Required | Canonical provider name |
| `region` | Required | Uppercase country code, initially `IL` |
| `title` | Required | Display title on the provider |
| `type` | Required | `movie` or `tv_series` |
| `imdb_id` | Required for delivery | IMDb identifier, for example `tt1234567` |
| `last_verified` | Required | Date the title was last observed in the provider listing, `YYYY-MM-DD` |
| `tmdb_id` | Strongly preferred | TMDB identifier, if available |
| `release_year` | Strongly preferred | Release year, if available |
| `original_title` | Optional | Provider-supplied original/English/international name, if available |
| `watch_url` | Optional | Direct title link, when known; not a provider homepage |
| `availability_type` | Optional | `subscription`, `rent`, `buy`, `free`, or `ads` |
| `seasons_available` | Optional | Available season numbers for a series |
| `added_date` | Optional | Actual provider addition date, when known |
| `removed_date` | Optional | Actual provider removal date, when known |

Unknown optional values remain `null`. Unknown season coverage is `null`,
rather than an empty list or an assumption that all seasons are available.
Do not collect poster images, synopses, cast, ratings, or genres for delivery.

The model permits missing IMDb IDs, types, and verification dates in **staging**
so a fetched title is not silently lost. The fetch/import commands explicitly
allow these incomplete records in the final JSONL, as requested. Strict CLI
validation and the low-level export function reject them by default; this
distinction prevents the current extract from being mistaken for an ID-complete
production feed.
The known provider responses lack IMDb/TMDB IDs. Automatic fetching leaves those
fields `null`, as requested, and does not perform metadata lookups or guess IDs.

`last_verified` records when the provider listing was fetched. `added_date` is not
the date our script first saw a title. A title missing from a partial listing
does not establish a removal date. `CatalogSnapshot.coverage` reserves a place
to record whether a provider run is complete or partial; change detection is
not implemented yet.

## Project layout

```text
src/playnext/
  models.py             Shared record schema and validation
  jsonl.py              Streaming reads and atomic JSONL writes
  parsers.py            Shared YES/Partner response parsing and deduplication
  names.py              Conservative reuse of supplied names across providers
  http.py               Requests transport, retries and timeouts
  har.py                Optional offline HAR import
  cli.py                Live fetching, HAR import and validation commands
  providers/
    base.py             Collector interface and snapshot coverage
    yes.py              YES HTTP fetcher
    partner.py          Partner TV HTTP fetcher
    freetv.py           FreeTV placeholder
examples/
  catalog.example.jsonl Fictional staging records, not collected data
tests/                  Offline contract and export tests
data/catalog.jsonl      The only generated output; give this to the main developer
```

## Run locally

Requires Python 3.11 or later. Installation includes `requests`, `urllib3`, and
`curl-cffi` for YES's browser-compatible fallback transport.

```powershell
python -m pip install -e .
playnext fetch
playnext providers
playnext validate examples/catalog.example.jsonl --allow-unmatched
```

The example contains deliberately fictional titles with missing IDs. Running
`playnext validate examples/catalog.example.jsonl` without `--allow-unmatched`
fails the delivery check, as intended. It is a format illustration, not evidence
of provider availability.

## Fetch current provider data

```powershell
# Fetch YES and Partner TV into one final data/catalog.jsonl file.
playnext fetch

# Fetch one provider, or choose another output directory.
playnext fetch --provider yes
playnext fetch --provider partner --output-dir data
```

`python -m playnext fetch` is equivalent after installation. Running the command
again fetches current responses automatically. Provider responses are combined
in memory and only `data/catalog.jsonl` is saved. There are no separate provider
exports or JSON reports. A short-lived temporary file makes replacement atomic
and is removed automatically.

Each run replaces the selected providers' rows with their current listings,
including new titles. A single-provider run retains the other providers already
in the final file. Exact duplicate rows are removed while the same title at
different providers remains as separate availability records. Missing fields
stay `null` and `last_verified` uses the current UTC fetch date for refreshed
rows. Retained providers keep their previous dates. The file always uses the
developer's 14 columns, with no additional metadata rows.

Requests identified in the supplied HAR files:

- YES: `GET https://www.yes.co.il/content/main/`, parsing embedded Nuxt JSON.
- Partner TV: `GET https://u.partner.co.il/umbraco/api/CmsApi/GetPageContentbyNode/?nodeAlias=n/tv-content&subNodeAlias=`, parsing CMS JSON.

The fetchers use relevant Accept, Origin and Referer headers without copying
cookies or tokens from the HAR. They use 10-second connection and 30-second read
timeouts, with up to three retries for transient failures such as HTTP 429/503.
YES sends browser-style navigation headers matching the successful capture. If
the standard request receives HTTP 403, it makes one additional request using
`curl-cffi` with a Chrome TLS/HTTP profile and matching browser headers. No
interactive browser, saved login, or HAR update is required. Partner continues
to use the standard requests transport. Run `python -m pip install -e .` after
updating the project to install the fallback dependency.
HTTP errors, malformed responses and responses without recognizable titles
leave the existing final catalog intact. Requests for other selected providers
still run, but the file is updated only if every selected provider succeeds.
The command exits nonzero if a provider fails or the final file cannot be merged.

These sources show website content selections; full VOD catalog coverage is not
proven. No pagination was observed in the supplied requests. Missing titles are
not assigned removal dates. `fetch --provider all` (the default) includes the
implemented fetchers; explicitly selecting FreeTV reports that it is not yet
implemented.

Tests replace HTTP transport with recorded or synthetic responses, so the test
suite makes no live requests.

## English/international names

The existing `original_title` column carries the available provider-supplied
English/international name; no extra English-name column is added.

YES supplies these labels in the CMS field `umbracoUrlName`, for example
`ילוסטון` / `Yellowstone`. The parser keeps the Hebrew display name in `title`
and puts the supplied label in `original_title`. These labels may be abbreviated
or transliterated and are not independently verified canonical titles. They are
read directly from the response, without translating Hebrew names or
reconstructing names from URL paths. Partner's known response has no equivalent
field, but English display names such as `Hacks | עונה 5` can supply `Hacks`
directly. Mixed Hebrew/English captions are not translated or partially rewritten.

After all provider rows are combined, a provider-independent matching pass can
fill missing `original_title` values from a name supplied by another provider.
It requires one of:

- A shared IMDb ID.
- A shared TMDB ID with the same known movie/series type.
- An exact normalized title plus the same known type and release year in the
  same region.

Title comparison only normalizes typography and explicit season suffixes;
country and dubbing qualifiers remain significant. Known conflicting IDs,
types, or years reject a match. Multiple conflicting identities or English
names also leave the value `null`. Already supplied names are preserved, and
newly inferred names do not become donors within that pass.

This makes no translation or metadata API calls and only copies a supplied name;
it does not copy another provider's availability, year, IDs, seasons, or dates.
Partner currently supplies no release years or external IDs, so Hebrew-title
overlap alone is insufficient: those missing English names remain `null` until
there is stronger identity evidence. The output remains the same 14 columns.

## Optional offline HAR import

```powershell
playnext extract-har --provider yes --input "sites har files/www.yes.co.il.har"
playnext extract-har --provider partner --input "sites har files/www.partner.co.il.har"
playnext validate data/catalog.jsonl --allow-incomplete
```

These optional commands read local response bodies and make no live requests.
They also update only `data/catalog.jsonl`, preserving rows for other providers.
The output has exactly the developer's 14 columns, with missing values set to
`null`. Repeated source records are removed; distinct native IDs and dubbed
variants are retained. Titles keep their displayed season suffixes and use
normalized whitespace.

YES supplies explicit movie/series types and movie production years. Partner
types are taken only from explicit movie/series categories or season labels;
other types stay `null`. Explicit numbered season labels become
`seasons_available` (for example, `עונה 5` gives `[5]`, while `עונות 1-5` gives
`[1, 2, 3, 4, 5]`). Other season coverage stays `null`.

`last_verified` uses the UTC date from the relevant HAR request's
`startedDateTime`. It records when the title was observed in the provider
listing. Re-extracting an old HAR preserves its original capture date; a missing
capture timestamp leaves the value `null`. Repeated observations use the latest
capture date without adding duplicate rows. Informational page/CMS URLs are not
treated as playback links. Neither HAR establishes a complete provider catalog.

## Validate the handoff file

```powershell
# Check the current extract, accepting missing fields from these sources.
python -m playnext validate data/catalog.jsonl --allow-incomplete

# Enforce the main developer's required IDs, types and verification dates.
python -m playnext validate data/catalog.jsonl
```

Every validation mode still checks JSON parsing and the field value formats.
`--allow-unmatched` permits only missing IMDb IDs; `--allow-incomplete` also
permits missing types and verification dates. Commands return exit code `0` on
success and nonzero on failure. The present 417-row snapshot passes incomplete
validation; strict validation fails because all IMDb IDs and 55 Partner types
are missing.

Give the main developer **`data/catalog.jsonl`**. It is UTF-8 with one JSON
object per line and the same 14 fields on each exported record. There is no
outer JSON array, separate provider export, persistent report, metadata lookup,
automatic upload, scheduled refresh, or historical diff file. The consuming
application can split rows by their `provider` value if needed.

## Run the tests

After installation:

```powershell
python -m unittest discover -s tests -v
```

The suite currently has 45 tests. With the two original local captures present,
all 45 run; otherwise the recorded-capture integration test is skipped and the
synthetic tests still run. HTTP transports are mocked. Tests cover the 14-field
contract, Unicode, Nuxt reference resolution, CMS categories, explicit seasons,
source deduplication, fetch dates, YES's 403 fallback, preservation of the final
file on failures, provider merges, and conservative name matching.

In a restricted Windows environment where the default temporary directory
causes permission errors, use a writable temporary directory:

```powershell
$env:TMP = Join-Path (Get-Location) 'data\.test-temp'
$env:TEMP = $env:TMP
New-Item -ItemType Directory -Force -Path $env:TMP | Out-Null
python -m unittest discover -s tests -v
```

## Add a provider

1. Establish its actual catalog request and response structure, including any
   pagination and coverage limits.
2. Add its canonical name to `Provider` in `models.py` if it is a new provider.
3. Implement a parser returning `ParsedCatalog`, preserving unknown values as
   `null` and using only explicit source evidence for IDs, years and seasons.
4. Implement a `RequestsProviderAdapter` with its endpoint, headers and parser,
   or a `ProviderAdapter` if it needs a different collection flow.
5. Register it in `providers/__init__.py` and add offline parser/HTTP tests.

Implemented adapters are included automatically by `fetch --provider all`.
Their records pass through the same merge, name-matching and atomic writer, so
no per-provider output files or translation steps are needed. FreeTV's existing
placeholder is the next adapter to fill in once its source is established.

## Later fetching work

1. Establish full catalog coverage and verify any new or changed endpoints.
2. Add further catalog sources and pagination where available, including FreeTV.
3. Establish a source for missing required IDs with the main developer.
4. Agree on refresh cadence and whether to deliver full snapshots or diffs.

The screenshots' discussion of scheduling and diffs informs future design;
neither a schedule nor a diff format has been selected or enabled.

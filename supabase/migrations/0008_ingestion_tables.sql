-- Post-M8 (ingestion step 2): the daily pipeline's own tables
-- (docs/INGESTION.md Section 5). 0001 left them out because the mock seed
-- writes title_cache/provider_availability directly.
--
-- Only the pipeline (service role, GitHub Actions) touches these: RLS is on
-- with no policies, and anon/authenticated get no grants.

-- ============================================================
-- ingestion_runs: one row per provider per run (audit log + baselines)
-- ============================================================
create table public.ingestion_runs (
  id               bigserial primary key,
  provider         text not null,
  region           text not null default 'IL',
  file_path        text,
  -- Our own clock: when the file reached our storage (never the feed's).
  received_at      timestamptz,
  -- From the collector's manifest: only a complete listing may mark titles removed.
  coverage         text check (coverage in ('complete', 'partial')),
  status           text not null default 'pending'
                   check (status in ('pending', 'processing', 'completed', 'failed', 'rejected_suspicious')),
  total_lines      integer,
  valid_lines      integer,
  invalid_lines    integer,
  -- Valid rows without an imdb_id: kept out of provider_availability (its key
  -- needs one) and counted here, not as invalid.
  unmatched_lines  integer,
  new_titles       integer,
  removed_titles   integer,
  unchanged_titles integer,
  -- Rejected lines (line number, reason, truncated raw) and any run error.
  error_summary    jsonb,
  started_at       timestamptz,
  finished_at      timestamptz,
  -- Lets staging rows reference (run, provider, region) together, so a staged
  -- row can never claim another provider than its run's.
  unique (id, provider, region)
);

-- The circuit breaker's baseline: a provider's recent completed runs of the
-- same coverage (a partial listing is never compared with complete ones).
create index idx_ingestion_runs_baseline
  on public.ingestion_runs (provider, region, coverage, finished_at desc)
  where status = 'completed';

-- ============================================================
-- staging_availability: one run's valid rows, before the upsert/anti-join
-- ============================================================
create table public.staging_availability (
  run_id            bigint not null,
  provider          text not null,
  region            text not null,
  imdb_id           text not null,
  type              text not null check (type in ('movie', 'tv_series')),
  -- The TMDB match (both or neither), as in provider_availability (0007).
  media_type        text check (media_type in ('movie', 'tv')),
  tmdb_id           integer,
  title             text not null,
  original_title    text,
  release_year      integer,
  availability_type text not null check (availability_type in ('subscription', 'rent', 'buy', 'free')),
  watch_url         text,
  seasons_available integer[],
  -- Required by the feed contract; every staged row passed validation.
  last_verified     date not null,
  check ((tmdb_id is null) = (media_type is null)),
  -- Mirrors provider_availability's key, so one run can't stage a title twice.
  primary key (run_id, provider, region, imdb_id, type),
  -- The run's own provider and region only: the anti-join compares staged
  -- rows with live ones by provider, so a mislabeled row could "remove" a
  -- whole catalog.
  foreign key (run_id, provider, region)
    references public.ingestion_runs (id, provider, region) on delete cascade
);

-- ============================================================
-- imdb_tmdb_map: imdb_id -> TMDB resolution cache, orphans included
-- ============================================================
create table public.imdb_tmdb_map (
  imdb_id           text primary key check (imdb_id ~ '^tt[0-9]{7,8}$'),
  media_type        text check (media_type in ('movie', 'tv')),
  tmdb_id           integer,
  resolution_status text not null check (resolution_status in ('resolved', 'unresolved', 'ambiguous')),
  last_attempted_at timestamptz not null default now(),
  attempt_count     integer not null default 1,
  -- A resolved id has a full TMDB key; anything else has none.
  check ((resolution_status = 'resolved') = (tmdb_id is not null and media_type is not null)),
  check ((tmdb_id is null) = (media_type is null)),
  foreign key (media_type, tmdb_id) references public.title_cache (media_type, tmdb_id)
);

-- Unresolved ids are retried only after ~30 days (docs/INGESTION.md Section 3).
create index idx_imdb_tmdb_map_retry
  on public.imdb_tmdb_map (last_attempted_at)
  where resolution_status <> 'resolved';

-- ============================================================
-- Access: service role only
-- ============================================================
alter table public.ingestion_runs enable row level security;
alter table public.staging_availability enable row level security;
alter table public.imdb_tmdb_map enable row level security;

grant all on public.ingestion_runs to service_role;
grant usage, select on sequence public.ingestion_runs_id_seq to service_role;
grant all on public.staging_availability to service_role;
grant all on public.imdb_tmdb_map to service_role;

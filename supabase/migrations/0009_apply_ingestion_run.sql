-- Post-M8 (ingestion step 4): the diff/reconciliation for one provider's run
-- (docs/INGESTION.md Section 4), as one Postgres function so it is atomic:
-- the upsert of the run's staged rows, the anti-join that marks missing
-- titles removed, and the run's own bookkeeping commit together or not at
-- all. The pipeline (service role) stages the rows first, then calls it.
--
-- A run that the circuit breaker rejected, or that failed before this call,
-- never reaches it, so it can't touch provider_availability.

-- ============================================================
-- ingestion_runs: the run's feed date, and titles that came back
-- ============================================================

-- The date the run's rows were verified for (the pipeline's "today", UTC):
-- last_seen_date is set to it, and the partial-run removal rule counts runs
-- by it. finished_at can fall on the next day.
alter table public.ingestion_runs add column run_date date;

-- Titles marked removed earlier and listed again ("came back"): counted
-- apart from new_titles (never seen before) and unchanged_titles.
alter table public.ingestion_runs add column returned_titles integer;

-- The database's clock, not the client's: the out-of-order guard and the
-- stale-run sweep compare runs started from different machines.
alter table public.ingestion_runs alter column started_at set default now();
-- Titles listed before and now whose offer, link, title, year, seasons or
-- TMDB key changed (unchanged_titles is the rest of the listed ones).
alter table public.ingestion_runs add column updated_titles integer;

-- The partial-run removal rule and the out-of-order guard look up a
-- provider's completed runs by date.
create index idx_ingestion_runs_dates
  on public.ingestion_runs (provider, region, run_date desc)
  where status = 'completed';

-- ============================================================
-- apply_ingestion_run: upsert + anti-join + bookkeeping, one transaction
-- ============================================================

-- p_listed_imdb_ids: titles listed today on lines that failed validation.
-- They're not staged (not storable), but they are listed, so they are never
-- removed for missing, and an active row's last_seen_date moves to today.
--
-- p_trust_missing: false when some invalid line had no readable imdb_id, so
-- any title could be behind it. A complete run then removes by the partial
-- rule instead of at once.
--
-- The partial rule (decided 2026-11-07): a title is removed once it is
-- missing from the provider's latest 7 completed run dates, this run's date
-- included (it completes in this call). Distinct dates, not runs, so manual
-- re-runs on one day can't age titles out early.
create function public.apply_ingestion_run(
  p_run_id bigint,
  p_listed_imdb_ids text[] default '{}',
  p_trust_missing boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  grace_dates constant integer := 7;
  v_run      public.ingestion_runs%rowtype;
  v_staged   integer;
  v_new      integer;
  v_returned integer;
  v_updated  integer;
  v_unchanged integer;
  v_removed  integer;
  v_kept     integer;
  v_cutoff   date;
  v_immediate boolean;
begin
  -- A null would make the removal tests below null (nothing removed, or
  -- everything kept): treat it as "none" and "don't trust".
  p_listed_imdb_ids := coalesce(p_listed_imdb_ids, '{}');
  p_trust_missing := coalesce(p_trust_missing, false);

  select * into v_run from public.ingestion_runs where id = p_run_id;
  if not found then
    raise exception 'ingestion run % not found', p_run_id;
  end if;

  -- One provider's runs apply one at a time (a manual re-run racing the
  -- scheduled one would otherwise diff against half-applied state).
  perform pg_advisory_xact_lock(
    hashtext('apply_ingestion_run:' || v_run.provider || ':' || v_run.region));

  select * into v_run from public.ingestion_runs where id = p_run_id for update;
  if v_run.status <> 'processing' then
    raise exception 'ingestion run % is %, not processing', p_run_id, v_run.status;
  end if;
  if v_run.run_date is null or v_run.coverage is null then
    raise exception 'ingestion run % has no run_date or coverage', p_run_id;
  end if;

  -- An older run applied after a newer one would diff against a newer
  -- catalog and wrongly remove titles listed since. Newer means a later
  -- run_date, or the same date and started later (a re-run that finished
  -- first wins over the run it replaced).
  if exists (
    select 1 from public.ingestion_runs r
    where r.provider = v_run.provider and r.region = v_run.region
      and r.status = 'completed' and r.id <> p_run_id
      and (r.run_date > v_run.run_date
        or (r.run_date = v_run.run_date
            and r.started_at > coalesce(v_run.started_at, '-infinity')))
  ) then
    raise exception 'ingestion run % (%) is older than a completed run of %',
      p_run_id, v_run.run_date, v_run.provider;
  end if;

  -- Lock the staged rows until commit: a client that gave up on this call
  -- must not be able to delete them halfway (the anti-join would then see an
  -- empty run and remove everything).
  perform 1 from public.staging_availability
  where run_id = p_run_id
  for share;

  -- Defence in depth behind the circuit breaker: an empty run would read as
  -- "everything was removed".
  select count(*) into v_staged
  from public.staging_availability where run_id = p_run_id;
  if v_staged = 0 then
    raise exception 'ingestion run % has no staged rows', p_run_id;
  end if;

  -- Classify the staged rows against the live table before changing it.
  select
    count(*) filter (where pa.id is null),
    count(*) filter (where pa.id is not null and pa.removed_at is not null),
    count(*) filter (where pa.id is not null and pa.removed_at is null and changed),
    count(*) filter (where pa.id is not null and pa.removed_at is null and not changed)
  into v_new, v_returned, v_updated, v_unchanged
  from public.staging_availability s
  left join public.provider_availability pa
    on pa.provider = s.provider and pa.region = s.region
   and pa.imdb_id = s.imdb_id and pa.type = s.type
  -- What the upsert below would change (a null key today keeps the old one).
  cross join lateral (
    select (pa.title, pa.original_title, pa.release_year, pa.availability_type,
            pa.watch_url, pa.seasons_available)
           is distinct from
           (s.title, s.original_title, s.release_year, s.availability_type,
            s.watch_url, s.seasons_available)
        or (s.tmdb_id is not null
            and (pa.media_type, pa.tmdb_id) is distinct from (s.media_type, s.tmdb_id))
      as changed
  ) diff
  where s.run_id = p_run_id;

  -- Upsert: new rows start on run_date; existing ones are refreshed, and a
  -- removed one comes back (removed_at cleared). first_seen_date is kept.
  insert into public.provider_availability as pa (
    provider, region, imdb_id, type, media_type, tmdb_id, title,
    original_title, release_year, availability_type, watch_url,
    seasons_available, first_seen_date, last_seen_date, removed_at,
    last_verified, source)
  select
    s.provider, s.region, s.imdb_id, s.type, s.media_type, s.tmdb_id, s.title,
    s.original_title, s.release_year, s.availability_type, s.watch_url,
    s.seasons_available, v_run.run_date, v_run.run_date, null,
    s.last_verified, 'feed'
  from public.staging_availability s
  where s.run_id = p_run_id
  on conflict (provider, region, imdb_id, type) do update set
    -- No key today (TMDB was down) never erases a key found before; both
    -- columns come from the same side (they are both-or-neither).
    media_type = case when excluded.tmdb_id is null then pa.media_type else excluded.media_type end,
    tmdb_id    = case when excluded.tmdb_id is null then pa.tmdb_id else excluded.tmdb_id end,
    title             = excluded.title,
    original_title    = excluded.original_title,
    release_year      = excluded.release_year,
    availability_type = excluded.availability_type,
    watch_url         = excluded.watch_url,
    seasons_available = excluded.seasons_available,
    last_seen_date    = greatest(pa.last_seen_date, excluded.last_seen_date),
    removed_at        = null,
    last_verified     = greatest(pa.last_verified, excluded.last_verified),
    source            = 'feed',
    updated_at        = now();

  -- Listed but invalid today: seen, so never removed for missing. Their
  -- data isn't refreshed (the line couldn't be read), and a removed one
  -- doesn't come back on an unreadable line.
  with seen as (
    update public.provider_availability pa
    set last_seen_date = greatest(pa.last_seen_date, v_run.run_date)
    where pa.provider = v_run.provider and pa.region = v_run.region
      and pa.removed_at is null
      and pa.imdb_id = any (p_listed_imdb_ids)
      and not exists (
        select 1 from public.staging_availability s
        where s.run_id = p_run_id and s.provider = pa.provider
          and s.region = pa.region and s.imdb_id = pa.imdb_id and s.type = pa.type)
    returning 1)
  select count(*) into v_kept from seen;

  -- Anti-join: which of the provider's live rows missing from this run are
  -- removed (docs/INGESTION.md Section 4 step 3). Rows of any source count,
  -- so the first complete run of a provider replaces its mock rows.
  v_immediate := v_run.coverage = 'complete' and p_trust_missing;
  if not v_immediate then
    -- Partial (or untrusted): rows last seen before the grace_dates-th
    -- latest completed run date, this run's included. Fewer dates than
    -- that: nothing is removed.
    select d into v_cutoff
    from (
      select r.run_date as d
      from public.ingestion_runs r
      where r.provider = v_run.provider and r.region = v_run.region
        and r.status = 'completed' and r.run_date is not null
      union
      select v_run.run_date
    ) dates
    order by d desc
    offset grace_dates - 1
    limit 1;
  end if;

  with gone as (
    update public.provider_availability pa
    set removed_at = now(), updated_at = now()
    where pa.provider = v_run.provider and pa.region = v_run.region
      and pa.removed_at is null
      -- Immediate: every missing row. Otherwise only past the cutoff (a
      -- null cutoff removes nothing).
      and (v_immediate or pa.last_seen_date < v_cutoff)
      and not (pa.imdb_id = any (p_listed_imdb_ids))
      and not exists (
        select 1 from public.staging_availability s
        where s.run_id = p_run_id and s.provider = pa.provider
          and s.region = pa.region and s.imdb_id = pa.imdb_id and s.type = pa.type)
    returning 1)
  select count(*) into v_removed from gone;

  update public.ingestion_runs set
    status           = 'completed',
    new_titles       = v_new,
    returned_titles  = v_returned,
    updated_titles   = v_updated,
    unchanged_titles = v_unchanged,
    removed_titles   = v_removed,
    -- The real time (now() is the transaction's start): baselines sort by it.
    finished_at      = clock_timestamp()
  where id = p_run_id;

  delete from public.staging_availability where run_id = p_run_id;

  return jsonb_build_object(
    'staged', v_staged,
    'new', v_new,
    'returned', v_returned,
    'updated', v_updated,
    'unchanged', v_unchanged,
    'removed', v_removed,
    'kept_invalid', v_kept,
    'immediate_removals', v_immediate,
    'removal_cutoff', v_cutoff);
end;
$$;

-- Service role only. Functions in public are executable by everyone by
-- default, so that is revoked explicitly.
revoke all on function public.apply_ingestion_run(bigint, text[], boolean)
  from public, anon, authenticated;
grant execute on function public.apply_ingestion_run(bigint, text[], boolean)
  to service_role;

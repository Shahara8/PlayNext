-- Post-M8 (ingestion step 1): titles are keyed on (media_type, tmdb_id), not
-- tmdb_id alone. TMDB ids are only unique per media type (movie 1396 and tv
-- 1396 are different titles), so once the real feed brings thousands of
-- titles a lone tmdb_id key would collide (docs/INGESTION.md Section 5).
--
-- Every table that points at title_cache gets a media_type column and a
-- composite foreign key. Existing rows are backfilled from title_cache, where
-- tmdb_id is still unique at this point.
--
-- Deploy order: apply this, then deploy the app code that writes media_type
-- (same commit). In between, old code's writes fail: watchlist/feedback
-- upserts (their conflict target no longer exists), and the old mock seed
-- (title_cache's tmdb_id conflict target is gone, and provider_availability
-- rows need media_type with tmdb_id). Reads keep working.

-- ============================================================
-- 1. Add and backfill media_type on the referencing tables
-- ============================================================

-- provider_availability: the media type of the TMDB match, set together with
-- tmdb_id by the resolver. Deliberately not derived from the feed's `type`:
-- the resolver can fall back to a movie hit for a row the feed calls a
-- series, and the foreign key must point at the title TMDB actually returned.
alter table public.provider_availability
  add column media_type text check (media_type in ('movie', 'tv'));

update public.provider_availability pa
set media_type = tc.media_type
from public.title_cache tc
where tc.tmdb_id = pa.tmdb_id;

-- Both or neither: a resolved row has a full key, an orphan has none.
alter table public.provider_availability
  add constraint provider_availability_tmdb_key_complete
  check ((tmdb_id is null) = (media_type is null));

alter table public.user_watchlist add column media_type text;
update public.user_watchlist w
set media_type = tc.media_type
from public.title_cache tc
where tc.tmdb_id = w.tmdb_id;
alter table public.user_watchlist
  alter column media_type set not null,
  add constraint user_watchlist_media_type_check check (media_type in ('movie', 'tv'));

alter table public.user_title_feedback add column media_type text;
-- 0006's touch trigger would set updated_at = now() on every row here, wiping
-- the timestamps recommendations use to pick each viewer's recent seeds.
alter table public.user_title_feedback disable trigger user_title_feedback_touch;
update public.user_title_feedback f
set media_type = tc.media_type
from public.title_cache tc
where tc.tmdb_id = f.tmdb_id;
alter table public.user_title_feedback enable trigger user_title_feedback_touch;
alter table public.user_title_feedback
  alter column media_type set not null,
  add constraint user_title_feedback_media_type_check check (media_type in ('movie', 'tv'));

-- ============================================================
-- 2. Freeze what old /title/<tmdb_id> links meant
-- ============================================================

-- Links shared before this migration name a tmdb_id only. Right now each id
-- is still one title, so record which, once; the app redirects old links via
-- this table, which never changes afterwards (a later same-id title or a
-- re-import can't move a cached 308). No FK: a title leaving title_cache just
-- makes its old link a not-found, as it was before.
create table public.legacy_title_ids (
  tmdb_id    integer primary key,
  media_type text not null check (media_type in ('movie', 'tv'))
);

insert into public.legacy_title_ids (tmdb_id, media_type)
select tmdb_id, media_type from public.title_cache;

alter table public.legacy_title_ids enable row level security;
create policy legacy_title_ids_select on public.legacy_title_ids
  for select to anon, authenticated using (true);
grant select on public.legacy_title_ids to anon, authenticated;
grant all on public.legacy_title_ids to service_role;

-- ============================================================
-- 3. Swap the keys: drop the tmdb_id-only FKs, re-key title_cache, re-add
-- ============================================================

alter table public.provider_availability drop constraint provider_availability_tmdb_id_fkey;
alter table public.user_watchlist drop constraint user_watchlist_tmdb_id_fkey;
alter table public.user_title_feedback drop constraint user_title_feedback_tmdb_id_fkey;

alter table public.title_cache drop constraint title_cache_pkey;
alter table public.title_cache add primary key (media_type, tmdb_id);

alter table public.user_watchlist drop constraint user_watchlist_pkey;
alter table public.user_watchlist add primary key (user_id, media_type, tmdb_id);

alter table public.user_title_feedback drop constraint user_title_feedback_pkey;
alter table public.user_title_feedback add primary key (user_id, media_type, tmdb_id);

-- MATCH SIMPLE (the default): an orphan row with both columns null is not checked.
alter table public.provider_availability
  add constraint provider_availability_title_fkey
  foreign key (media_type, tmdb_id) references public.title_cache (media_type, tmdb_id);

alter table public.user_watchlist
  add constraint user_watchlist_title_fkey
  foreign key (media_type, tmdb_id) references public.title_cache (media_type, tmdb_id)
  on delete cascade;

alter table public.user_title_feedback
  add constraint user_title_feedback_title_fkey
  foreign key (media_type, tmdb_id) references public.title_cache (media_type, tmdb_id)
  on delete cascade;

drop index public.idx_pa_tmdb;
create index idx_pa_title on public.provider_availability (media_type, tmdb_id);

-- ============================================================
-- 4. Views and functions join on the full key
-- ============================================================

-- Same columns as before (create or replace keeps the grants).
create or replace view public.v_catalog as
select
  pa.id                as availability_id,
  pa.provider,
  pa.region,
  pa.type,
  pa.availability_type,
  pa.watch_url,
  pa.seasons_available,
  pa.first_seen_date,
  pa.last_verified,
  tc.tmdb_id,
  tc.media_type,
  tc.imdb_id,
  tc.title,
  tc.original_title,
  tc.overview,
  tc.poster_path,
  tc.backdrop_path,
  tc.release_date,
  tc.genres,
  tc.vote_average,
  tc.popularity
from public.provider_availability pa
join public.title_cache tc
  on tc.media_type = pa.media_type and tc.tmdb_id = pa.tmdb_id
where pa.removed_at is null;

create or replace function public.search_titles(search_query text, result_limit integer default 20)
returns table (
  tmdb_id      integer,
  media_type   text,
  title        text,
  poster_path  text,
  release_date date,
  vote_average numeric,
  similarity   real,
  providers    jsonb
)
language sql
stable
as $$
  select
    tc.tmdb_id,
    tc.media_type,
    tc.title,
    tc.poster_path,
    tc.release_date,
    tc.vote_average,
    similarity(tc.title, search_query) as similarity,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'provider', pa.provider,
          'availability_type', pa.availability_type,
          'watch_url', pa.watch_url
        )
      ) filter (where pa.id is not null),
      '[]'::jsonb
    ) as providers
  from public.title_cache tc
  left join public.provider_availability pa
    on pa.media_type = tc.media_type and pa.tmdb_id = tc.tmdb_id
    and pa.removed_at is null
  where tc.title % search_query or tc.title ilike '%' || search_query || '%'
  group by tc.tmdb_id, tc.media_type, tc.title, tc.poster_path, tc.release_date, tc.vote_average
  order by similarity desc
  limit result_limit;
$$;

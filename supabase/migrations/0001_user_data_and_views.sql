-- PlayNext M1: ingestion tables (mock-seeded for now), app user tables, RLS,
-- v_catalog view, and search_titles(). See docs/MVP.md Section 9 (M1) and
-- docs/INGESTION.md Section 5 for the schema this was derived from.
--
-- imdb_tmdb_map / staging_availability / ingestion_runs are NOT created here —
-- the mock seed path upserts title_cache/provider_availability directly
-- (docs/MVP.md Section 7); those tables are only needed once the real daily
-- ingestion pipeline (docs/INGESTION.md, post-M8) is built.

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists pg_trgm;

-- ============================================================
-- Ingestion tables (docs/INGESTION.md Section 5)
-- ============================================================

create table public.title_cache (
  tmdb_id           integer primary key,
  media_type        text not null check (media_type in ('movie', 'tv')),
  imdb_id           text unique,
  title             text not null,
  original_title    text,
  overview          text,
  poster_path       text,
  backdrop_path     text,
  release_date      date,
  genres            jsonb,
  vote_average      numeric(3, 1),
  popularity        numeric,
  last_refreshed_at timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index idx_title_cache_imdb on public.title_cache (imdb_id);
create index idx_title_cache_title_trgm on public.title_cache using gin (title gin_trgm_ops);

create table public.provider_availability (
  id                bigserial primary key,
  provider          text not null,
  region            text not null,
  imdb_id           text not null,
  type              text not null check (type in ('movie', 'tv_series')),
  tmdb_id           integer references public.title_cache (tmdb_id),
  title             text not null,
  original_title    text,
  release_year      integer,
  availability_type text not null check (availability_type in ('subscription', 'rent', 'buy', 'free')),
  watch_url         text,
  seasons_available integer[],
  first_seen_date   date not null,
  last_seen_date    date not null,
  removed_at        timestamptz,
  last_verified     date,
  source            text not null default 'feed',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, region, imdb_id, type)
);

create index idx_pa_active on public.provider_availability (provider, region) where removed_at is null;
create index idx_pa_tmdb on public.provider_availability (tmdb_id);
create index idx_pa_recently_left on public.provider_availability (removed_at) where removed_at is not null;

-- ============================================================
-- App user tables (docs/MVP.md Section 2)
-- ============================================================

create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

create table public.user_watchlist (
  user_id    uuid not null references auth.users (id) on delete cascade,
  tmdb_id    integer not null references public.title_cache (tmdb_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);

create index idx_user_watchlist_user on public.user_watchlist (user_id);

create table public.user_title_feedback (
  user_id     uuid not null references auth.users (id) on delete cascade,
  tmdb_id     integer not null references public.title_cache (tmdb_id) on delete cascade,
  is_favorite boolean not null default false,
  sentiment   text check (sentiment in ('like', 'dislike')),
  rating      smallint check (rating between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, tmdb_id)
);

create index idx_user_title_feedback_user on public.user_title_feedback (user_id);
create index idx_user_title_feedback_favorite on public.user_title_feedback (user_id) where is_favorite;
create index idx_user_title_feedback_like on public.user_title_feedback (user_id) where sentiment = 'like';

-- ============================================================
-- Trigger: auto-create a profiles row on signup
-- ============================================================

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- RLS
-- ============================================================

alter table public.title_cache enable row level security;
alter table public.provider_availability enable row level security;
alter table public.profiles enable row level security;
alter table public.user_watchlist enable row level security;
alter table public.user_title_feedback enable row level security;

-- Catalog data: readable by anyone; writes only ever come from the service-role
-- key (ingestion/seed scripts), which bypasses RLS entirely, so no write policy exists.
create policy title_cache_select on public.title_cache
  for select to anon, authenticated using (true);

create policy provider_availability_select on public.provider_availability
  for select to anon, authenticated using (true);

-- profiles: a user can read/update only their own row (insert happens via the trigger above)
create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = user_id);

create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = user_id);

-- user_watchlist: full CRUD restricted to the owning user
create policy user_watchlist_select_own on public.user_watchlist
  for select to authenticated using (auth.uid() = user_id);

create policy user_watchlist_insert_own on public.user_watchlist
  for insert to authenticated with check (auth.uid() = user_id);

create policy user_watchlist_delete_own on public.user_watchlist
  for delete to authenticated using (auth.uid() = user_id);

-- user_title_feedback: full CRUD restricted to the owning user
create policy user_title_feedback_select_own on public.user_title_feedback
  for select to authenticated using (auth.uid() = user_id);

create policy user_title_feedback_insert_own on public.user_title_feedback
  for insert to authenticated with check (auth.uid() = user_id);

create policy user_title_feedback_update_own on public.user_title_feedback
  for update to authenticated using (auth.uid() = user_id);

create policy user_title_feedback_delete_own on public.user_title_feedback
  for delete to authenticated using (auth.uid() = user_id);

-- ============================================================
-- Explicit API exposure
-- The project has "automatically expose new tables" disabled, so PostgREST
-- roles need explicit grants per table rather than relying on project defaults.
-- ============================================================

grant usage on schema public to anon, authenticated;

grant select on public.title_cache to anon, authenticated;
grant select on public.provider_availability to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, delete on public.user_watchlist to authenticated;
grant select, insert, update, delete on public.user_title_feedback to authenticated;

-- ============================================================
-- v_catalog view: availability joined with metadata, live rows only
-- ============================================================

create view public.v_catalog as
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
join public.title_cache tc on tc.tmdb_id = pa.tmdb_id
where pa.removed_at is null;

grant select on public.v_catalog to anon, authenticated;

-- ============================================================
-- search_titles(): trigram title search + aggregated live providers
-- ============================================================

create function public.search_titles(search_query text, result_limit integer default 20)
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
    on pa.tmdb_id = tc.tmdb_id and pa.removed_at is null
  where tc.title % search_query or tc.title ilike '%' || search_query || '%'
  group by tc.tmdb_id, tc.media_type, tc.title, tc.poster_path, tc.release_date, tc.vote_average
  order by similarity desc
  limit result_limit;
$$;

grant execute on function public.search_titles(text, integer) to anon, authenticated;

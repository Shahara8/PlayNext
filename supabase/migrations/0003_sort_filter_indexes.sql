-- PlayNext M3: supporting indexes for the browse page's sort/filter combinations
-- (docs/MVP.md Section 9, M3). Dataset is tiny at mock-seed scale, but these are
-- the columns the real feed will sort/filter on at full catalog size.

-- Sort keys (docs/MVP.md Section 5): newest, trending, rating, alphabetical.
create index idx_title_cache_release_date on public.title_cache (release_date desc);
create index idx_title_cache_popularity on public.title_cache (popularity desc);
create index idx_title_cache_vote_average on public.title_cache (vote_average desc);
create index idx_title_cache_title on public.title_cache (title);

-- Genre filter: containment query against the genres jsonb array.
create index idx_title_cache_genres_gin on public.title_cache using gin (genres jsonb_path_ops);

-- type / availability_type filters, scoped to live rows only (mirrors idx_pa_active).
create index idx_pa_type on public.provider_availability (type) where removed_at is null;
create index idx_pa_availability_type on public.provider_availability (availability_type) where removed_at is null;

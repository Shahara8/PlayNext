-- PlayNext M6 follow-up: server-maintained timestamps on user_title_feedback.
-- Rows are written directly from the browser (docs/MVP.md Section 3), so
-- timestamps come from the database clock here, never from the client.
--
-- favorited_at: when the title was last favorited (null while not a favorite),
-- so My List's Favorites view can sort by that rather than updated_at, which
-- every rating/like change bumps.

alter table public.user_title_feedback add column favorited_at timestamptz;

update public.user_title_feedback set favorited_at = updated_at where is_favorite;

create function public.touch_user_title_feedback()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if not new.is_favorite then
    new.favorited_at := null;
  elsif tg_op = 'INSERT' or not old.is_favorite then
    new.favorited_at := now();
  else
    new.favorited_at := old.favorited_at;
  end if;
  return new;
end;
$$;

-- Fires for both halves of a PostgREST upsert (insert ... on conflict do update).
create trigger user_title_feedback_touch
  before insert or update on public.user_title_feedback
  for each row execute function public.touch_user_title_feedback();

drop index public.idx_user_title_feedback_favorite;
create index idx_user_title_feedback_favorite
  on public.user_title_feedback (user_id, favorited_at desc) where is_favorite;

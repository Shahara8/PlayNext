-- 0004 only backfills display_name on first insert into auth.users. Linking a
-- second provider to an already-existing account (e.g. signed up with
-- email/password, later used "Continue with Google") doesn't insert a new
-- auth.users row — Supabase merges the new provider's data into the existing
-- row's raw_user_meta_data instead, which only fires an UPDATE. This trigger
-- catches that case too, only filling in a still-empty display_name (never
-- overwrites one the user may set themselves later via a profile page).
create or replace function public.handle_user_metadata_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set display_name = coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'
  )
  where user_id = new.id
    and display_name is null
    and coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name') is not null;
  return new;
end;
$$;

create trigger on_auth_user_metadata_updated
  after update on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute function public.handle_user_metadata_updated();

-- Backfill: covers the account used to test the Google-after-email-signup
-- linking path above, and any other pre-existing account in the same state.
update public.profiles p
set display_name = coalesce(
  u.raw_user_meta_data ->> 'full_name',
  u.raw_user_meta_data ->> 'name'
)
from auth.users u
where u.id = p.user_id
  and p.display_name is null
  and coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') is not null;

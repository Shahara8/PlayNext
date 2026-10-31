-- Populate profiles.display_name from the identity provider's metadata when
-- available (Google sign-in sets raw_user_meta_data.full_name/name; a plain
-- email/password signup sets neither, so display_name stays NULL as before —
-- left for a future profile-settings page to fill in).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  );
  return new;
end;
$$;

-- Backfill accounts created before this migration (the trigger only runs on
-- insert, not retroactively).
update public.profiles p
set display_name = coalesce(
  u.raw_user_meta_data ->> 'full_name',
  u.raw_user_meta_data ->> 'name'
)
from auth.users u
where u.id = p.user_id
  and p.display_name is null
  and coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') is not null;

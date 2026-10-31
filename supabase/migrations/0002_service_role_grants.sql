-- service_role needs explicit GRANTs too, same reason as anon/authenticated in
-- 0001: "automatically expose new tables" is off project-wide, so there are no
-- default privileges on newly created tables for any PostgREST role — not even
-- service_role. BYPASSRLS (which service_role has) only skips row-level policy
-- checks; it does not imply table-level SELECT/INSERT/UPDATE/DELETE grants.

grant usage on schema public to service_role;

-- Full access: service_role is the only writer for the catalog tables
-- (seed script today, the real ingestion pipeline later).
grant all on public.title_cache to service_role;
grant all on public.provider_availability to service_role;
grant usage, select on sequence public.provider_availability_id_seq to service_role;

-- Read/admin access to the app tables for parity with anon/authenticated.
grant all on public.profiles to service_role;
grant all on public.user_watchlist to service_role;
grant all on public.user_title_feedback to service_role;

grant select on public.v_catalog to service_role;
grant execute on function public.search_titles(text, integer) to service_role;

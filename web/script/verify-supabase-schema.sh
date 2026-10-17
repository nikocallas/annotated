#!/usr/bin/env bash

set -euo pipefail

annotated_project_id="$(sed -n 's/^project_id = "\([^"]*\)"/\1/p' ../supabase/config.toml)"
annotated_db_container="supabase_db_${annotated_project_id}"

if [[ -z "${annotated_project_id}" ]] || ! docker inspect "${annotated_db_container}" >/dev/null 2>&1; then
  echo "Annotated local Supabase is not running. Run npm run supabase:start first." >&2
  exit 1
fi

docker exec -i "${annotated_db_container}" psql \
  --username postgres \
  --dbname postgres \
  --set ON_ERROR_STOP=1 <<'SQL'
do $verify$
declare
  app_tables text[];
  public_functions text[];
  private_functions text[];
begin
  select array_agg(c.relname order by c.relname)
  into app_tables
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r';

  if app_tables <> array[
    'annotations',
    'bookmarks',
    'claim_events',
    'claims',
    'comments',
    'follows',
    'media_uploads',
    'rate_limit_buckets',
    'users',
    'votes'
  ]::text[] then
    raise exception 'Unexpected public table set: %', app_tables;
  end if;

  if (
    select count(*)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relforcerowsecurity
  ) <> 10 then
    raise exception 'All ten public tables must have enabled and forced RLS';
  end if;

  if (select count(*) from pg_policies where schemaname = 'public') <> 21 then
    raise exception 'Expected exactly 21 public RLS policies';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
  ) then
    raise exception 'Browser-facing roles must not have direct public table grants';
  end if;

  select array_agg(p.proname order by p.proname)
  into public_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public';

  if public_functions <> array[
    'attach_media_upload',
    'consume_rate_limit',
    'current_app_user_id',
    'increment_annotation_view',
    'moderate_claim',
    'record_claim_received'
  ]::text[] then
    raise exception 'Unexpected public function set: %', public_functions;
  end if;

  select array_agg(p.proname order by p.proname)
  into private_functions
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private';

  if private_functions <> array['current_user_id', 'rls_auto_enable']::text[] then
    raise exception 'Unexpected private function set: %', private_functions;
  end if;

  if has_function_privilege('anon', 'public.current_app_user_id()', 'execute')
    or has_function_privilege('authenticated', 'public.current_app_user_id()', 'execute')
    or not has_function_privilege('service_role', 'public.current_app_user_id()', 'execute') then
    raise exception 'current_app_user_id execute grants violate the API-only boundary';
  end if;

  if not exists (
    select 1
    from pg_event_trigger
    where evtname = 'ensure_rls'
      and evtevent = 'ddl_command_end'
      and evtenabled = 'O'
  ) then
    raise exception 'The production-derived ensure_rls event trigger is missing';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and policyname in ('clip_media_public_read', 'commentary_audio_public_read')
  ) then
    raise exception 'Public media buckets must not expose object-listing policies';
  end if;

  if (
    select count(*)
    from storage.buckets
    where id in ('clip-media', 'commentary-audio')
      and public
  ) <> 2 then
    raise exception 'Both expected public media buckets must exist';
  end if;

  if exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'idx_users_auth_provider_id'
  ) then
    raise exception 'The duplicate auth-provider index must stay removed';
  end if;

  -- 0016 removes all launch-era seed rows; the public feed holds only real
  -- captures, so a clean replay must contain no seed users or annotations.
  if exists (select 1 from public.users where id like 'seed-user-%')
    or exists (select 1 from public.annotations where id like 'seed-%') then
    raise exception 'Seed content must not survive migration 0016';
  end if;
end
$verify$;

select 'Annotated Supabase schema invariants verified' as result;
SQL

-- Annotated — reconcile production-only security objects and current advisors
--
-- The hosted project received four early dashboard-authored hardening
-- migrations before the reviewed 0011 migration. Preserve their durable RLS
-- guard in source control, then remove privileges/indexes that the current
-- service-role-only product architecture does not need.
--
-- Rollback: recreate the two listing policies only if anonymous bucket listing
-- is deliberately required; grant current_app_user_id to browser roles only if
-- direct table access is restored; recreate idx_users_auth_provider_id only if
-- the UNIQUE constraint index is removed. Keep the private RLS guard unless the
-- production event trigger is intentionally retired.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.current_user_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.users
  where auth_id = auth.uid()::text
  limit 1
$$;

create or replace function private.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name is not null
      and cmd.schema_name in ('public')
      and cmd.schema_name not in ('pg_catalog', 'information_schema')
      and cmd.schema_name not like 'pg_toast%'
      and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)',
        cmd.object_identity,
        cmd.schema_name;
    end if;
  end loop;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_event_trigger
    where evtname = 'ensure_rls'
  ) then
    create event trigger ensure_rls
      on ddl_command_end
      when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      execute function private.rls_auto_enable();
  end if;
end
$$;

-- Public buckets remain readable through their /object/public URLs. Broad
-- SELECT policies are unnecessary and allow anonymous bucket listing.
drop policy if exists clip_media_public_read on storage.objects;
drop policy if exists commentary_audio_public_read on storage.objects;

-- Product tables are API-only and anon/authenticated table grants are already
-- revoked. Keep this helper available only to the service role so it cannot be
-- invoked as a public SECURITY DEFINER RPC.
revoke execute on function public.current_app_user_id() from anon, authenticated;
grant execute on function public.current_app_user_id() to service_role;

-- The table's UNIQUE constraint already owns an identical index.
drop index if exists public.idx_users_auth_provider_id;

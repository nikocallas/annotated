-- Annotated — database authorization and atomic counters
--
-- Rollback (emergency only): drop the policies/functions below and disable RLS
-- on the affected tables. Do not roll back after allowing untrusted direct
-- client traffic without first reviewing any writes made during the window.

create or replace function public.current_app_user_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.users
  where auth_id = (select auth.uid())::text
  limit 1
$$;

revoke all on function public.current_app_user_id() from public;
grant execute on function public.current_app_user_id() to anon, authenticated, service_role;

alter table public.users enable row level security;
alter table public.follows enable row level security;
alter table public.annotations enable row level security;
alter table public.comments enable row level security;
alter table public.claims enable row level security;
alter table public.bookmarks enable row level security;
alter table public.votes enable row level security;

alter table public.users force row level security;
alter table public.follows force row level security;
alter table public.annotations force row level security;
alter table public.comments force row level security;
alter table public.claims force row level security;
alter table public.bookmarks force row level security;
alter table public.votes force row level security;

-- Re-applying the migration should converge on exactly these policies.
drop policy if exists users_public_read on public.users;
drop policy if exists users_update_self on public.users;
drop policy if exists follows_public_read on public.follows;
drop policy if exists follows_insert_self on public.follows;
drop policy if exists follows_delete_self on public.follows;
drop policy if exists annotations_public_or_owner_read on public.annotations;
drop policy if exists annotations_insert_self on public.annotations;
drop policy if exists annotations_update_self on public.annotations;
drop policy if exists annotations_delete_self on public.annotations;
drop policy if exists comments_public_read on public.comments;
drop policy if exists comments_insert_self on public.comments;
drop policy if exists comments_update_self on public.comments;
drop policy if exists comments_delete_self on public.comments;
drop policy if exists bookmarks_read_self on public.bookmarks;
drop policy if exists bookmarks_insert_self on public.bookmarks;
drop policy if exists bookmarks_delete_self on public.bookmarks;
drop policy if exists votes_public_read on public.votes;
drop policy if exists votes_insert_self on public.votes;
drop policy if exists votes_update_self on public.votes;
drop policy if exists votes_delete_self on public.votes;

create policy users_public_read on public.users
  for select to anon, authenticated
  using (true);

create policy users_update_self on public.users
  for update to authenticated
  using (id = (select public.current_app_user_id()))
  with check (id = (select public.current_app_user_id()));

create policy follows_public_read on public.follows
  for select to anon, authenticated
  using (true);

create policy follows_insert_self on public.follows
  for insert to authenticated
  with check (follower_id = (select public.current_app_user_id()));

create policy follows_delete_self on public.follows
  for delete to authenticated
  using (follower_id = (select public.current_app_user_id()));

create policy annotations_public_or_owner_read on public.annotations
  for select to anon, authenticated
  using (
    is_public = 1
    or user_id = (select public.current_app_user_id())
  );

create policy annotations_insert_self on public.annotations
  for insert to authenticated
  with check (user_id = (select public.current_app_user_id()));

create policy annotations_update_self on public.annotations
  for update to authenticated
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

create policy annotations_delete_self on public.annotations
  for delete to authenticated
  using (user_id = (select public.current_app_user_id()));

create policy comments_public_read on public.comments
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.annotations
      where annotations.id = comments.annotation_id
      and (
        annotations.is_public = 1
        or annotations.user_id = (select public.current_app_user_id())
      )
    )
  );

create policy comments_insert_self on public.comments
  for insert to authenticated
  with check (user_id = (select public.current_app_user_id()));

create policy comments_update_self on public.comments
  for update to authenticated
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

create policy comments_delete_self on public.comments
  for delete to authenticated
  using (user_id = (select public.current_app_user_id()));

create policy bookmarks_read_self on public.bookmarks
  for select to authenticated
  using (user_id = (select public.current_app_user_id()));

create policy bookmarks_insert_self on public.bookmarks
  for insert to authenticated
  with check (user_id = (select public.current_app_user_id()));

create policy bookmarks_delete_self on public.bookmarks
  for delete to authenticated
  using (user_id = (select public.current_app_user_id()));

create policy votes_public_read on public.votes
  for select to anon, authenticated
  using (true);

create policy votes_insert_self on public.votes
  for insert to authenticated
  with check (user_id = (select public.current_app_user_id()));

create policy votes_update_self on public.votes
  for update to authenticated
  using (user_id = (select public.current_app_user_id()))
  with check (user_id = (select public.current_app_user_id()));

create policy votes_delete_self on public.votes
  for delete to authenticated
  using (user_id = (select public.current_app_user_id()));

-- Claims intentionally have no anon/authenticated policies. The narrowly
-- validated API route writes them with the server-only service role.

-- The web app and extension use Supabase only as the OAuth broker; product
-- data is served through the validated API. Keep the policies as defense in
-- depth, but do not grant direct table privileges that could bypass API rate
-- limits, media inspection, or validation.
revoke all on public.users, public.follows, public.annotations, public.comments,
  public.claims, public.bookmarks, public.votes from anon, authenticated;

-- Every foreign key and policy lookup gets an index. Existing indexes use
-- IF NOT EXISTS, so this is safe against the current migration history.
create index if not exists idx_users_auth_id on public.users(auth_id);
create unique index if not exists idx_users_auth_provider_id on public.users(auth_provider, auth_id);
create index if not exists idx_comments_user on public.comments(user_id);
create index if not exists idx_annotations_public_user on public.annotations(is_public, user_id);

create or replace function public.increment_annotation_view(target_annotation_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_count integer;
begin
  update public.annotations
  set view_count = view_count + 1
  where id = target_annotation_id
    and is_public = 1
  returning view_count into next_count;

  return coalesce(next_count, 0);
end;
$$;

revoke all on function public.increment_annotation_view(text) from public, anon, authenticated;
grant execute on function public.increment_annotation_view(text) to service_role;

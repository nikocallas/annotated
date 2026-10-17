-- Annotated — annotation types, annotation requests, and page screenshots
--
-- Additive only. Implements the round-one judging feedback from This Week in
-- Startups E2338 (docs/judging-notes-twist-e2338.md):
--   * Annotation types (dispute, fact check, context, hot take, steelman,
--     receipts, explainer) so every post declares what kind of take it is.
--   * Annotation requests ("bounty on a story"): ask the community, or one
--     specific person, to annotate or fact-check a URL.
--   * Page screenshots captured by the extension at publish time, so source
--     cards show what the page looked like and deleted X posts stay preserved.

begin;

-- 1. Annotation type -------------------------------------------------------

alter table public.annotations
  add column if not exists annotation_type text;

alter table public.annotations
  drop constraint if exists annotations_annotation_type_check;
alter table public.annotations
  add constraint annotations_annotation_type_check
  check (
    annotation_type is null
    or annotation_type in (
      'dispute', 'fact-check', 'context', 'hot-take', 'steelman', 'receipts', 'explainer'
    )
  );

create index if not exists idx_annotations_type_created
  on public.annotations(annotation_type, created_at desc)
  where is_public = 1;

-- Lets the side panel show "N annotations on this page" for the open tab.
create index if not exists idx_annotations_source_url
  on public.annotations(source_url);

-- 2. Page screenshots ------------------------------------------------------

alter table public.media_uploads
  drop constraint if exists media_uploads_kind_check;
alter table public.media_uploads
  add constraint media_uploads_kind_check
  check (kind in ('clip-video', 'clip-audio', 'commentary-audio', 'page-screenshot'));

-- Same atomic, single-use attachment contract as 0014, extended so a verified
-- screenshot becomes the annotation's thumbnail. A screenshot never publishes
-- a post by itself; it only decorates one the owner already created.
create or replace function public.attach_media_upload(
  p_user_id text,
  p_upload_id text,
  p_annotation_id text
)
returns public.media_uploads
language plpgsql
security definer
set search_path = ''
as $$
declare
  incoming public.media_uploads%rowtype;
  annotation_source_type text;
begin
  select source_type
  into annotation_source_type
  from public.annotations
  where id = p_annotation_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'annotation not found or not owned';
  end if;

  select *
  into incoming
  from public.media_uploads
  where id = p_upload_id and user_id = p_user_id
  for update;

  if not found then
    raise exception 'verified media upload not found';
  end if;
  if incoming.status = 'attached' and incoming.annotation_id is distinct from p_annotation_id then
    raise exception 'media upload is already attached to another annotation';
  end if;
  if incoming.status not in ('ready', 'attached') or incoming.public_url is null then
    raise exception 'media upload is not ready to attach';
  end if;
  if incoming.kind = 'clip-video' and annotation_source_type <> 'youtube' then
    raise exception 'clip-video requires a youtube annotation';
  end if;
  if incoming.kind = 'clip-audio' and annotation_source_type <> 'podcast' then
    raise exception 'clip-audio requires a podcast annotation';
  end if;

  update public.media_uploads
  set annotation_id = null, status = 'orphaned'
  where annotation_id = p_annotation_id
    and kind = incoming.kind
    and id <> incoming.id;

  update public.media_uploads
  set annotation_id = p_annotation_id, status = 'attached'
  where id = incoming.id
  returning * into incoming;

  if incoming.kind in ('clip-video', 'clip-audio') then
    update public.annotations
    set clip_media_url = incoming.public_url,
        clip_status = 'ready',
        is_public = 1
    where id = p_annotation_id and user_id = p_user_id;
  elsif incoming.kind = 'page-screenshot' then
    update public.annotations
    set clip_thumbnail_url = incoming.public_url
    where id = p_annotation_id and user_id = p_user_id;
  else
    update public.annotations
    set commentary_audio_url = incoming.public_url
    where id = p_annotation_id and user_id = p_user_id;
  end if;

  return incoming;
end;
$$;

revoke all on function public.attach_media_upload(text, text, text) from public, anon, authenticated;
grant execute on function public.attach_media_upload(text, text, text) to service_role;

-- 3. Annotation requests ---------------------------------------------------

create table if not exists public.annotation_requests (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  source_url text not null,
  source_title text,
  note text,
  requested_user_id text references public.users(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'fulfilled', 'closed')),
  fulfilled_annotation_id text references public.annotations(id) on delete set null,
  created_at bigint not null,
  fulfilled_at bigint
);

create index if not exists idx_annotation_requests_status_created
  on public.annotation_requests(status, created_at desc);
create index if not exists idx_annotation_requests_source_url
  on public.annotation_requests(source_url);
create index if not exists idx_annotation_requests_user
  on public.annotation_requests(user_id);
create index if not exists idx_annotation_requests_requested_user
  on public.annotation_requests(requested_user_id);
create index if not exists idx_annotation_requests_fulfilled_annotation
  on public.annotation_requests(fulfilled_annotation_id);

alter table public.annotation_requests enable row level security;
alter table public.annotation_requests force row level security;

-- Product data is API-only: the server uses the service role, and browser
-- roles get no direct table privilege.
revoke all on public.annotation_requests from public, anon, authenticated;

commit;

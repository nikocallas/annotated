-- Annotated — direct-upload media buckets
-- Media is uploaded with short-lived signed upload URLs created by the API.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clip-media',
  'clip-media',
  true,
  20971520,
  array['video/webm', 'audio/webm', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'commentary-audio',
  'commentary-audio',
  true,
  2097152,
  array['audio/webm']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists commentary_audio_public_read on storage.objects;
create policy commentary_audio_public_read on storage.objects
  for select using (bucket_id = 'commentary-audio');

create table if not exists public.media_uploads (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  annotation_id text references public.annotations(id) on delete set null,
  kind text not null check (kind in ('clip-video', 'clip-audio', 'commentary-audio')),
  bucket text not null check (bucket in ('clip-media', 'commentary-audio')),
  object_path text not null unique,
  mime text not null,
  status text not null default 'pending' check (status in ('pending', 'ready', 'attached', 'failed', 'orphaned')),
  bytes integer,
  duration_seconds double precision,
  width integer,
  height integer,
  has_video boolean,
  has_audio boolean,
  public_url text,
  created_at bigint not null
);

create index if not exists idx_media_uploads_user on public.media_uploads(user_id);
create index if not exists idx_media_uploads_annotation on public.media_uploads(annotation_id);
create index if not exists idx_media_uploads_status_created on public.media_uploads(status, created_at);

alter table public.media_uploads enable row level security;
alter table public.media_uploads force row level security;

drop policy if exists media_uploads_read_self on public.media_uploads;
create policy media_uploads_read_self on public.media_uploads
  for select to authenticated
  using (user_id = (select public.current_app_user_id()));

-- Product data is API-only. Keep the owner policy as defense in depth, but
-- grant no direct PostgREST table privilege to either browser-facing role.
revoke all on public.media_uploads from public, anon, authenticated;

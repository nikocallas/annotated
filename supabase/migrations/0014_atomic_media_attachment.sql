-- Annotated — atomic, single-use media attachment
--
-- Serialize attachment by annotation, prevent one verified upload from moving
-- between posts, and update the annotation's published URL in the same short
-- transaction that selects the winning media row.

create unique index if not exists idx_media_uploads_one_attached_kind
  on public.media_uploads(annotation_id, kind)
  where annotation_id is not null and status = 'attached';

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
  -- Every caller acquires locks in annotation → upload order. Calls targeting
  -- the same annotation therefore serialize before choosing a winner.
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

  -- Superseded objects remain available until post-commit cleanup. If object
  -- deletion is temporarily unavailable, the orphan row lets maintenance
  -- retry without risking the annotation's newly committed URL.
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

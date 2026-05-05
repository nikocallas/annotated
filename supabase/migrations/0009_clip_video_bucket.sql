-- annotated — clip media Supabase Storage bucket
--
-- The Express API uploads short, fair-use clips (≤90 s, ≤480p, target 240p)
-- captured by the Chrome extension to this bucket and writes the resulting
-- public URL onto annotations.clip_media_url. Server-side uploads use the
-- service-role key (env: SUPABASE_SERVICE_ROLE_KEY); the anon key never has
-- write access here. Reads are public so the feed/detail pages can render
-- the clip via a native <video src=…> tag.
--
-- Apply via Supabase MCP `apply_migration` or the SQL editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clip-media',
  'clip-media',
  true,
  20971520, -- 20 MB; bounded by 90 s × ~1.6 Mbps WebM/MP4 cap
  array['video/mp4', 'video/webm', 'audio/mp4', 'audio/webm', 'audio/mpeg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read; authenticated/service-role write only. The Express API attaches
-- the service role key on the server, so RLS on storage.objects only needs to
-- allow public read.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'clip_media_public_read'
  ) then
    create policy clip_media_public_read on storage.objects
      for select using (bucket_id = 'clip-media');
  end if;
end$$;

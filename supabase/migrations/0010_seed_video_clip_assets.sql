-- annotated — current seeded video posts should render as clipped MP4 assets
--
-- Earlier seed rows predated the clip upload pipeline, so they had selected
-- timestamps but no clip_media_url. Point seeded video posts at the bundled
-- clipped MP4 so /feed renders a native <video> instead of a source-link
-- facade.

update public.annotations
set
  clip_media_url = '/media/annotated-demo.mp4',
  clip_thumbnail_url = '/media/annotated-demo-poster.jpg',
  clip_status = 'ready'
where id like 'seed-ann-%'
and source_type = 'youtube'
and clip_media_url is null;

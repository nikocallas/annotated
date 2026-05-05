-- annotated — clip_thumbnail_url for the feed clip facade
--
-- Feed/detail never embeds the full source video. When the clip-processing
-- pipeline has produced a clipped MP4 we store it in clip_media_url and a
-- 240p poster/thumbnail in clip_thumbnail_url. The UI prefers the clip
-- thumbnail over the YouTube hqdefault for poster rendering so thumbnails
-- always represent the selected fair-use slice, not the whole video.

alter table public.annotations
  add column if not exists clip_thumbnail_url text;

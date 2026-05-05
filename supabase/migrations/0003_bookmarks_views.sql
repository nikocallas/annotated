-- annotated — bookmarks + per-annotation view counts
--
-- Adds a per-user bookmarks table and a view_count column on annotations so
-- the feed can surface "Most viewed clip" and a Bookmarks view.

alter table public.annotations
  add column if not exists view_count integer not null default 0;

create index if not exists idx_annotations_view_count
  on public.annotations(view_count desc);

create table if not exists public.bookmarks (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  annotation_id text not null references public.annotations(id) on delete cascade,
  created_at bigint not null,
  unique (user_id, annotation_id)
);

create index if not exists idx_bookmarks_user on public.bookmarks(user_id);
create index if not exists idx_bookmarks_annotation on public.bookmarks(annotation_id);

alter table public.bookmarks disable row level security;

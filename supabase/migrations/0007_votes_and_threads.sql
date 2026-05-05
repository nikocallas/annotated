-- annotated — votes + threaded comments
--
-- Adds:
--   * public.votes        — per-user upvote/downvote on each annotation, with
--                           a uniqueness constraint that prevents the same
--                           signed-in user from being counted twice.
--   * comments.parent_id  — threaded reply support; nullable, self-referential
--                           foreign key. Top-level comments stay parent_id NULL.

-- VOTES — one row per (user, annotation). value is +1 or -1; switching is
-- implemented by the API as an upsert/update.
create table if not exists public.votes (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  annotation_id text not null references public.annotations(id) on delete cascade,
  value integer not null check (value in (-1, 1)),
  created_at bigint not null,
  unique (user_id, annotation_id)
);

create index if not exists idx_votes_annotation on public.votes(annotation_id);
create index if not exists idx_votes_user on public.votes(user_id);

alter table public.votes disable row level security;

-- COMMENTS.parent_id — nullable self FK so replies cascade with their parent
-- when the parent is deleted. Top-level comments have parent_id NULL.
alter table public.comments
  add column if not exists parent_id text references public.comments(id) on delete cascade;

create index if not exists idx_comments_parent on public.comments(parent_id);

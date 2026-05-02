-- annotated — initial Supabase schema
-- Run on the Supabase project that backs the Vercel deployment.
-- All persistence (users, follows, annotations, comments, claims) lives here.
--
-- Apply via Supabase MCP (`apply_migration`) or the SQL editor.

-- USERS — auth provider is x or google only (no email/password)
create table if not exists public.users (
  id text primary key,
  username text not null unique,
  display_name text not null,
  avatar_url text,
  bio text,
  auth_provider text not null check (auth_provider in ('x', 'google')),
  auth_id text not null,
  created_at bigint not null,
  unique (auth_provider, auth_id)
);

-- FOLLOWS — directional follower → following edges
create table if not exists public.follows (
  id text primary key,
  follower_id text not null references public.users(id) on delete cascade,
  following_id text not null references public.users(id) on delete cascade,
  created_at bigint not null,
  constraint follows_no_self_follow check (follower_id <> following_id),
  unique (follower_id, following_id)
);

create index if not exists idx_follows_following on public.follows(following_id);
create index if not exists idx_follows_follower on public.follows(follower_id);

-- ANNOTATIONS — clipped moments + commentary
create table if not exists public.annotations (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  source_url text not null,
  source_type text not null check (source_type in ('youtube', 'article', 'podcast')),
  source_title text,
  source_author text,
  source_image text,
  source_publication text,
  -- Clip
  clip_start_sec integer,
  clip_end_sec integer,
  clip_text text,
  clip_media_url text,
  clip_status text not null default 'ready' check (clip_status in ('processing','ready','failed')),
  -- Commentary
  commentary_text text,
  commentary_audio_url text,
  -- Meta
  is_public integer not null default 1,
  created_at bigint not null,
  -- Server-enforced 90s clip cap (mirrors Zod schema)
  constraint annotations_clip_max_90s check (
    clip_start_sec is null
    or clip_end_sec is null
    or (clip_end_sec - clip_start_sec between 1 and 90)
  )
);

create index if not exists idx_annotations_user on public.annotations(user_id);
create index if not exists idx_annotations_created on public.annotations(created_at desc);
create index if not exists idx_annotations_public_created on public.annotations(is_public, created_at desc);

-- COMMENTS — replies on annotations
create table if not exists public.comments (
  id text primary key,
  annotation_id text not null references public.annotations(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at bigint not null
);

create index if not exists idx_comments_annotation on public.comments(annotation_id);

-- CLAIMS — fair-use disputes filed against annotations
create table if not exists public.claims (
  id text primary key,
  annotation_id text not null references public.annotations(id) on delete cascade,
  claimant_name text not null,
  claimant_email text not null,
  reason text not null check (char_length(reason) between 10 and 4000),
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','rejected')),
  created_at bigint not null
);

create index if not exists idx_claims_annotation on public.claims(annotation_id);
create index if not exists idx_claims_status on public.claims(status);

-- Row Level Security
-- The Express API uses the publishable / anon key with app-level authorization.
-- We disable RLS so the API can read/write freely; tighten this if you switch
-- the API to use the service-role key or to scope by Supabase Auth.
alter table public.users disable row level security;
alter table public.follows disable row level security;
alter table public.annotations disable row level security;
alter table public.comments disable row level security;
alter table public.claims disable row level security;

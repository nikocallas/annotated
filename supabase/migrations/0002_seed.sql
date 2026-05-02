-- annotated — demo seed data
-- Idempotent: re-running will not duplicate rows. Apply once via SQL editor or
-- `apply_migration`. The Express API will also seed automatically on first run
-- if the users table is empty (see web/server/seed.ts).

insert into public.users (id, username, display_name, avatar_url, bio, auth_provider, auth_id, created_at) values
  ('seed-user-jcal',  'jcal',  'Jason Calacanis', 'https://api.dicebear.com/9.x/initials/svg?seed=Jason%20Calacanis&backgroundColor=01696F',
    'Angel investor. Host of This Week in Startups. Always looking for the next great founder.', 'x', 'demo-x-jcal', extract(epoch from now())::bigint),
  ('seed-user-molly', 'molly', 'Molly Wood',      'https://api.dicebear.com/9.x/initials/svg?seed=Molly%20Wood&backgroundColor=A84B2F',
    'Climate tech reporter. Editor-at-large at Everybody in the Pool.', 'google', 'demo-g-molly', extract(epoch from now())::bigint),
  ('seed-user-kai',   'kai',   'Kai Stephens',    'https://api.dicebear.com/9.x/initials/svg?seed=Kai%20Stephens&backgroundColor=20808D',
    'Engineer. I clip the things I want to remember.', 'x', 'demo-x-kai', extract(epoch from now())::bigint),
  ('seed-user-rin',   'rin',   'Rin Okonkwo',     'https://api.dicebear.com/9.x/initials/svg?seed=Rin%20Okonkwo&backgroundColor=944454',
    'Producer. Audio nerd. Deep into the slow takes.', 'google', 'demo-g-rin', extract(epoch from now())::bigint)
on conflict (username) do nothing;

insert into public.follows (id, follower_id, following_id, created_at) values
  ('seed-follow-1', 'seed-user-kai',   'seed-user-jcal',  extract(epoch from now())::bigint),
  ('seed-follow-2', 'seed-user-kai',   'seed-user-molly', extract(epoch from now())::bigint),
  ('seed-follow-3', 'seed-user-rin',   'seed-user-jcal',  extract(epoch from now())::bigint),
  ('seed-follow-4', 'seed-user-jcal',  'seed-user-molly', extract(epoch from now())::bigint),
  ('seed-follow-5', 'seed-user-molly', 'seed-user-rin',   extract(epoch from now())::bigint)
on conflict (follower_id, following_id) do nothing;

insert into public.annotations (
  id, user_id, source_url, source_type, source_title, source_author, source_image, source_publication,
  clip_start_sec, clip_end_sec, clip_text, clip_status, commentary_text, is_public, created_at
) values
  ('seed-ann-1', 'seed-user-jcal',  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',                'youtube',
    'How great founders think about distribution', 'This Week in Startups', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', 'YouTube',
    124, 187, null, 'ready',
    'This is the part I keep coming back to. The mistake first-time founders make is treating distribution as something you bolt on after the product. The best founders work backward from distribution.',
    1, extract(epoch from now())::bigint),
  ('seed-ann-2', 'seed-user-molly', 'https://www.nytimes.com/example/climate-tech-funding',       'article',
    'Climate tech funding rebounds in Q3 after a brutal year', 'Maria Cortez', null, 'The New York Times',
    null, null,
    'Despite a 38% drop in 2023, early-stage climate investing has quietly reaccelerated, with battery storage and grid software absorbing the lion''s share of new capital. The shift signals investors are less interested in moonshots and more in proven decarbonization plays.',
    'ready',
    'The pivot from moonshots to grid software is real. Talked to three Tier-1 partners last week — they''re all looking at the same five storage companies.',
    1, extract(epoch from now())::bigint),
  ('seed-ann-3', 'seed-user-kai',   'https://overcast.fm/+example-podcast-episode',               'podcast',
    'Lenny''s Podcast — How Notion built their growth engine', 'Lenny Rachitsky', null, 'Lenny''s Podcast',
    1820, 1890, null, 'ready',
    'Notion''s template gallery is a masterclass in user-generated content as growth. Worth queuing this 70-second clip up for the team on Monday.',
    1, extract(epoch from now())::bigint),
  ('seed-ann-4', 'seed-user-rin',   'https://www.youtube.com/watch?v=jNQXAC9IVRw',                'youtube',
    'The architecture of attention — a lecture', 'Stanford HAI', 'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg', 'YouTube',
    42, 121, null, 'ready',
    'She lands the point at the 1:30 mark — attention isn''t scarce because of the supply of content, it''s scarce because of the cost of switching contexts.',
    1, extract(epoch from now())::bigint),
  ('seed-ann-5', 'seed-user-jcal',  'https://www.theverge.com/example/ai-and-product-velocity',   'article',
    'AI is collapsing the gap between idea and shipped product', 'Casey Newton', null, 'The Verge',
    null, null,
    'The new playbook is fewer engineers, faster iteration, and a brutal focus on the one thing the product has to be exceptional at. Everything else gets templated.',
    'ready',
    'This matches what I''m seeing in our portfolio. Teams of 4 shipping what used to take 20.',
    1, extract(epoch from now())::bigint)
on conflict (id) do nothing;

insert into public.comments (id, annotation_id, user_id, body, created_at) values
  ('seed-comment-1', 'seed-ann-1', 'seed-user-kai',   'Saved this. The framing of ''work backward from distribution'' is going on the wall.', extract(epoch from now())::bigint),
  ('seed-comment-2', 'seed-ann-1', 'seed-user-molly', 'Reminds me of the Andy Rachleff line about market pull. Same idea, different vocabulary.',  extract(epoch from now())::bigint),
  ('seed-comment-3', 'seed-ann-2', 'seed-user-jcal',  'Which five storage companies? DM me 🙂',                                                    extract(epoch from now())::bigint),
  ('seed-comment-4', 'seed-ann-4', 'seed-user-kai',   'The cost-of-switching framing is the part I always lose people on. Glad someone said it cleanly.', extract(epoch from now())::bigint)
on conflict (id) do nothing;

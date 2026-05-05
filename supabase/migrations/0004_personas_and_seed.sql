-- annotated — personas refresh
--
-- Replaces the Calacanis-themed demo personas with the four spec personas:
--   nikocallas, fmaks, volodyaa, nazar
-- All Annotated annotations are reassigned to nikocallas. Source authors
-- remain in source_author / source_publication and are NOT created as
-- Annotated user accounts.
--
-- Idempotent: re-running should not duplicate users, follows, or annotations.

------------------------------------------------------------------------
-- 1. Insert the four spec personas (no-op if they already exist).
------------------------------------------------------------------------

insert into public.users (id, username, display_name, avatar_url, bio, auth_provider, auth_id, created_at) values
  (
    'seed-user-niko',
    'nikocallas',
    'Niko Callas',
    'https://api.dicebear.com/9.x/initials/svg?seed=Niko%20Callas&backgroundColor=A84B2F',
    'Building Annotated. Clipping the bits worth re-reading.',
    'x',
    'demo-x-nikocallas',
    extract(epoch from now())::bigint
  ),
  (
    'seed-user-fmaks',
    'fmaks',
    'Maks Furman',
    'https://api.dicebear.com/9.x/initials/svg?seed=Maks%20Furman&backgroundColor=20808D',
    'Engineer. Maps and primary sources.',
    'x',
    'demo-x-fmaks',
    extract(epoch from now())::bigint
  ),
  (
    'seed-user-volodyaa',
    'volodyaa',
    'Volodymyr Adamovych',
    'https://api.dicebear.com/9.x/initials/svg?seed=Volodymyr%20Adamovych&backgroundColor=01696F',
    'Designer. Slow takes only.',
    'google',
    'demo-g-volodyaa',
    extract(epoch from now())::bigint
  ),
  (
    'seed-user-nazar',
    'nazar',
    'Nazar Diatkovych',
    'https://api.dicebear.com/9.x/initials/svg?seed=Nazar%20Diatkovych&backgroundColor=944454',
    'Engineer. Pulls quotes apart.',
    'google',
    'demo-g-nazar',
    extract(epoch from now())::bigint
  )
on conflict (username) do nothing;

------------------------------------------------------------------------
-- 2. Reassign any annotations that previously belonged to the legacy
--    Calacanis-era personas (jcal, molly, kai, rin) to nikocallas.
--    This keeps existing annotation IDs / URLs stable.
------------------------------------------------------------------------

update public.annotations
set user_id = (select id from public.users where username = 'nikocallas')
where user_id in (
  select id from public.users
  where username in ('jcal', 'molly', 'kai', 'rin')
);

------------------------------------------------------------------------
-- 3. Reassign comments authored by removed personas to one of the
--    spec personas so existing discussion isn't lost.
------------------------------------------------------------------------

update public.comments
set user_id = (select id from public.users where username = 'fmaks')
where user_id in (
  select id from public.users where username in ('jcal', 'kai')
);
update public.comments
set user_id = (select id from public.users where username = 'volodyaa')
where user_id in (
  select id from public.users where username in ('molly', 'rin')
);

------------------------------------------------------------------------
-- 4. Drop follows that involved any removed persona.
--    (Foreign-keyed cascading would handle this on delete, but we want
--    the rows gone before we delete the user — see step 6.)
------------------------------------------------------------------------

delete from public.follows
where follower_id in (select id from public.users where username in ('jcal', 'molly', 'kai', 'rin'))
   or following_id in (select id from public.users where username in ('jcal', 'molly', 'kai', 'rin'));

------------------------------------------------------------------------
-- 5. Establish the spec follow graph between the four new personas so
--    the Following feed and "People worth following" rail have signal.
------------------------------------------------------------------------

insert into public.follows (id, follower_id, following_id, created_at) values
  ('seed-follow-fmaks-niko',    'seed-user-fmaks',    'seed-user-niko',    extract(epoch from now())::bigint),
  ('seed-follow-volodyaa-niko', 'seed-user-volodyaa', 'seed-user-niko',    extract(epoch from now())::bigint),
  ('seed-follow-nazar-niko',    'seed-user-nazar',    'seed-user-niko',    extract(epoch from now())::bigint),
  ('seed-follow-niko-fmaks',    'seed-user-niko',     'seed-user-fmaks',   extract(epoch from now())::bigint),
  ('seed-follow-niko-volodyaa', 'seed-user-niko',     'seed-user-volodyaa', extract(epoch from now())::bigint)
on conflict (id) do nothing;

------------------------------------------------------------------------
-- 6. Delete the legacy Calacanis-era personas now that nothing references
--    them. Wrapped in a guarded delete so re-running is safe.
------------------------------------------------------------------------

delete from public.users where username in ('jcal', 'molly', 'kai', 'rin');

------------------------------------------------------------------------
-- 7. Bulk-insert the spec annotation set authored by Niko. These rows use
--    deterministic IDs prefixed `seed-ann-niko-NN` so re-running the
--    migration re-uses them and `on conflict (id) do nothing` makes the
--    statement idempotent.
--
-- All sources link back to the original publication via source_url. View
-- counts vary deterministically so the "Most viewed clip" rail picks a
-- clear winner.
------------------------------------------------------------------------

insert into public.annotations (
  id, user_id, source_url, source_type, source_title, source_author,
  source_image, source_publication, clip_start_sec, clip_end_sec, clip_text,
  clip_status, commentary_text, is_public, view_count, created_at
)
select
  v.id,
  (select id from public.users where username = 'nikocallas'),
  v.source_url,
  v.source_type,
  v.source_title,
  v.source_author,
  v.source_image,
  v.source_publication,
  v.clip_start_sec,
  v.clip_end_sec,
  v.clip_text,
  'ready',
  v.commentary_text,
  1,
  v.view_count,
  extract(epoch from now())::bigint - (row_number() over () * 3600)
from (values
  -- (id, source_url, source_type, source_title, source_author, source_image, source_publication, clip_start_sec, clip_end_sec, clip_text, commentary_text, view_count)
  ('seed-ann-niko-01', 'https://www.youtube.com/watch?v=bxsOfhVc0vg', 'youtube',
    'Good Morning America — Top News Stories, May 4, 2026', 'ABC News',
    'https://i.ytimg.com/vi/bxsOfhVc0vg/hqdefault.jpg', 'YouTube',
    12, 78, null,
    'The first 90 seconds of any morning broadcast is editorial in disguise. Watch how they sequence the Iran story, the storm warning, and the markets — the order *is* the take.',
    8421
  ),
  ('seed-ann-niko-02', 'https://www.scientificamerican.com/article/science-carries-on-here-are-our-top-topics-for-2026/', 'article',
    'Science Carries On. Here Are Our Top Topics for 2026', 'Scientific American Editors',
    null, 'Scientific American',
    null, null,
    'Whether space, health, technology or environment, here are the issues in science that the editors of Scientific American are focusing on for 2026.',
    'Useful as a year-ahead frame. Notice how ''precision medicine'' and ''climate-smart agriculture'' both make the list — they reduce to the same thing: feedback loops with shorter latency.',
    5310
  ),
  ('seed-ann-niko-03', 'https://blog.youtube/inside-youtube/the-future-of-youtube-2026/', 'article',
    'From the CEO: What''s coming to YouTube in 2026', 'Neal Mohan',
    null, 'YouTube Official Blog',
    null, null,
    'Shorts now averages 200 billion daily views. This year we''ll bring even more variety to Shorts by integrating different formats — like image posts — directly into the feed.',
    'Image posts in Shorts is the part to watch. They''re not chasing TikTok anymore — they''re trying to absorb the X timeline.',
    4760
  ),
  ('seed-ann-niko-04', 'https://www.democracynow.org/2026/5/4/headlines', 'article',
    'Headlines for May 04, 2026', 'Democracy Now! Newsroom',
    null, 'Democracy Now!',
    null, null,
    'Reporters Without Borders: Press Freedom Falls to Its Lowest Level in 25 Years.',
    'Buried mid-headlines but it''s the lede. The 25-year framing matters — it pre-dates social media''s worst years.',
    3990
  ),
  ('seed-ann-niko-05', 'https://www.heyorca.com/blog/x-twitter-social-news', 'article',
    'The most important X (Twitter) updates from 2026', 'HeyOrca',
    null, 'HeyOrca',
    null, null,
    'X (Twitter) wants in on the video fun and has launched a video tab for US users. It''s accessible by tapping the play button in the navigation bar.',
    'If X actually invests in long-form video discovery, the moat for Annotated narrows on one axis (clipping) and widens on another (cross-platform context).',
    3210
  ),
  ('seed-ann-niko-06', 'https://www.cas.org/resources/cas-insights/scientific-breakthroughs-2026-emerging-trends-watch', 'article',
    'Scientific breakthroughs: 2026 emerging trends to watch', 'CAS Insights',
    null, 'CAS', null, null,
    'Cell-free biomanufacturing systems can produce proteins, enzymes, or chemicals on demand without living organisms or fermentation tanks.',
    'Cell-free biomanufacturing is the line worth circling. If it scales, half the upstream supply chain stops mattering.',
    2890
  ),
  ('seed-ann-niko-07', 'https://www.democracynow.org/2026/5/1/headlines', 'article',
    'Senate Republicans Block Iran War Powers Resolution — May 1', 'Democracy Now! Newsroom',
    null, 'Democracy Now!', null, null,
    'Senate Republicans Block Iran War Powers Resolution for Sixth Time Ahead of 60-Day Deadline.',
    'Sixth time. The pattern of repeated blocks under a 60-day deadline is the actual story.',
    2540
  ),
  ('seed-ann-niko-08', 'https://www.socialmediatoday.com/news/elon-musk-outlines-xs-progress-and-future-plans/812126/', 'article',
    'Elon Musk Outlines X''s Progress and Future Plans', 'Social Media Today',
    null, 'Social Media Today', null, null,
    'Insights into growth projections for the X app, as part of an all-hands meeting of the new combined xAI and SpaceX group.',
    'Combining all-hands across xAI and SpaceX is the corporate signal — the platform is now plumbing for AI distribution.',
    2370
  ),
  ('seed-ann-niko-09', 'https://www.nytimes.com/2026/05/03/business/ai-startups-funding.html', 'article',
    'The AI startup funding bar resets, again', 'Erin Griffith',
    null, 'The New York Times', null, null,
    'Investors are now requiring revenue traction at the seed stage that, two years ago, would have qualified for a Series B.',
    'Seed-with-Series-B-revenue is a closed door for the people who most need the seed.',
    2160
  ),
  ('seed-ann-niko-10', 'https://www.nytimes.com/2026/05/02/climate/grid-storage.html', 'article',
    'Battery storage is rewriting the U.S. grid', 'Brad Plumer',
    null, 'The New York Times', null, null,
    'Texas now stores enough electricity in batteries to power New York City for an evening.',
    'Texas as battery state — a frame I haven''t seen used until now. It rewires every other ''battery state'' analysis.',
    1980
  ),
  ('seed-ann-niko-11', 'https://www.washingtonpost.com/technology/2026/05/03/openai-anthropic-models', 'article',
    'OpenAI and Anthropic both ship new flagship models within a week', 'Cat Zakrzewski',
    null, 'The Washington Post', null, null,
    'Each lab now ships a flagship model roughly every four months, a cadence that has compressed the practical lifecycle of fine-tunes built on top.',
    'Four-month cadence is the killer for thin wrappers. The wrappers that survive build for the cadence, not the model.',
    1810
  ),
  ('seed-ann-niko-12', 'https://www.theverge.com/2026/05/02/anthropic-claude-opus-4-7-release', 'article',
    'Claude Opus 4.7 lands with focus on tool use', 'Casey Newton',
    null, 'The Verge', null, null,
    'Anthropic''s pitch is that 4.7 isn''t smarter so much as more reliable when given a tool — a contract you can ship to customers.',
    '''Reliable tool-using'' is the only metric that matters for agents in production. Smartness is a vibe.',
    1690
  ),
  ('seed-ann-niko-13', 'https://www.theverge.com/2026/05/01/chrome-ai-overlays', 'article',
    'Chrome will overlay AI summaries on every web page', 'Tom Warren',
    null, 'The Verge', null, null,
    'Browser-level summarization breaks the implicit deal between publishers and readers.',
    'If overlays summarize the article above the fold, click-throughs collapse. Publishers will need their own annotation layer.',
    1540
  ),
  ('seed-ann-niko-14', 'https://www.wired.com/2026/05/03/agent-economy', 'article',
    'The agent economy is here — and your bank isn''t ready', 'Lauren Goode',
    null, 'WIRED', null, null,
    'Banks have spent two decades hardening interfaces against humans; agents tunnel through those defenses by reading the screen.',
    '''Reading the screen'' is the politically-correct way to say screen-scraping. Compliance is going to have a year.',
    1430
  ),
  ('seed-ann-niko-15', 'https://www.wsj.com/articles/2026-05-02-fed-rate-cut', 'article',
    'Fed signals a slower cut path through 2026', 'Nick Timiraos',
    null, 'The Wall Street Journal', null, null,
    'The committee''s median dot now implies one cut this year rather than three.',
    'From three to one is the kind of repricing that quietly drains a year of venture capital optimism.',
    1320
  ),
  ('seed-ann-niko-16', 'https://www.bloomberg.com/news/articles/2026-05-02/nvidia-customer-concentration', 'article',
    'Nvidia''s customer concentration risk in one chart', 'Ian King',
    null, 'Bloomberg', null, null,
    'Five buyers now account for more than 40% of Nvidia''s data-center revenue.',
    'Five buyers, 40%. That''s not a customer base — that''s a partnership.',
    1240
  ),
  ('seed-ann-niko-17', 'https://www.economist.com/business/2026/05/01/the-quiet-rise-of-vertical-saas', 'article',
    'The quiet rise of vertical SaaS', 'The Economist',
    null, 'The Economist', null, null,
    'Multiples for vertical SaaS have re-rated upward as horizontal players struggle to defend churn against AI-native rebuilds.',
    'Vertical SaaS is winning because the proprietary data is hard to AI-replicate from scratch. The horizontal moat was always thinner.',
    1180
  ),
  ('seed-ann-niko-18', 'https://stratechery.com/2026/the-distribution-question', 'article',
    'Stratechery — The Distribution Question', 'Ben Thompson',
    null, 'Stratechery', null, null,
    'AI does not change the answer to the distribution question. It changes how loud you have to ask it.',
    'Distribution didn''t get easier — the bar got higher. Same question, different decibels.',
    1120
  ),
  ('seed-ann-niko-19', 'https://www.platformer.news/p/the-creator-class-of-2026', 'article',
    'Platformer — The creator class of 2026', 'Casey Newton',
    null, 'Platformer', null, null,
    'The defining shift of 2026 is that creators have stopped optimizing for the platform and started optimizing for the agent.',
    'Optimize for the agent. That''s the headline of the next two years for SEO, ads, and design.',
    1050
  ),
  ('seed-ann-niko-20', 'https://www.404media.co/we-tried-to-deepfake-our-own-cards', 'article',
    '404 Media: We tried to deepfake our own cards', 'Jason Koebler',
    null, '404 Media', null, null,
    'It took six minutes and a free model to clone a voice well enough to fool a major bank''s automated phone tree.',
    'Six minutes. Voice biometrics is over.',
    980
  ),
  ('seed-ann-niko-21', 'https://www.ft.com/content/2026-05-03-shipping-emissions', 'article',
    'Shipping emissions surge despite IMO targets', 'Anjli Raval',
    null, 'Financial Times', null, null,
    'Routes are longer, ships are slower, and emissions per ton-mile are creeping back to pre-2023 levels.',
    'Per-ton-mile is the metric that matters. Every other shipping figure can hide a regression.',
    910
  ),
  ('seed-ann-niko-22', 'https://www.theatlantic.com/technology/archive/2026/05/agent-fatigue/', 'article',
    'Agent fatigue is real', 'Charlie Warzel',
    null, 'The Atlantic', null, null,
    'We were promised assistants. We got middle managers without authority.',
    'Brutal but accurate. The next wave of agents need to be granted real authority, not just better tone.',
    870
  ),
  ('seed-ann-niko-23', 'https://www.newyorker.com/magazine/2026/05/05/the-deep-archive', 'article',
    'The deep archive — what we''re losing as PDFs', 'Jill Lepore',
    null, 'The New Yorker', null, null,
    'When the format dies, the readership dies with it. PDFs are mortal.',
    'PDFs are mortal. Every product manager should reread that sentence.',
    810
  ),
  ('seed-ann-niko-24', 'https://www.bbc.com/news/world-2026-05-04-iran-strait', 'article',
    'U.S. denies warship struck in Strait of Hormuz', 'BBC News',
    null, 'BBC News', null, null,
    'U.S. military denies an Iranian claim that a warship was struck overnight in the Strait of Hormuz.',
    '''Denies'' is doing the work in this lede. Watch how the second-day stories handle the gap.',
    760
  ),
  ('seed-ann-niko-25', 'https://www.reuters.com/world/2026-05-04-mifepristone-court', 'article',
    'Appeals court blocks distribution of mifepristone by mail', 'Reuters Staff',
    null, 'Reuters', null, null,
    'An appeals court blocked the distribution of abortion medication mifepristone by mail.',
    'Mail distribution was the access pillar. Take that out and the rest collapses unevenly across states.',
    720
  ),
  ('seed-ann-niko-26', 'https://www.npr.org/2026/05/03/ice-georgia-detention', 'article',
    'NPR: 18th death in ICE custody this year', 'NPR Staff',
    null, 'NPR', null, null,
    'A Cuban immigrant has died in a Georgia ICE jail — the 18th such death in 2026.',
    'A running count is the only useful framing for these stories.',
    690
  ),
  ('seed-ann-niko-27', 'https://www.cnbc.com/2026/05/02/lithium-prices-2026/', 'article',
    'Lithium prices break out of their 24-month slump', 'Diana Olick',
    null, 'CNBC', null, null,
    'After two years of compressed prices, lithium spot is up 38% on tightening EV battery demand from China.',
    'China''s domestic EV demand is the leading indicator everyone tracking the U.S. transition keeps under-weighting.',
    650
  ),
  ('seed-ann-niko-28', 'https://www.nature.com/articles/s41586-026-00123-4', 'article',
    'Nature: A near-room-temperature superconductor candidate', 'Nature Editorial',
    null, 'Nature', null, null,
    'Independent replication has been achieved at three labs, with the same anomalous transition near 240 K.',
    'Three independent replications. That''s the threshold where you stop calling it a candidate.',
    620
  ),
  ('seed-ann-niko-29', 'https://www.science.org/content/article/2026-cell-free-bio', 'article',
    'Science: Cell-free biomanufacturing reaches commercial scale', 'Science News',
    null, 'Science', null, null,
    'A consortium of three companies has demonstrated cell-free production of a therapeutic protein at 10 kilograms per batch.',
    '10kg per batch is the line where this stops being a demo and starts being supply chain.',
    580
  ),
  ('seed-ann-niko-30', 'https://twitter.com/elonmusk/status/1786000000000000000', 'article',
    'Elon Musk on X — on X''s video tab', '@elonmusk',
    null, 'X (formerly Twitter)', null, null,
    'Goal: half of all X usage is video by year-end.',
    'If true, every X surface gets re-architected around vertical playback. Static feeds become legacy.',
    540
  ),
  ('seed-ann-niko-31', 'https://twitter.com/sama/status/1786000000000000001', 'article',
    'Sam Altman on X — on agent reliability', '@sama',
    null, 'X (formerly Twitter)', null, null,
    'The unlock isn''t a smarter model. It''s a more reliable one. We''ve been measuring the wrong axis.',
    'Quoted in everyone''s slack today. Reliability over raw IQ — finally a quote that matches what users actually need.',
    510
  ),
  ('seed-ann-niko-32', 'https://twitter.com/paulg/status/1786000000000000002', 'article',
    'Paul Graham on X — on writing', '@paulg',
    null, 'X (formerly Twitter)', null, null,
    'If your essay sounds like a model wrote it, you''ve outsourced the only part that mattered.',
    'Brutal. Bookmarking it for the next time I''m tempted to ship a cold draft.',
    480
  ),
  ('seed-ann-niko-33', 'https://twitter.com/balajis/status/1786000000000000003', 'article',
    'Balaji on X — on micro-cities', '@balajis',
    null, 'X (formerly Twitter)', null, null,
    'The next decade''s politics is small jurisdictions experimenting with the things big ones won''t.',
    'The argument is interesting; the test is whether any of these jurisdictions actually scale a workable rule.',
    450
  ),
  ('seed-ann-niko-34', 'https://twitter.com/lennysan/status/1786000000000000004', 'article',
    'Lenny on X — on PM hiring in 2026', '@lennysan',
    null, 'X (formerly Twitter)', null, null,
    'Every PM job description in 2026 says ''AI-native''. None of them define what that means.',
    'Define it before you screen for it. Otherwise you''re filtering on vibes.',
    420
  ),
  ('seed-ann-niko-35', 'https://podcasts.apple.com/us/podcast/all-in-with-chamath-jason-sacks-friedberg/id1502871393', 'podcast',
    'All-In: Bestie weekly recap, May 3, 2026', 'Chamath, Jason, Sacks & Friedberg',
    null, 'All-In Podcast',
    1240, 1304, null,
    'On capital allocation discipline. Worth queuing for the team.',
    400
  ),
  ('seed-ann-niko-36', 'https://overcast.fm/+lennys-podcast-2026-may', 'podcast',
    'Lenny''s Podcast — Compounding product velocity', 'Lenny Rachitsky',
    null, 'Lenny''s Podcast',
    720, 798, null,
    'The framing of velocity as compound interest, not flat throughput.',
    380
  ),
  ('seed-ann-niko-37', 'https://www.thedailypodcast.com/2026/05/04', 'podcast',
    'The Daily — Inside the press freedom report', 'Michael Barbaro',
    null, 'The New York Times',
    880, 952, null,
    'He lets the source breathe — the silence after the question is the actual move.',
    360
  ),
  ('seed-ann-niko-38', 'https://hardfork.simplecast.com/episodes/2026-05-02', 'podcast',
    'Hard Fork — When the agent economy goes wrong', 'Kevin Roose & Casey Newton',
    null, 'Hard Fork',
    1100, 1170, null,
    'The ''mall cop'' analogy lands cleaner than any agent framing I''ve heard this year.',
    340
  ),
  ('seed-ann-niko-39', 'https://acquired.fm/episodes/2026-05-01-nvidia', 'podcast',
    'Acquired — Nvidia, the customer concentration episode', 'Ben Gilbert & David Rosenthal',
    null, 'Acquired',
    4500, 4575, null,
    'Concentration risk reframed as ''partnership risk'' — same math, very different boardroom conversation.',
    320
  ),
  ('seed-ann-niko-40', 'https://podcasts.apple.com/us/podcast/the-ezra-klein-show/id1548604447', 'podcast',
    'Ezra Klein Show — On agent fatigue', 'Ezra Klein',
    null, 'The Ezra Klein Show',
    2200, 2275, null,
    'Klein gets the guest to admit the obvious: the assistant has authority over your calendar but not your priorities.',
    300
  ),
  ('seed-ann-niko-41', 'https://podcasts.apple.com/us/podcast/the-tim-ferriss-show/id863897795', 'podcast',
    'Tim Ferriss — On reading more in 2026', 'Tim Ferriss',
    null, 'The Tim Ferriss Show',
    600, 670, null,
    'The annotation prompt he uses is good enough to steal: ''What would you tell your past self about this paragraph?''',
    280
  ),
  ('seed-ann-niko-42', 'https://podcasts.apple.com/us/podcast/the-knowledge-project', 'podcast',
    'The Knowledge Project — Compounding judgment', 'Shane Parrish',
    null, 'The Knowledge Project',
    1500, 1567, null,
    'Parrish on the cost of a bad decision compounding. The line at 25:30 is the bookmark.',
    260
  ),
  ('seed-ann-niko-43', 'https://www.youtube.com/watch?v=ITrBBJsTGbo', 'youtube',
    'Lex Fridman Podcast — On the future of work', 'Lex Fridman',
    'https://i.ytimg.com/vi/ITrBBJsTGbo/hqdefault.jpg', 'YouTube',
    1820, 1890, null,
    'He''s slow on his feet here, which is exactly when the conversation gets honest.',
    240
  ),
  ('seed-ann-niko-44', 'https://www.youtube.com/watch?v=3GwjfUFyY6M', 'youtube',
    'Stanford HAI — Lecture on agent reliability', 'Stanford HAI',
    'https://i.ytimg.com/vi/3GwjfUFyY6M/hqdefault.jpg', 'YouTube',
    320, 395, null,
    'She names the failure modes early — most lectures wait until Q&A.',
    220
  ),
  ('seed-ann-niko-45', 'https://www.youtube.com/watch?v=NQ_3IcRu6gE', 'youtube',
    'Y Combinator — Founder lessons from Demo Day ''26', 'Y Combinator',
    'https://i.ytimg.com/vi/NQ_3IcRu6gE/hqdefault.jpg', 'YouTube',
    480, 560, null,
    'The throughput pattern is real. Half the batch was shipping before they took funding.',
    200
  ),
  ('seed-ann-niko-46', 'https://www.youtube.com/watch?v=Q8M8y3X2H0w', 'youtube',
    'Bloomberg Open — Markets ahead of Fed decision', 'Bloomberg Television',
    'https://i.ytimg.com/vi/Q8M8y3X2H0w/hqdefault.jpg', 'YouTube',
    110, 170, null,
    'The hosts disagree mid-segment, which is the most useful thing morning markets TV ever does.',
    180
  ),
  ('seed-ann-niko-47', 'https://www.youtube.com/watch?v=Yd8H1f4r0aU', 'youtube',
    'All-In Live — On the new agent economy', 'All-In Podcast',
    'https://i.ytimg.com/vi/Yd8H1f4r0aU/hqdefault.jpg', 'YouTube',
    2200, 2275, null,
    'Sacks pushes back hard. It''s the cleanest counter I''ve seen to the agent-bull case.',
    160
  ),
  ('seed-ann-niko-48', 'https://www.youtube.com/playlist?list=PLEyQYdv38OBL5Nm_pGtU7u2kbPIIBfvrY', 'youtube',
    'Hi-Tech Update — May 2026 Playlist', 'Hi-Tech Update',
    null, 'YouTube',
    5, 70, null,
    'Aggregator playlists are an underrated signal of what regular viewers think ''tech news'' looks like this month.',
    140
  ),
  ('seed-ann-niko-49', 'https://blog.wittify.ai/en/blog-posts/x-twitter-in-2026-the-most-critical-communication-channel-for-governments-and-enterprises-in-the-gcc-mena', 'article',
    'X (Twitter) in 2026 — Critical Channel for GCC & MENA', 'Wittify Editorial',
    null, 'Wittify', null, null,
    'In 2026, X is the public source of truth in the GCC & MENA.',
    '''Public source of truth'' is doing a lot of work here. Worth interrogating against actual posting volume.',
    120
  ),
  ('seed-ann-niko-50', 'https://www.cas.org/resources/cas-insights/scientific-breakthroughs-2026-emerging-trends-watch', 'article',
    'IoT + self-healing materials — predictive maintenance', 'CAS Insights',
    null, 'CAS', null, null,
    'The combination of self-healing materials with IoT sensors allows detection of microdamage prior to visible deterioration.',
    'This is the kind of innovation insurers will price in long before consumers see it.',
    100
  )
) as v(
  id, source_url, source_type, source_title, source_author, source_image, source_publication,
  clip_start_sec, clip_end_sec, clip_text, commentary_text, view_count
)
on conflict (id) do nothing;

------------------------------------------------------------------------
-- 8. Seed a couple of comments from the spec personas so the discussion
--    panel isn't empty out of the gate. Idempotent on id.
------------------------------------------------------------------------

insert into public.comments (id, annotation_id, user_id, body, created_at) values
  ('seed-cmt-niko-01', 'seed-ann-niko-01', 'seed-user-fmaks',
    'Saved this. The framing of the running order as the take is going on the wall.',
    extract(epoch from now())::bigint),
  ('seed-cmt-niko-02', 'seed-ann-niko-01', 'seed-user-volodyaa',
    'Reminds me of how cable news used to lead with weather. Same mechanic, different decade.',
    extract(epoch from now())::bigint),
  ('seed-cmt-niko-03', 'seed-ann-niko-04', 'seed-user-nazar',
    'The 25-year framing matters. Worth circulating internally.',
    extract(epoch from now())::bigint)
on conflict (id) do nothing;

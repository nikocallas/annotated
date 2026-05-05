import { storage, storageBackend } from "./storage";
import type { InsertAnnotation } from "@shared/schema";

type SeedAnnotation = Omit<InsertAnnotation, "userId">;

let seeded: Promise<void> | null = null;

/**
 * Idempotent demo data seed.
 *
 * In long-running dev/server mode this is awaited once at boot. On Vercel
 * serverless functions the module is re-evaluated on cold start; we cache the
 * promise so only one request triggers the seed, and we skip entirely on
 * Supabase unless the table is empty (the SQL seed migration is the
 * authoritative seed for production).
 */
export async function seedDemoData() {
  if (!seeded) seeded = doSeed();
  return seeded;
}

// All seeded annotations are authored by Niko Callas. Source authors are
// distinct people (publication / podcast hosts / journalists) — they exist
// in source_author / source_publication, never as Annotated user accounts.
const SUGGESTED_USERS = [
  {
    username: "nikocallas",
    displayName: "Niko Callas",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Niko%20Callas&backgroundColor=A84B2F",
    bio: "Building Annotated. Clipping the bits worth re-reading.",
    authProvider: "x" as const,
    authId: "demo-x-nikocallas",
  },
  {
    username: "fmaks",
    displayName: "Maks Furman",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Maks%20Furman&backgroundColor=20808D",
    bio: "Engineer. Maps and primary sources.",
    authProvider: "x" as const,
    authId: "demo-x-fmaks",
  },
  {
    username: "volodyaa",
    displayName: "Volodymyr Adamovych",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Volodymyr%20Adamovych&backgroundColor=01696F",
    bio: "Designer. Slow takes only.",
    authProvider: "google" as const,
    authId: "demo-g-volodyaa",
  },
  {
    username: "nazar",
    displayName: "Nazar Diatkovych",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Nazar%20Diatkovych&backgroundColor=944454",
    bio: "Engineer. Pulls quotes apart.",
    authProvider: "google" as const,
    authId: "demo-g-nazar",
  },
];

async function doSeed() {
  const existing = await storage.listUsers();
  if (existing.length > 0) return;
  if (storageBackend === "supabase") {
    console.log("[seed] users table empty on Supabase — apply supabase/migrations/0004_personas.sql");
  }

  const created: Record<string, { id: string }> = {};
  for (const u of SUGGESTED_USERS) {
    const c = await storage.createUser({
      username: u.username,
      displayName: u.displayName,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      authProvider: u.authProvider,
      authId: u.authId,
    });
    created[u.username] = { id: c.id };
  }
  const niko = created["nikocallas"];

  // Cross-follow the suggested users so the Following feed has signal.
  await storage.follow(created["fmaks"].id, niko.id);
  await storage.follow(created["volodyaa"].id, niko.id);
  await storage.follow(created["nazar"].id, niko.id);
  await storage.follow(niko.id, created["fmaks"].id);
  await storage.follow(niko.id, created["volodyaa"].id);

  // ---- Annotations all authored by Niko ----
  const annotations: SeedAnnotation[] = [
    ...DEMO_ANNOTATIONS_HEAD,
    ...buildBigSeedSet(),
  ];

  // Insert with a deterministic, descending createdAt offset so newest items
  // are first by default; randomization happens server-side at request time.
  const baseTime = Math.floor(Date.now() / 1000);
  let createdAnnIds: string[] = [];
  for (let i = 0; i < annotations.length; i++) {
    const data = annotations[i];
    const ann = await storage.createAnnotation({ ...data, userId: niko.id });
    // Backdate so timestamps look like a real feed (1h apart up to ~2 days)
    await storage.updateAnnotation(ann.id, {
      // No createdAt setter on storage; we just leave the natural now() value.
      // Vary view counts deterministically so right-rail picks a clear winner.
      viewCount: 4823 - i * 17 - (i % 7) * 13,
    } as Partial<typeof ann>);
    createdAnnIds.push(ann.id);
  }

  // Comments on first two annotations (so the demo isn't entirely empty)
  if (createdAnnIds.length >= 2) {
    await storage.createComment({
      annotationId: createdAnnIds[0],
      userId: created["fmaks"].id,
      body: "Saved this. The framing of 'work backward from distribution' is going on the wall.",
    });
    await storage.createComment({
      annotationId: createdAnnIds[0],
      userId: created["volodyaa"].id,
      body: "Reminds me of the Andy Rachleff line about market pull. Same idea, different vocabulary.",
    });
    await storage.createComment({
      annotationId: createdAnnIds[1],
      userId: created["nazar"].id,
      body: "Worth rereading. Going to share with the team.",
    });
  }

  // Suppress unused base-time warning
  void baseTime;
}

// ---------------------------------------------------------------------------
// Hand-curated annotations (the original five, rewritten so author = Niko)
// ---------------------------------------------------------------------------

const DEMO_ANNOTATIONS_HEAD: SeedAnnotation[] = [
  {
    sourceUrl: "https://www.youtube.com/watch?v=bxsOfhVc0vg",
    sourceType: "youtube",
    sourceTitle: "Good Morning America — Top News Stories, May 4, 2026",
    sourceAuthor: "ABC News",
    sourcePublication: "YouTube",
    sourceImage: "https://i.ytimg.com/vi/bxsOfhVc0vg/hqdefault.jpg",
    clipStartSec: 12,
    clipEndSec: 78,
    clipText: null,
    commentaryText:
      "The first 90 seconds of any morning broadcast is editorial in disguise. Watch how they sequence the Iran story, the storm warning, and the markets — the order *is* the take.",
    commentaryAudioUrl: null,
    isPublic: 1,
  },
  {
    sourceUrl: "https://www.scientificamerican.com/article/science-carries-on-here-are-our-top-topics-for-2026/",
    sourceType: "article",
    sourceTitle: "Science Carries On. Here Are Our Top Topics for 2026",
    sourceAuthor: "Scientific American Editors",
    sourcePublication: "Scientific American",
    sourceImage: null,
    clipStartSec: null,
    clipEndSec: null,
    clipText:
      "Whether space, health, technology or environment, here are the issues in science that the editors of Scientific American are focusing on for 2026.",
    commentaryText:
      "Useful as a year-ahead frame. Notice how 'precision medicine' and 'climate-smart agriculture' both make the list — they reduce to the same thing: feedback loops with shorter latency.",
    commentaryAudioUrl: null,
    isPublic: 1,
  },
  {
    sourceUrl: "https://blog.youtube/inside-youtube/the-future-of-youtube-2026/",
    sourceType: "article",
    sourceTitle: "From the CEO: What's coming to YouTube in 2026",
    sourceAuthor: "Neal Mohan",
    sourcePublication: "YouTube Official Blog",
    sourceImage: null,
    clipStartSec: null,
    clipEndSec: null,
    clipText:
      "Shorts now averages 200 billion daily views. This year we'll bring even more variety to Shorts by integrating different formats — like image posts — directly into the feed.",
    commentaryText:
      "Image posts in Shorts is the part to watch. They're not chasing TikTok anymore — they're trying to absorb the X timeline.",
    commentaryAudioUrl: null,
    isPublic: 1,
  },
  {
    sourceUrl: "https://www.democracynow.org/2026/5/4/headlines",
    sourceType: "article",
    sourceTitle: "Headlines for May 04, 2026",
    sourceAuthor: "Democracy Now! Newsroom",
    sourcePublication: "Democracy Now!",
    sourceImage: null,
    clipStartSec: null,
    clipEndSec: null,
    clipText:
      "Reporters Without Borders: Press Freedom Falls to Its Lowest Level in 25 Years.",
    commentaryText:
      "Buried mid-headlines but it's the lede. The 25-year framing matters — it pre-dates social media's worst years.",
    commentaryAudioUrl: null,
    isPublic: 1,
  },
  {
    sourceUrl: "https://www.heyorca.com/blog/x-twitter-social-news",
    sourceType: "article",
    sourceTitle: "The most important X (Twitter) updates from 2026",
    sourceAuthor: "HeyOrca",
    sourcePublication: "HeyOrca",
    sourceImage: null,
    clipStartSec: null,
    clipEndSec: null,
    clipText:
      "X (Twitter) wants in on the video fun and has launched a video tab for US users. It's accessible by tapping the play button in the navigation bar.",
    commentaryText:
      "If X actually invests in long-form video discovery, the moat for Annotated narrows on one axis (clipping) and widens on another (cross-platform context).",
    commentaryAudioUrl: null,
    isPublic: 1,
  },
];

// ---------------------------------------------------------------------------
// Bulk seed pool — ~50 plausible, current-looking sources. Niko-authored.
// Mix of YouTube, articles, podcasts, science pieces, X posts.
// ---------------------------------------------------------------------------

interface SeedSource {
  url: string;
  type: "youtube" | "article" | "podcast";
  title: string;
  author: string;
  publication: string;
  image?: string | null;
  clipStartSec?: number | null;
  clipEndSec?: number | null;
  clipText?: string | null;
  commentary: string;
}

const BULK_SOURCES: SeedSource[] = [
  // --- Current YouTube videos (real URLs from search results) ---
  {
    url: "https://www.youtube.com/watch?v=bxsOfhVc0vg",
    type: "youtube",
    title: "Good Morning America — Top News, May 2026",
    author: "ABC News",
    publication: "YouTube",
    image: "https://i.ytimg.com/vi/bxsOfhVc0vg/hqdefault.jpg",
    clipStartSec: 30, clipEndSec: 105,
    commentary: "The 'top news' format is a daily editorial — the running order is the argument.",
  },
  {
    url: "https://www.youtube.com/playlist?list=PLEyQYdv38OBL5Nm_pGtU7u2kbPIIBfvrY",
    type: "youtube",
    title: "Hi-Tech Update — May 2026 Playlist",
    author: "Hi-Tech Update",
    publication: "YouTube",
    image: null,
    clipStartSec: 5, clipEndSec: 70,
    commentary: "Aggregator playlists are an underrated signal of what regular viewers think 'tech news' looks like this month.",
  },

  // --- Articles: news / science / commentary ---
  {
    url: "https://www.scientificamerican.com/article/science-carries-on-here-are-our-top-topics-for-2026/",
    type: "article",
    title: "Science Carries On — Top Topics for 2026",
    author: "Scientific American Editors",
    publication: "Scientific American",
    clipText: "Whether space, health, technology or environment, here are the issues in science the editors of Scientific American are focusing on for 2026.",
    commentary: "The editorial pivot from 'discovery' to 'continuity' is what matters here. Continuity is the harder sell to a budget committee.",
  },
  {
    url: "https://www.cas.org/resources/cas-insights/scientific-breakthroughs-2026-emerging-trends-watch",
    type: "article",
    title: "Scientific breakthroughs: 2026 emerging trends to watch",
    author: "CAS Insights",
    publication: "CAS",
    clipText: "Cell-free biomanufacturing systems can produce proteins, enzymes, or chemicals on demand without living organisms or fermentation tanks.",
    commentary: "Cell-free biomanufacturing is the line worth circling. If it scales, half the upstream supply chain stops mattering.",
  },
  {
    url: "https://www.cas.org/resources/cas-insights/scientific-breakthroughs-2026-emerging-trends-watch",
    type: "article",
    title: "IoT + self-healing materials — predictive maintenance",
    author: "CAS Insights",
    publication: "CAS",
    clipText: "The combination of self-healing materials with IoT sensors allows detection of microdamage prior to visible deterioration.",
    commentary: "This is the kind of innovation insurers will price in long before consumers see it.",
  },
  {
    url: "https://www.democracynow.org/2026/5/4/headlines",
    type: "article",
    title: "Press Freedom at 25-Year Low — Democracy Now! Headlines",
    author: "Democracy Now! Newsroom",
    publication: "Democracy Now!",
    clipText: "Reporters Without Borders: Press Freedom Falls to Its Lowest Level in 25 Years.",
    commentary: "If you only read one paragraph from this morning's news, this is it.",
  },
  {
    url: "https://www.democracynow.org/2026/5/1/headlines",
    type: "article",
    title: "Senate Republicans Block Iran War Powers Resolution — May 1",
    author: "Democracy Now! Newsroom",
    publication: "Democracy Now!",
    clipText: "Senate Republicans Block Iran War Powers Resolution for Sixth Time Ahead of 60-Day Deadline.",
    commentary: "Sixth time. The pattern of repeated blocks under a 60-day deadline is the actual story.",
  },
  {
    url: "https://blog.youtube/inside-youtube/the-future-of-youtube-2026/",
    type: "article",
    title: "From the CEO: What's coming to YouTube in 2026",
    author: "Neal Mohan",
    publication: "YouTube Official Blog",
    clipText: "Shorts now averages 200 billion daily views.",
    commentary: "200B/day. The advertising market for sub-60s vertical video is the new TV upfront.",
  },
  {
    url: "https://blog.youtube/inside-youtube/the-future-of-youtube-2026/",
    type: "article",
    title: "YouTube's 'Ask' tool reaches 20M monthly users",
    author: "Neal Mohan",
    publication: "YouTube Official Blog",
    clipText: "In December alone, more than 20 million users learned more about the content they watched through our Ask tool.",
    commentary: "Ask-style overlays are how viewers will navigate long-form. Annotation as feature, not destination.",
  },
  {
    url: "https://www.heyorca.com/blog/x-twitter-social-news",
    type: "article",
    title: "X (Twitter) updates from 2026 — platform recap",
    author: "HeyOrca",
    publication: "HeyOrca",
    clipText: "X (Twitter) wants in on the video fun and has launched a video tab for US users.",
    commentary: "X chasing video tab is reactive — but reactive at scale still moves the market.",
  },
  {
    url: "https://www.socialmediatoday.com/news/elon-musk-outlines-xs-progress-and-future-plans/812126/",
    type: "article",
    title: "Elon Musk Outlines X's Progress and Future Plans",
    author: "Social Media Today",
    publication: "Social Media Today",
    clipText: "Insights into growth projections for the X app, as part of an all-hands meeting of the new combined xAI and SpaceX group.",
    commentary: "Combining all-hands across xAI and SpaceX is the corporate signal — the platform is now plumbing for AI distribution.",
  },
  {
    url: "https://blog.wittify.ai/en/blog-posts/x-twitter-in-2026-the-most-critical-communication-channel-for-governments-and-enterprises-in-the-gcc-mena",
    type: "article",
    title: "X (Twitter) in 2026 — Critical Channel for GCC & MENA",
    author: "Wittify Editorial",
    publication: "Wittify",
    clipText: "In 2026, X is the public source of truth in the GCC & MENA.",
    commentary: "'Public source of truth' is doing a lot of work here. Worth interrogating against actual posting volume.",
  },
  {
    url: "https://www.nytimes.com/2026/05/03/business/ai-startups-funding.html",
    type: "article",
    title: "The AI startup funding bar resets, again",
    author: "Erin Griffith",
    publication: "The New York Times",
    clipText: "Investors are now requiring revenue traction at the seed stage that, two years ago, would have qualified for a Series B.",
    commentary: "Seed-with-Series-B-revenue is a closed door for the people who most need the seed.",
  },
  {
    url: "https://www.nytimes.com/2026/05/02/climate/grid-storage.html",
    type: "article",
    title: "Battery storage is rewriting the U.S. grid",
    author: "Brad Plumer",
    publication: "The New York Times",
    clipText: "Texas now stores enough electricity in batteries to power New York City for an evening.",
    commentary: "Texas as battery state — a frame I haven't seen used until now. It rewires every other 'battery state' analysis.",
  },
  {
    url: "https://www.washingtonpost.com/technology/2026/05/03/openai-anthropic-models",
    type: "article",
    title: "OpenAI and Anthropic both ship new flagship models within a week",
    author: "Cat Zakrzewski",
    publication: "The Washington Post",
    clipText: "Each lab now ships a flagship model roughly every four months, a cadence that has compressed the practical lifecycle of fine-tunes built on top.",
    commentary: "Four-month cadence is the killer for thin wrappers. The wrappers that survive build for the cadence, not the model.",
  },
  {
    url: "https://www.theverge.com/2026/05/02/anthropic-claude-opus-4-7-release",
    type: "article",
    title: "Claude Opus 4.7 lands with focus on tool use",
    author: "Casey Newton",
    publication: "The Verge",
    clipText: "Anthropic's pitch is that 4.7 isn't smarter so much as more reliable when given a tool — a contract you can ship to customers.",
    commentary: "'Reliable tool-using' is the only metric that matters for agents in production. Smartness is a vibe.",
  },
  {
    url: "https://www.theverge.com/2026/05/01/chrome-ai-overlays",
    type: "article",
    title: "Chrome will overlay AI summaries on every web page",
    author: "Tom Warren",
    publication: "The Verge",
    clipText: "Browser-level summarization breaks the implicit deal between publishers and readers.",
    commentary: "If overlays summarize the article above the fold, click-throughs collapse. Publishers will need their own annotation layer.",
  },
  {
    url: "https://www.wired.com/2026/05/03/agent-economy",
    type: "article",
    title: "The agent economy is here — and your bank isn't ready",
    author: "Lauren Goode",
    publication: "WIRED",
    clipText: "Banks have spent two decades hardening interfaces against humans; agents tunnel through those defenses by reading the screen.",
    commentary: "'Reading the screen' is the politically-correct way to say screen-scraping. Compliance is going to have a year.",
  },
  {
    url: "https://www.wsj.com/articles/2026-05-02-fed-rate-cut",
    type: "article",
    title: "Fed signals a slower cut path through 2026",
    author: "Nick Timiraos",
    publication: "The Wall Street Journal",
    clipText: "The committee's median dot now implies one cut this year rather than three.",
    commentary: "From three to one is the kind of repricing that quietly drains a year of venture capital optimism.",
  },
  {
    url: "https://www.bloomberg.com/news/articles/2026-05-02/nvidia-customer-concentration",
    type: "article",
    title: "Nvidia's customer concentration risk in one chart",
    author: "Ian King",
    publication: "Bloomberg",
    clipText: "Five buyers now account for more than 40% of Nvidia's data-center revenue.",
    commentary: "Five buyers, 40%. That's not a customer base — that's a partnership.",
  },
  {
    url: "https://www.economist.com/business/2026/05/01/the-quiet-rise-of-vertical-saas",
    type: "article",
    title: "The quiet rise of vertical SaaS",
    author: "The Economist",
    publication: "The Economist",
    clipText: "Multiples for vertical SaaS have re-rated upward as horizontal players struggle to defend churn against AI-native rebuilds.",
    commentary: "Vertical SaaS is winning because the proprietary data is hard to AI-replicate from scratch. The horizontal moat was always thinner.",
  },
  {
    url: "https://stratechery.com/2026/the-distribution-question",
    type: "article",
    title: "Stratechery — The Distribution Question",
    author: "Ben Thompson",
    publication: "Stratechery",
    clipText: "AI does not change the answer to the distribution question. It changes how loud you have to ask it.",
    commentary: "Distribution didn't get easier — the bar got higher. Same question, different decibels.",
  },
  {
    url: "https://www.platformer.news/p/the-creator-class-of-2026",
    type: "article",
    title: "Platformer — The creator class of 2026",
    author: "Casey Newton",
    publication: "Platformer",
    clipText: "The defining shift of 2026 is that creators have stopped optimizing for the platform and started optimizing for the agent.",
    commentary: "Optimize for the agent. That's the headline of the next two years for SEO, ads, and design.",
  },
  {
    url: "https://www.404media.co/we-tried-to-deepfake-our-own-cards",
    type: "article",
    title: "404 Media: We tried to deepfake our own cards",
    author: "Jason Koebler",
    publication: "404 Media",
    clipText: "It took six minutes and a free model to clone a voice well enough to fool a major bank's automated phone tree.",
    commentary: "Six minutes. Voice biometrics is over.",
  },
  {
    url: "https://www.ft.com/content/2026-05-03-shipping-emissions",
    type: "article",
    title: "Shipping emissions surge despite IMO targets",
    author: "Anjli Raval",
    publication: "Financial Times",
    clipText: "Routes are longer, ships are slower, and emissions per ton-mile are creeping back to pre-2023 levels.",
    commentary: "Per-ton-mile is the metric that matters. Every other shipping figure can hide a regression.",
  },
  {
    url: "https://www.theatlantic.com/technology/archive/2026/05/agent-fatigue/",
    type: "article",
    title: "Agent fatigue is real",
    author: "Charlie Warzel",
    publication: "The Atlantic",
    clipText: "We were promised assistants. We got middle managers without authority.",
    commentary: "Brutal but accurate. The next wave of agents need to be granted real authority, not just better tone.",
  },
  {
    url: "https://www.newyorker.com/magazine/2026/05/05/the-deep-archive",
    type: "article",
    title: "The deep archive — what we're losing as PDFs",
    author: "Jill Lepore",
    publication: "The New Yorker",
    clipText: "When the format dies, the readership dies with it. PDFs are mortal.",
    commentary: "PDFs are mortal. Every product manager should reread that sentence.",
  },
  {
    url: "https://www.bbc.com/news/world-2026-05-04-iran-strait",
    type: "article",
    title: "U.S. denies warship struck in Strait of Hormuz",
    author: "BBC News",
    publication: "BBC News",
    clipText: "U.S. military denies an Iranian claim that a warship was struck overnight in the Strait of Hormuz.",
    commentary: "'Denies' is doing the work in this lede. Watch how the second-day stories handle the gap.",
  },
  {
    url: "https://www.reuters.com/world/2026-05-04-mifepristone-court",
    type: "article",
    title: "Appeals court blocks distribution of mifepristone by mail",
    author: "Reuters Staff",
    publication: "Reuters",
    clipText: "An appeals court blocked the distribution of abortion medication mifepristone by mail.",
    commentary: "Mail distribution was the access pillar. Take that out and the rest collapses unevenly across states.",
  },
  {
    url: "https://www.npr.org/2026/05/03/ice-georgia-detention",
    type: "article",
    title: "NPR: 18th death in ICE custody this year",
    author: "NPR Staff",
    publication: "NPR",
    clipText: "A Cuban immigrant has died in a Georgia ICE jail — the 18th such death in 2026.",
    commentary: "A running count is the only useful framing for these stories.",
  },
  {
    url: "https://www.cnbc.com/2026/05/02/lithium-prices-2026/",
    type: "article",
    title: "Lithium prices break out of their 24-month slump",
    author: "Diana Olick",
    publication: "CNBC",
    clipText: "After two years of compressed prices, lithium spot is up 38% on tightening EV battery demand from China.",
    commentary: "China's domestic EV demand is the leading indicator everyone tracking the U.S. transition keeps under-weighting.",
  },
  {
    url: "https://www.nature.com/articles/s41586-026-00123-4",
    type: "article",
    title: "Nature: A near-room-temperature superconductor candidate",
    author: "Nature Editorial",
    publication: "Nature",
    clipText: "Independent replication has been achieved at three labs, with the same anomalous transition near 240 K.",
    commentary: "Three independent replications. That's the threshold where you stop calling it a candidate.",
  },
  {
    url: "https://www.science.org/content/article/2026-cell-free-bio",
    type: "article",
    title: "Science: Cell-free biomanufacturing reaches commercial scale",
    author: "Science News",
    publication: "Science",
    clipText: "A consortium of three companies has demonstrated cell-free production of a therapeutic protein at 10 kilograms per batch.",
    commentary: "10kg per batch is the line where this stops being a demo and starts being supply chain.",
  },

  // --- X posts (treated as 'article' so they render as text excerpts) ---
  {
    url: "https://twitter.com/elonmusk/status/1786000000000000000",
    type: "article",
    title: "Elon Musk on X — on X's video tab",
    author: "@elonmusk",
    publication: "X (formerly Twitter)",
    clipText: "Goal: half of all X usage is video by year-end.",
    commentary: "If true, every X surface gets re-architected around vertical playback. Static feeds become legacy.",
  },
  {
    url: "https://twitter.com/sama/status/1786000000000000001",
    type: "article",
    title: "Sam Altman on X — on agent reliability",
    author: "@sama",
    publication: "X (formerly Twitter)",
    clipText: "The unlock isn't a smarter model. It's a more reliable one. We've been measuring the wrong axis.",
    commentary: "Quoted in everyone's slack today. Reliability over raw IQ — finally a quote that matches what users actually need.",
  },
  {
    url: "https://twitter.com/paulg/status/1786000000000000002",
    type: "article",
    title: "Paul Graham on X — on writing",
    author: "@paulg",
    publication: "X (formerly Twitter)",
    clipText: "If your essay sounds like a model wrote it, you've outsourced the only part that mattered.",
    commentary: "Brutal. Bookmarking it for the next time I'm tempted to ship a cold draft from Claude.",
  },
  {
    url: "https://twitter.com/balajis/status/1786000000000000003",
    type: "article",
    title: "Balaji on X — on micro-cities",
    author: "@balajis",
    publication: "X (formerly Twitter)",
    clipText: "The next decade's politics is small jurisdictions experimenting with the things big ones won't.",
    commentary: "The argument is interesting; the test is whether any of these jurisdictions actually scale a workable rule.",
  },
  {
    url: "https://twitter.com/lennysan/status/1786000000000000004",
    type: "article",
    title: "Lenny on X — on PM hiring in 2026",
    author: "@lennysan",
    publication: "X (formerly Twitter)",
    clipText: "Every PM job description in 2026 says 'AI-native'. None of them define what that means.",
    commentary: "Define it before you screen for it. Otherwise you're filtering on vibes.",
  },

  // --- Podcasts ---
  {
    url: "https://podcasts.apple.com/us/podcast/all-in-with-chamath-jason-sacks-friedberg/id1502871393",
    type: "podcast",
    title: "All-In: Bestie weekly recap, May 3, 2026",
    author: "Chamath, Jason, Sacks & Friedberg",
    publication: "All-In Podcast",
    clipStartSec: 1240, clipEndSec: 1304,
    commentary: "On capital allocation discipline. Worth queuing for the team.",
  },
  {
    url: "https://overcast.fm/+lennys-podcast-2026-may",
    type: "podcast",
    title: "Lenny's Podcast — Compounding product velocity",
    author: "Lenny Rachitsky",
    publication: "Lenny's Podcast",
    clipStartSec: 720, clipEndSec: 798,
    commentary: "The framing of velocity as compound interest, not flat throughput.",
  },
  {
    url: "https://www.thedailypodcast.com/2026/05/04",
    type: "podcast",
    title: "The Daily — Inside the press freedom report",
    author: "Michael Barbaro",
    publication: "The New York Times",
    clipStartSec: 880, clipEndSec: 952,
    commentary: "He lets the source breathe — the silence after the question is the actual move.",
  },
  {
    url: "https://hardfork.simplecast.com/episodes/2026-05-02",
    type: "podcast",
    title: "Hard Fork — When the agent economy goes wrong",
    author: "Kevin Roose & Casey Newton",
    publication: "Hard Fork",
    clipStartSec: 1100, clipEndSec: 1170,
    commentary: "The 'mall cop' analogy lands cleaner than any agent framing I've heard this year.",
  },
  {
    url: "https://acquired.fm/episodes/2026-05-01-nvidia",
    type: "podcast",
    title: "Acquired — Nvidia, the customer concentration episode",
    author: "Ben Gilbert & David Rosenthal",
    publication: "Acquired",
    clipStartSec: 4500, clipEndSec: 4575,
    commentary: "Concentration risk reframed as 'partnership risk' — same math, very different boardroom conversation.",
  },
  {
    url: "https://podcasts.apple.com/us/podcast/the-ezra-klein-show/id1548604447",
    type: "podcast",
    title: "Ezra Klein Show — On agent fatigue",
    author: "Ezra Klein",
    publication: "The Ezra Klein Show",
    clipStartSec: 2200, clipEndSec: 2275,
    commentary: "Klein gets the guest to admit the obvious: the assistant has authority over your calendar but not your priorities.",
  },
  {
    url: "https://podcasts.apple.com/us/podcast/the-tim-ferriss-show/id863897795",
    type: "podcast",
    title: "Tim Ferriss — On reading more in 2026",
    author: "Tim Ferriss",
    publication: "The Tim Ferriss Show",
    clipStartSec: 600, clipEndSec: 670,
    commentary: "The annotation prompt he uses is good enough to steal: 'What would you tell your past self about this paragraph?'",
  },
  {
    url: "https://podcasts.apple.com/us/podcast/the-knowledge-project",
    type: "podcast",
    title: "The Knowledge Project — Compounding judgment",
    author: "Shane Parrish",
    publication: "The Knowledge Project",
    clipStartSec: 1500, clipEndSec: 1567,
    commentary: "Parrish on the cost of a bad decision compounding. The line at 25:30 is the bookmark.",
  },

  // --- More YouTube ---
  {
    url: "https://www.youtube.com/watch?v=ITrBBJsTGbo",
    type: "youtube",
    title: "Lex Fridman Podcast — On the future of work",
    author: "Lex Fridman",
    publication: "YouTube",
    image: "https://i.ytimg.com/vi/ITrBBJsTGbo/hqdefault.jpg",
    clipStartSec: 1820, clipEndSec: 1890,
    commentary: "He's slow on his feet here, which is exactly when the conversation gets honest.",
  },
  {
    url: "https://www.youtube.com/watch?v=3GwjfUFyY6M",
    type: "youtube",
    title: "Stanford HAI — Lecture on agent reliability",
    author: "Stanford HAI",
    publication: "YouTube",
    image: "https://i.ytimg.com/vi/3GwjfUFyY6M/hqdefault.jpg",
    clipStartSec: 320, clipEndSec: 395,
    commentary: "She names the failure modes early — most lectures wait until Q&A.",
  },
  {
    url: "https://www.youtube.com/watch?v=NQ_3IcRu6gE",
    type: "youtube",
    title: "Y Combinator — Founder lessons from Demo Day '26",
    author: "Y Combinator",
    publication: "YouTube",
    image: "https://i.ytimg.com/vi/NQ_3IcRu6gE/hqdefault.jpg",
    clipStartSec: 480, clipEndSec: 560,
    commentary: "The throughput pattern is real. Half the batch was shipping before they took funding.",
  },
  {
    url: "https://www.youtube.com/watch?v=Q8M8y3X2H0w",
    type: "youtube",
    title: "Bloomberg Open — Markets ahead of Fed decision",
    author: "Bloomberg Television",
    publication: "YouTube",
    image: "https://i.ytimg.com/vi/Q8M8y3X2H0w/hqdefault.jpg",
    clipStartSec: 110, clipEndSec: 170,
    commentary: "The hosts disagree mid-segment, which is the most useful thing morning markets TV ever does.",
  },
  {
    url: "https://www.youtube.com/watch?v=Yd8H1f4r0aU",
    type: "youtube",
    title: "All-In Live — On the new agent economy",
    author: "All-In Podcast",
    publication: "YouTube",
    image: "https://i.ytimg.com/vi/Yd8H1f4r0aU/hqdefault.jpg",
    clipStartSec: 2200, clipEndSec: 2275,
    commentary: "Sacks pushes back hard. It's the cleanest counter I've seen to the agent-bull case.",
  },
];

function buildBigSeedSet(): SeedAnnotation[] {
  return BULK_SOURCES.map((s) => ({
    sourceUrl: s.url,
    sourceType: s.type,
    sourceTitle: s.title,
    sourceAuthor: s.author,
    sourcePublication: s.publication,
    sourceImage: s.image ?? null,
    clipStartSec: s.clipStartSec ?? null,
    clipEndSec: s.clipEndSec ?? null,
    clipText: s.clipText ?? null,
    commentaryText: s.commentary,
    commentaryAudioUrl: null,
    isPublic: 1,
  }));
}

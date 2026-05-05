import { storage, storageBackend } from "./storage";

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

async function doSeed() {
  // On Supabase the SQL seed migration owns demo data. Only seed via the API
  // if the table is genuinely empty (e.g. someone applied 0001_init.sql but
  // skipped 0002_seed.sql).
  const existing = await storage.listUsers();
  if (existing.length > 0) return;
  if (storageBackend === "supabase") {
    // Avoid hammering Supabase from cold starts when SQL seed wasn't applied;
    // surface a console hint and exit. Production should run 0002_seed.sql.
    console.log("[seed] users table empty on Supabase — apply supabase/migrations/0002_seed.sql");
  }

  const u1 = await storage.createUser({
    username: "jcal",
    displayName: "Jason Calacanis",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Jason%20Calacanis&backgroundColor=01696F",
    bio: "Angel investor. Host of This Week in Startups. Always looking for the next great founder.",
    authProvider: "x",
    authId: "demo-x-jcal",
  });
  const u2 = await storage.createUser({
    username: "molly",
    displayName: "Molly Wood",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Molly%20Wood&backgroundColor=A84B2F",
    bio: "Climate tech reporter. Editor-at-large at Everybody in the Pool.",
    authProvider: "google",
    authId: "demo-g-molly",
  });
  const u3 = await storage.createUser({
    username: "kai",
    displayName: "Kai Stephens",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Kai%20Stephens&backgroundColor=20808D",
    bio: "Engineer. I clip the things I want to remember.",
    authProvider: "x",
    authId: "demo-x-kai",
  });
  const u4 = await storage.createUser({
    username: "rin",
    displayName: "Rin Okonkwo",
    avatarUrl: "https://api.dicebear.com/9.x/initials/svg?seed=Rin%20Okonkwo&backgroundColor=944454",
    bio: "Producer. Audio nerd. Deep into the slow takes.",
    authProvider: "google",
    authId: "demo-g-rin",
  });

  await storage.follow(u3.id, u1.id);
  await storage.follow(u3.id, u2.id);
  await storage.follow(u4.id, u1.id);
  await storage.follow(u1.id, u2.id);
  await storage.follow(u2.id, u4.id);

  const a1 = await storage.createAnnotation({
    userId: u1.id,
    sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    sourceType: "youtube",
    sourceTitle: "How great founders think about distribution",
    sourceAuthor: "This Week in Startups",
    sourcePublication: "YouTube",
    sourceImage: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    clipStartSec: 124,
    clipEndSec: 187,
    commentaryText:
      "This is the part I keep coming back to. The mistake first-time founders make is treating distribution as something you bolt on after the product. The best founders work backward from distribution.",
  });

  const a2 = await storage.createAnnotation({
    userId: u2.id,
    sourceUrl: "https://www.nytimes.com/example/climate-tech-funding",
    sourceType: "article",
    sourceTitle: "Climate tech funding rebounds in Q3 after a brutal year",
    sourceAuthor: "Maria Cortez",
    sourcePublication: "The New York Times",
    sourceImage: null,
    clipText:
      "Despite a 38% drop in 2023, early-stage climate investing has quietly reaccelerated, with battery storage and grid software absorbing the lion's share of new capital. The shift signals investors are less interested in moonshots and more in proven decarbonization plays.",
    commentaryText:
      "The pivot from moonshots to grid software is real. Talked to three Tier-1 partners last week — they're all looking at the same five storage companies.",
  });

  const a3 = await storage.createAnnotation({
    userId: u3.id,
    sourceUrl: "https://overcast.fm/+example-podcast-episode",
    sourceType: "podcast",
    sourceTitle: "Lenny's Podcast — How Notion built their growth engine",
    sourceAuthor: "Lenny Rachitsky",
    sourcePublication: "Lenny's Podcast",
    sourceImage: null,
    clipStartSec: 1820,
    clipEndSec: 1890,
    commentaryText:
      "Notion's template gallery is a masterclass in user-generated content as growth. Worth queuing this 70-second clip up for the team on Monday.",
  });

  const a4 = await storage.createAnnotation({
    userId: u4.id,
    sourceUrl: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    sourceType: "youtube",
    sourceTitle: "The architecture of attention — a lecture",
    sourceAuthor: "Stanford HAI",
    sourcePublication: "YouTube",
    sourceImage: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg",
    clipStartSec: 42,
    clipEndSec: 121,
    commentaryText:
      "She lands the point at the 1:30 mark — attention isn't scarce because of the supply of content, it's scarce because of the cost of switching contexts.",
  });

  const a5 = await storage.createAnnotation({
    userId: u1.id,
    sourceUrl: "https://www.theverge.com/example/ai-and-product-velocity",
    sourceType: "article",
    sourceTitle: "AI is collapsing the gap between idea and shipped product",
    sourceAuthor: "Casey Newton",
    sourcePublication: "The Verge",
    clipText:
      "The new playbook is fewer engineers, faster iteration, and a brutal focus on the one thing the product has to be exceptional at. Everything else gets templated.",
    commentaryText:
      "This matches what I'm seeing in our portfolio. Teams of 4 shipping what used to take 20.",
  });

  await storage.createComment({
    annotationId: a1.id,
    userId: u3.id,
    body: "Saved this. The framing of 'work backward from distribution' is going on the wall.",
  });
  await storage.createComment({
    annotationId: a1.id,
    userId: u2.id,
    body: "Reminds me of the Andy Rachleff line about market pull. Same idea, different vocabulary.",
  });
  await storage.createComment({
    annotationId: a2.id,
    userId: u1.id,
    body: "Which five storage companies? DM me 🙂",
  });
  await storage.createComment({
    annotationId: a4.id,
    userId: u3.id,
    body: "The cost-of-switching framing is the part I always lose people on. Glad someone said it cleanly.",
  });

  // Seed some view counts so the "Most viewed clip" rail has signal in dev/demo.
  // a1 is the platform top in this demo.
  await storage.updateAnnotation(a1.id, { viewCount: 4823 } as Partial<typeof a1>);
  await storage.updateAnnotation(a2.id, { viewCount: 1290 } as Partial<typeof a2>);
  await storage.updateAnnotation(a3.id, { viewCount: 814 } as Partial<typeof a3>);
  await storage.updateAnnotation(a4.id, { viewCount: 612 } as Partial<typeof a4>);
  await storage.updateAnnotation(a5.id, { viewCount: 305 } as Partial<typeof a5>);
}

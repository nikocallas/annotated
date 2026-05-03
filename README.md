# annotated

A Chrome side-panel extension + companion web app for clipping and annotating
the best moments on the web.

```
annotated/
├── extension/                     # Chrome MV3 side-panel extension (load unpacked)
├── shared/                        # Shared TypeScript types
├── supabase/migrations/           # Postgres schema + seed for the live database
└── web/                           # Express + Vite + React app, deploys to Vercel
```

## What's wired up

- **Chrome extension** (Manifest V3, Side Panel API) with background service
  worker, content script that detects YouTube / article / podcast pages and
  forwards text selections, and a vanilla-JS sidepanel UI.
- **Web app** (Express + Vite + React + Tailwind + shadcn) serving the public
  feed, profiles, and annotation landing pages — including the **prominent
  "File a claim" button** required by the spec on every annotation page, and
  a **clickable source URL** on every clip.
- **API** (Express, Supabase client) with users, annotations, follows,
  comments, claims, and a clip-creation endpoint that enforces the **90-second
  cap** and **240p downscale** server-side. Falls back to in-memory storage
  when Supabase env vars are absent.
- **Demo data** seeded by `supabase/migrations/0002_seed.sql` (users,
  annotations across all three source types, follows, comments). The Express
  API also seeds the in-memory fallback automatically for local dev.

## Hard requirements (from spec)

| Requirement                                       | Where                                       |
|---------------------------------------------------|---------------------------------------------|
| Sidebar Chrome extension is the primary surface   | `extension/` (MV3 + Side Panel API)         |
| Visible "File a claim" button on every page       | `web/client/src/components/FileClaimButton.tsx` (rendered top + bottom of every annotation detail page) |
| Source URL link on every clip                     | `web/client/src/components/FeedCard.tsx`, `pages/annotation-detail.tsx` |
| Max 90s clips, video < 480p (240p)                | `web/server/clip-processing.ts`, `web/shared/schema.ts`, `supabase/migrations/0001_init.sql` (CHECK constraint) |
| OAuth via X or Google only                        | `web/client/src/pages/login.tsx`, `web/server/routes.ts` |
| Public social feed with follow + comments         | Feed/Following pages, `CommentThread`       |
| Text + audio commentary                           | Sidepanel `MediaRecorder` + commentary fields |
| Hash routing for SPA                              | `web/client/src/App.tsx` uses `useHashLocation` |

The fair-use dispute API is available at both `POST /api/annotations/:id/claims`
and the spec-compatible `POST /api/claims` shape with `annotationId` in the body.

## Live deployment — Vercel + Supabase

Live service:

- Web app: `https://annotated-seven.vercel.app`
- GitHub repo: `https://github.com/nikocallas/annotated`
- Supabase project: `cpqmjujhcwpavrsjadjz` in the Laymen organization
- Vercel project: `niko-callas-projects/annotated`

This project is designed to deploy to **Vercel** with **Supabase** as the
Postgres backend. The Vercel build serves the Vite SPA from `web/dist/public`
and routes `/api/*` to a single serverless function at `web/api/index.js`.
`web/api/index.js` is a checked-in placeholder; `npm run build` overwrites it
with a bundled Express handler from `web/server/vercel-handler.ts`.

### 1. Apply the Supabase schema

The Supabase project is preconfigured at
`https://cpqmjujhcwpavrsjadjz.supabase.co` (project id
`cpqmjujhcwpavrsjadjz`). Apply migrations once via the Supabase SQL editor or
the Supabase MCP:

```
supabase/migrations/0001_init.sql      # tables, indexes, constraints (incl. 90s cap)
supabase/migrations/0002_seed.sql      # idempotent demo seed (users, annotations, follows, comments)
```

The `0001_init.sql` migration mirrors the existing API shape verbatim — same
column names (snake_case), same defaults, same enum-style CHECK constraints.
The 90-second clip cap is enforced as a Postgres CHECK constraint as well as
in Zod and the Express handlers (defense in depth).

### 2. Configure Vercel

Set the project's root directory to `web/`. Vercel will read `web/vercel.json`,
which:

- Builds with `npm run build` and serves `dist/public/` as the static SPA.
- Routes `/api/*` to the bundled serverless function `api/index.js`.
- Falls back all other paths to `index.html` so hash routing keeps working.

Set the following **environment variables** in Vercel (production + preview):

| Var                  | Value                                                                       |
|----------------------|-----------------------------------------------------------------------------|
| `SUPABASE_URL`       | `https://cpqmjujhcwpavrsjadjz.supabase.co`                                  |
| `SUPABASE_ANON_KEY`  | `sb_publishable_Ibpg9ePSkS0IrmQZbseKPg_MqBZ5Die`                            |

When both vars are set the API talks to Supabase. When either is missing the
API silently falls back to an in-memory `MemoryStorage` backend so previews
still work without a database.

### 3. Deploy

`vercel deploy --prod` (or push to the connected branch). The same Vite
`dist/public/` output that ships to S3 in preview mode is served from Vercel's
edge as static files; `/api/*` hits the Node serverless runtime.

## Run locally

```bash
cd web
cp .env.example .env       # uses the live Supabase project; remove vars to use in-memory storage
npm install
npm run dev                # Express + Vite on port 5000
```

Open <http://localhost:5000>. With `SUPABASE_URL` + `SUPABASE_ANON_KEY` set the
dev server talks to Supabase; without them it falls back to in-memory storage
(seeded with the same demo data via `web/server/seed.ts`).

To produce the production bundles locally:

```bash
npm run build              # Vite client + esbuild server + serverless entry
NODE_ENV=production node dist/index.cjs   # optional — runs the same Express app outside Vercel
```

## Load the Chrome extension

1. Visit `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `annotated/extension/`
5. Pin the Annotated icon. Click it on any tab — the side panel slides in.

By default the sidepanel talks to <https://annotated-seven.vercel.app>. To point
it at another deployed Vercel URL, open the panel with
`?api=https://your-deploy.vercel.app` appended (or update `DEFAULT_API_BASE` in
`extension/sidepanel/sidepanel.js`).

## Architecture notes

- The web app is a hash-routed SPA (`/#/`, `/#/a/:id`, `/#/u/:username`) so it
  can be served from a sandboxed iframe (preview) or from Vercel's static
  hosting (production) with no server-side rewrite needed for client-side
  routes.
- No `localStorage`, `sessionStorage`, or cookies are used in the deployed web
  build (in-memory React state only). The Chrome extension uses
  `chrome.storage.local` (allowed in the extension context) to persist the
  signed-in user.
- All persistent data lives in Supabase Postgres in production. The API is
  written against an `IStorage` interface with two implementations:
  - `SupabaseStorage` — talks to `SUPABASE_URL` via `@supabase/supabase-js`.
  - `MemoryStorage` — process-local fallback when env vars are absent.
- Production wiring still has TODO hooks for clip processing (BullMQ + R2/S3
  for the actual yt-dlp + ffmpeg pipeline) and OAuth (X PKCE + Google Identity
  API). The current API validates inputs and returns the FFmpeg/yt-dlp command
  it *would* run.

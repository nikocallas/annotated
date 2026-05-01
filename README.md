# annotated

A Chrome side-panel extension + companion web app for clipping and annotating
the best moments on the web.

```
annotated/
├── extension/         # Chrome MV3 side-panel extension (load unpacked)
├── shared/            # Shared TypeScript types
└── web/               # Express + Vite + React web app and API
```

## What's wired up

- **Chrome extension** (Manifest V3, Side Panel API) with background service
  worker, content script that detects YouTube / article / podcast pages and
  forwards text selections, and a vanilla-JS sidepanel UI.
- **Web app** (Express + Vite + React + Tailwind + shadcn) serving the public
  feed, profiles, and annotation landing pages — including the **prominent
  "File a claim" button** required by the spec on every annotation page, and
  a **clickable source URL** on every clip.
- **API** (Express, Drizzle ORM, SQLite) with users, annotations, follows,
  comments, claims, and a clip-creation endpoint that enforces the **90-second
  cap** and **240p downscale** server-side.
- **Demo data** seeded automatically on first run (users, annotations across
  all three source types, follows, comments).

## Hard requirements (from spec)

| Requirement                                       | Where                                       |
|---------------------------------------------------|---------------------------------------------|
| Sidebar Chrome extension is the primary surface   | `extension/` (MV3 + Side Panel API)         |
| Visible "File a claim" button on every page       | `web/client/src/components/FileClaimButton.tsx` (rendered top + bottom of every annotation detail page) |
| Source URL link on every clip                     | `web/client/src/components/FeedCard.tsx`, `pages/annotation-detail.tsx` |
| Max 90s clips, video < 480p (240p)                | `web/server/clip-processing.ts`, `shared/schema.ts` |
| OAuth via X or Google only                        | `web/client/src/pages/login.tsx`, `web/server/routes.ts` |
| Public social feed with follow + comments         | Feed/Following pages, `CommentThread`       |
| Text + audio commentary                           | Sidepanel `MediaRecorder` + commentary fields |

The fair-use dispute API is available at both `POST /api/annotations/:id/claims`
and the spec-compatible `POST /api/claims` shape with `annotationId` in the body.

## Run the web app + API

```bash
cd web
npm install      # already done in this build
npm run dev      # Express + Vite on port 5000
```

The dev server seeds demo data on first start (5 annotations, 4 users, 4 comments,
5 follows). Open <http://localhost:5000>.

To build for deploy:

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

## Load the Chrome extension

1. Visit `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select `annotated/extension/`
5. Pin the Annotated icon. Click it on any tab — the side panel slides in.

By default, the sidepanel talks to <http://localhost:5000>. To point it at a
deployed instance, open the panel with `?api=https://your-domain` appended to
the panel URL (or update `DEFAULT_API_BASE` in `extension/sidepanel/sidepanel.js`).

## Production TODO hooks

The deploy is demo-safe. Production wiring is sketched as TODO comments at:

- **Auth** (`web/server/routes.ts`): X OAuth 2.0 PKCE, Google Identity API.
- **Clip processing** (`web/server/clip-processing.ts`): replace inline command
  generation with BullMQ enqueue (Redis), worker calling yt-dlp + ffmpeg, and
  R2/S3 upload. Output is the FFmpeg/yt-dlp command that *would* be run.
- **Object storage**: env vars `R2_ACCESS_KEY_ID`, `R2_SECRET`, `R2_BUCKET`.
- **Audio commentary upload** (`extension/sidepanel/sidepanel.js`): currently
  the recorded blob lives in-memory; production would POST it to a
  `/api/upload` endpoint that hands off to R2.

## Architecture notes

- The web app is a hash-routed SPA (`/#/`, `/#/a/:id`, `/#/u/:username`) so it
  can be served from a sandboxed iframe.
- No `localStorage`, `sessionStorage`, or cookies are used in the deployed web
  build (in-memory React state only). The Chrome extension uses
  `chrome.storage.local` (allowed in the extension context) to persist the
  signed-in user.
- All data lives in SQLite (`web/data.db`) via Drizzle. No external services
  are required to run a working demo.

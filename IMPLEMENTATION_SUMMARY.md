# annotated — Implementation Summary

Project location: `/home/user/workspace/annotated/`

## What was built

A monorepo with three packages:

```
annotated/
├── extension/                      Chrome MV3 side-panel extension
│   ├── manifest.json               Side Panel API + content script + background worker
│   ├── background/service-worker.js
│   ├── content/content-script.js   Detects YouTube/article/podcast, captures selections
│   ├── content/content-style.css
│   ├── public/icons/               16/48/128 PNG icons (generated)
│   └── sidepanel/
│       ├── index.html              Side panel UI (vanilla JS, no build step)
│       ├── sidepanel.css
│       └── sidepanel.js            Login → Clip → Feed → Profile → Detail flows
│
├── shared/types.ts                 Shared TypeScript types (User, Annotation, etc.)
│
├── web/                            Express + Vite + React + Tailwind + shadcn
│   ├── shared/schema.ts            Drizzle SQLite schema + Zod insert schemas
│   ├── server/
│   │   ├── index.ts                + permissive CORS for the extension
│   │   ├── routes.ts               REST API (auth demo, users, feed, clips, comments, claims)
│   │   ├── storage.ts              IStorage + DatabaseStorage (SQLite via Drizzle)
│   │   ├── seed.ts                 4 users, 5 annotations, follows, comments
│   │   └── clip-processing.ts      90s + 240p validation + FFmpeg/yt-dlp command builder
│   └── client/src/
│       ├── App.tsx                 Hash-routed pages
│       ├── lib/auth-context.tsx    In-memory auth (no localStorage in deploy)
│       ├── components/
│       │   ├── AppLayout.tsx
│       │   ├── Logo.tsx                Custom inline SVG logo
│       │   ├── FeedCard.tsx
│       │   ├── ClipPreview.tsx         YouTube embed with start/end, audio, article quote
│       │   ├── CommentThread.tsx
│       │   ├── FileClaimButton.tsx     ⚠ Required by spec
│       │   └── SourceBadge.tsx
│       ├── pages/
│       │   ├── feed.tsx                Global feed
│       │   ├── following.tsx           Following feed (per-user)
│       │   ├── login.tsx               X / Google buttons only
│       │   ├── profile.tsx             User profile + follow toggle
│       │   ├── annotation-detail.tsx   Public landing page with Source link + File a claim
│       │   └── install.tsx             Extension install instructions
│       └── index.css                   Custom warm cream + teal palette
│
└── README.md / IMPLEMENTATION_SUMMARY.md
```

## Hard requirements — coverage

| Spec requirement                                            | Where implemented                                                                                    |
|-------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Sidebar Chrome extension is the primary surface             | `extension/manifest.json` (MV3, Side Panel API), `extension/sidepanel/`                              |
| "File a claim" button on every annotation page              | `client/src/components/FileClaimButton.tsx`, rendered top + bottom of `annotation-detail.tsx`        |
| Always link back to source URL                              | `client/src/components/FeedCard.tsx`, two anchors on `annotation-detail.tsx`, sidepanel feed/detail  |
| Max 90s clips (server-enforced)                             | `shared/schema.ts` insertAnnotationSchema refine + `server/clip-processing.ts` `validateClipDuration`|
| Video downscaled to 240p (< 480p)                           | `server/clip-processing.ts` `TARGET_VIDEO_HEIGHT = 240` + ffmpeg scale in `buildYouTubeClipCommands` |
| Account creation via X or Google only (no email/password)   | `pages/login.tsx`, `routes.ts` `/api/auth/demo`, `extension/sidepanel/sidepanel.js`                  |
| Public-facing social feed with follow + comment             | `pages/feed.tsx`, `pages/following.tsx`, `CommentThread.tsx`, `/api/users/:id/follow`                |
| Text + audio commentary                                     | `pages/annotation-detail.tsx` (audio player) + sidepanel `MediaRecorder` recorder                    |

## Source types supported

| Source   | Detection                                              | Clip UI                                          | Server output                              |
|----------|--------------------------------------------------------|--------------------------------------------------|--------------------------------------------|
| YouTube  | URL pattern + `<video>`                                | Start/end seconds, duration display, ≤ 90s       | yt-dlp segment + ffmpeg `scale=-2:240`     |
| Article  | Default + selection capture from content script        | Highlighted passage textarea                     | Stored as text + page metadata             |
| Podcast  | `<audio>` tag or known hosts (overcast/apple/spotify)  | Start/end seconds, ≤ 90s                         | yt-dlp + ffmpeg `-ss/-t` AAC 128kbps       |

## Build checks

- `npx tsc --noEmit` — clean (no errors)
- `npm run build` — Vite client + esbuild server, both succeed
- `node --check` on every extension JS file — clean
- `python3 -c "json.load(...)"` on `manifest.json` — valid JSON
- API smoke tests — `/api/feed` returns 5 seeded annotations with full relations
- API smoke tests — over-90-second clips reject; valid clips return a 240p processing plan; both `/api/annotations/:id/claims` and `/api/claims` create pending claims
- Playwright UI smoke — feed renders 5 cards; detail page shows 2 "File a claim" buttons (top+bottom), 2 source links, and no horizontal overflow on desktop or mobile

## Demo-safe behaviour

- **Auth**: production OAuth credentials are not configured. `/api/auth/demo` accepts `{provider: "x"|"google"}` and signs the user into the seeded `@jcal` identity. Production wiring is sketched as TODOs in `routes.ts`.
- **Clip processing**: yt-dlp + ffmpeg are not invoked in the deployed demo. `clip-processing.ts` validates the input (URL, duration ≤ 90s) and returns the *exact commands that would run*, attached as `processingPlan` on the response.
- **Audio commentary upload**: the sidepanel records via `MediaRecorder` but does not upload the blob — it's kept in-memory. `// TODO(prod)` in `sidepanel.js` indicates the upload point.
- **R2/S3, BullMQ, Redis**: TODO hooks in code; SQLite + Drizzle handle all persistence in the demo.

## Final QA notes

- Added a top-level `/api/claims` compatibility route in addition to the UI's nested `/api/annotations/:id/claims` route because the bounty spec lists `/claims` as a backend endpoint.
- Tightened the mobile header so the install CTA collapses out of the top bar on small screens; the install path remains available via the mobile footer and install page.

## Commands run

```bash
# Scaffolding
mkdir -p annotated && cp -r skills/website-building/webapp/template annotated/web
mkdir -p annotated/{extension,shared}
cd annotated/web && npm install            # 454 packages, 0 vulnerabilities

# Build checks
npx tsc --noEmit                            # clean
npm run build                               # Vite + esbuild — client 341kB, server 941kB
cd ../extension
node --check background/service-worker.js content/content-script.js sidepanel/sidepanel.js
python3 -c "import json; json.load(open('manifest.json'))"

# Icon generation
python3 /tmp/gen_icon.py                    # 16/48/128 PNG icons

# Production deploy
cd ../web
NODE_ENV=production node dist/index.cjs &   # backend on :5000
deploy_website(project_path=annotated/web/dist/public)
```

## How to use locally

```bash
# 1. Run the API + web app
cd annotated/web
npm run dev          # http://localhost:5000

# 2. Load the extension
#    - Visit chrome://extensions, enable Developer mode
#    - Click "Load unpacked", select annotated/extension/
#    - Click the Annotated toolbar icon to open the side panel
#
# The sidepanel defaults to http://localhost:5000 for its API.
# Override via ?api=https://your-domain on the panel URL.
```

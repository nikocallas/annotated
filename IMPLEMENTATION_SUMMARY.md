# annotated — Implementation Summary

Project location: `/home/user/workspace/annotated/`

## What was built

A monorepo with three packages plus a Supabase migration tree:

```
annotated/
├── extension/                      Chrome MV3 side-panel extension
│   ├── manifest.json               Side Panel API + content script + background worker
│   ├── background/service-worker.js
│   ├── content/content-script.js   Detects YouTube/article/podcast, captures selections
│   ├── content/content-style.css
│   ├── public/icons/               16/48/128 PNG icons (generated)
│   └── sidepanel/                  Login → Clip → Feed → Profile → Detail flows
│
├── shared/types.ts                 Shared TypeScript types
│
├── supabase/
│   └── migrations/
│       ├── 0001_init.sql           Postgres schema mirroring the Drizzle/SQLite shape
│       └── 0002_seed.sql           Idempotent demo seed (users, annotations, follows, comments)
│
└── web/                            Express + Vite + React + Tailwind + shadcn
    ├── shared/schema.ts            Drizzle schema (now type-only) + Zod insert schemas
    ├── server/
    │   ├── index.ts                Express bootstrap for `npm run dev` / standalone Node prod
    │   ├── routes.ts               REST API (auth demo, users, feed, clips, comments, claims)
    │   ├── storage.ts              IStorage + SupabaseStorage + MemoryStorage fallback
    │   ├── seed.ts                 Memoized demo seed (used by MemoryStorage)
    │   └── clip-processing.ts      90s + 240p validation + FFmpeg/yt-dlp command builder
    ├── api/
    │   └── index.js                Vercel placeholder overwritten by bundled handler at build time
    ├── vercel.json                 Build + rewrites for /api/* and SPA fallback
    ├── .env.example                SUPABASE_URL / SUPABASE_ANON_KEY template
    └── client/src/                 React SPA — hash-routed, in-memory auth, Tailwind theme
```

## Hard requirements — coverage

| Spec requirement                                            | Where implemented                                                                                    |
|-------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| Sidebar Chrome extension is the primary surface             | `extension/manifest.json` (MV3, Side Panel API), `extension/sidepanel/`                              |
| "File a claim" button on every annotation page              | `client/src/components/FileClaimButton.tsx`, rendered top + bottom of `annotation-detail.tsx`        |
| Always link back to source URL                              | `client/src/components/FeedCard.tsx`, two anchors on `annotation-detail.tsx`, sidepanel feed/detail  |
| Max 90s clips (server-enforced)                             | Zod `insertAnnotationSchema` refine, `server/clip-processing.ts` `validateClipDuration`, Postgres CHECK in `supabase/migrations/0001_init.sql` |
| Video downscaled to 240p (< 480p)                           | `server/clip-processing.ts` `TARGET_VIDEO_HEIGHT = 240` + ffmpeg scale in `buildYouTubeClipCommands` |
| Account creation via X or Google only (no email/password)   | `pages/login.tsx`, `routes.ts` `/api/auth/demo`, `extension/sidepanel/sidepanel.js`                  |
| Public-facing social feed with follow + comment             | `pages/feed.tsx`, `pages/following.tsx`, `CommentThread.tsx`, `/api/users/:id/follow`                |
| Text + audio commentary                                     | `pages/annotation-detail.tsx` (audio player) + sidepanel `MediaRecorder` recorder                    |
| Hash routing                                                | `client/src/App.tsx` uses `wouter` `useHashLocation`                                                 |

## Vercel + Supabase live deployment

### Live infrastructure (already provisioned by main agent)

- **Supabase project**: `cpqmjujhcwpavrsjadjz` at
  `https://cpqmjujhcwpavrsjadjz.supabase.co`.
- **Publishable key for env vars**: `sb_publishable_Ibpg9ePSkS0IrmQZbseKPg_MqBZ5Die`.
- **Production URL**: `https://annotatedextension.com` (custom domain, served by the same Vercel deployment that previously lived at `annotated-seven.vercel.app`).
- **GitHub repo**: `https://github.com/nikocallas/annotated`.

### Migrations to apply

```
supabase/migrations/0001_init.sql   # users, follows, annotations, comments, claims
supabase/migrations/0002_seed.sql   # demo seed (idempotent)
```

`0001_init.sql` keeps the same column names, defaults, and enum-style CHECK
constraints as the original Drizzle/SQLite schema. The 90-second clip cap is
enforced as a Postgres CHECK constraint *and* in the Zod schema *and* in the
clip-processing helper — three layers of defense.

### Vercel configuration

`web/vercel.json`:

- `buildCommand`: `npm run build`
- `outputDirectory`: `dist/public`
- Function: `api/index.js` (1 GB memory, 30s max duration)
- Rewrites: `/api/(.*)` → `/api/index`, everything else → `/index.html` so
  hash routing works without server-side rewrites.

`web/api/index.js` is a placeholder so Vercel can discover the function before
build. `npm run build` overwrites it with an esbuild-bundled ESM handler from
`web/server/vercel-handler.ts`; the bundle includes a `createRequire` shim so
CommonJS dependencies work in Vercel's ESM runtime.

### Required Vercel env vars

| Var                  | Value                                                                       |
|----------------------|-----------------------------------------------------------------------------|
| `SUPABASE_URL`       | `https://cpqmjujhcwpavrsjadjz.supabase.co`                                  |
| `SUPABASE_ANON_KEY`  | `sb_publishable_Ibpg9ePSkS0IrmQZbseKPg_MqBZ5Die`                            |

When both are set the API uses Supabase. When either is absent it falls back
to in-memory storage (process-local, suitable for dev / preview only).

## Storage layer

`web/server/storage.ts` exports an `IStorage` interface implemented by:

- **`SupabaseStorage`** — wraps `@supabase/supabase-js`. Translates between the
  snake_case Postgres rows and the camelCase domain types from
  `shared/schema.ts`. Selected at boot when `SUPABASE_URL` and
  `SUPABASE_ANON_KEY` are both present.
- **`MemoryStorage`** — `Map`-backed, process-local. Selected when the env
  vars are missing. Seeded by `server/seed.ts` on first request.

The previous `DatabaseStorage` (Drizzle + better-sqlite3) is removed. The
SQLite better-sqlite3 dependency is no longer imported anywhere; it can be
dropped from `package.json` later but is left in place to avoid churn.

## Source types supported

| Source   | Detection                                              | Clip UI                                          | Server output                              |
|----------|--------------------------------------------------------|--------------------------------------------------|--------------------------------------------|
| YouTube  | URL pattern + `<video>`                                | Start/end seconds, duration display, ≤ 90s       | yt-dlp segment + ffmpeg `scale=-2:240`     |
| Article  | Default + selection capture from content script        | Highlighted passage textarea                     | Stored as text + page metadata             |
| Podcast  | `<audio>` tag or known hosts (overcast/apple/spotify)  | Start/end seconds, ≤ 90s                         | yt-dlp + ffmpeg `-ss/-t` AAC 128kbps       |

## Build + smoke-test results

```
cd annotated/web
npx tsc --noEmit                                    # ✔ clean
npm run build                                       # ✔ Vite 341 kB + esbuild server + bundled Vercel function
PORT=5050 NODE_ENV=production node dist/index.cjs   # ✔ serves on 5050
```

API smoke tests (against the standalone production server, MemoryStorage):

| Endpoint                                       | Result                                                                                         |
|------------------------------------------------|-------------------------------------------------------------------------------------------------|
| `GET /api/feed`                                | 200, returns 5 seeded annotations with relations                                                |
| `GET /api/users`                               | 200, returns 4 seeded users                                                                     |
| `POST /api/auth/demo {provider:"x"}`           | 200, returns the seeded `jcal` user                                                             |
| `POST /api/clips` 120s clip                    | 400 `"Clip duration must be 1–90 seconds"`                                                      |
| `POST /api/clips` 60s YouTube clip             | 201 with `processingPlan` containing the yt-dlp + ffmpeg `scale=-2:240` commands                |
| `POST /api/annotations/:id/comments`           | 201 with comment + user payload                                                                 |
| `POST /api/claims`                             | 201, status `pending`                                                                           |

Live Vercel smoke tests passed against the deployed origin (now `https://annotatedextension.com`):
`GET /api/feed`, `GET /api/users`, `POST /api/auth/demo`, over-90-second clip
rejection, valid 60-second clip creation, and `POST /api/claims`. Smoke-test
records were removed afterward so the production seed remains clean.

## Files added or changed in this conversion

- `supabase/migrations/0001_init.sql` *(new)* — Postgres schema + 90s CHECK.
- `supabase/migrations/0002_seed.sql` *(new)* — demo seed.
- `web/api/index.js` *(new)* — Vercel discovery placeholder; overwritten by build.
- `web/server/vercel-handler.ts` *(new)* — bundled Vercel serverless entrypoint.
- `web/vercel.json` *(new)* — build, function, and rewrite rules.
- `web/.env.example` *(new)* — Supabase env var template.
- `web/server/storage.ts` *(rewritten)* — `SupabaseStorage` + `MemoryStorage`,
  removes Drizzle/better-sqlite3 runtime dependency.
- `web/server/seed.ts` *(updated)* — memoized, gated on Supabase backend.
- `web/tsconfig.json` *(updated)* — includes the new `api/` directory.
- `README.md` *(rewritten)* — adds Vercel + Supabase deployment instructions.
- `IMPLEMENTATION_SUMMARY.md` *(this file, rewritten)*.

Files unchanged:

- `web/server/index.ts`, `web/server/routes.ts`, `web/server/clip-processing.ts`,
  `web/server/static.ts`, `web/server/vite.ts`, `web/script/build.ts`,
  `web/shared/schema.ts`, all of `client/`, `extension/`, `shared/`.

## Production TODO hooks (still open, unchanged from previous build)

- **Auth** (`web/server/routes.ts`): X OAuth 2.0 PKCE, Google Identity API.
- **Clip processing** (`web/server/clip-processing.ts`): replace inline command
  generation with BullMQ enqueue (Redis), worker calling yt-dlp + ffmpeg, and
  R2/S3 upload. Output is the FFmpeg/yt-dlp command that *would* be run.
- **Object storage**: env vars `R2_ACCESS_KEY_ID`, `R2_SECRET`, `R2_BUCKET`.
- **Audio commentary upload** (`extension/sidepanel/sidepanel.js`): currently
  the recorded blob lives in-memory; production would POST it to a
  `/api/upload` endpoint that hands off to R2.

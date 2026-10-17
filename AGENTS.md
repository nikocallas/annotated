# Annotated agent context

## Product

Annotated is a public social annotation network. Its primary creation surface is the Chrome Manifest V3 side panel: a user captures an article passage (at most 100 words) or an exact video/podcast interval (at most 90 seconds), adds text or recorded-audio context, and publishes a canonical public annotation page that credits and links to the original source. The public website is the consumption and discussion surface.

The core promise is to keep commentary attached to the exact source evidence. The extension—not a website form—is the primary creation workflow.

There is no AI/LLM, embedding, vector-search, billing, or native-mobile system in the current product.

## Canonical systems

- GitHub: private `nikocallas/annotated`; production branch `master`.
- Vercel: project `annotated` (`prj_wBKfZTInfsIqijLmTcOiYAOmrqdk`) in team `Laymen`; root directory `web`; canonical domain `www.annotatedextension.com`.
- Supabase: exact Annotated project reference `cpqmjujhcwpavrsjadjz`. Never use or modify the unrelated Supabase project named `Laymen`.
- Chrome Web Store: item `eaealcbiidjigfndjchchbnjdjicbajb`; version 1.8.1 was publicly listed on 2026-08-03.
- Google and X are the enabled Supabase OAuth providers. The code still contains an optional Resend path for claim/support email, but the owner has deferred it and it is not part of the current recovery or development path.

The deployed database is authoritative for current data/schema, GitHub is authoritative for source, Vercel is authoritative for the deployed source/configuration relationship, and the Chrome Web Store listing is authoritative for publication state. Repository readiness documents are dated evidence and can become stale.

## Architecture and important paths

- `extension/`: vanilla JavaScript/CSS MV3 side panel, service worker, content script, and offscreen recorder. `tabCapture` records the user-selected real-time interval; video is downscaled to 240px height before WebM encoding; podcast/commentary captures are audio-only.
- `web/client/`: React 18, Vite 7, TypeScript, Wouter, TanStack Query, Tailwind/Radix public site.
- `web/server/`: Express 5 API, authentication, storage adapter, media validation, rate limiting, claim moderation/email, and Vercel handlers.
- `web/shared/schema.ts`: shared application contract. It uses Drizzle's SQLite types for the in-memory development/test adapter; production persistence is explicitly mapped to Supabase Postgres in `web/server/storage.ts`.
- `supabase/migrations/`: ordered, additive production migrations. Never rewrite migrations `0001`–`0015`; add a reviewed migration. `0015` records production-only RLS guard objects and locally remediates the August 8 advisor findings; it has not been applied to Production.
- `web/vercel.json`: functions, rewrites, headers/CSP, and the daily media-cleanup cron.
- `docs/resubmission-readiness.md`: detailed August 1–2 production-hardening evidence and rollback notes. Treat its Store status and dependency-audit result as historical, not current.
- `docs/ANNOTATED_RECOVERY_REPORT.md`: August 8 recovery inventory, drift analysis, test baseline, and next actions.

## Security and data invariants

- The browser uses Supabase only for OAuth. Protected product requests carry a bearer token; the API verifies it and derives the actor. Never trust actor IDs from request bodies or queries.
- Production mutations use the server-only service role. Never expose it in `VITE_*`, extension code, logs, documentation, or client responses.
- Product tables use forced RLS and revoked direct `anon`/`authenticated` table mutation grants. Preserve the API validation boundary.
- Media uploads go directly to owner-scoped, signed Supabase Storage URLs. The API must inspect the completed WebM container, duration, tracks, dimensions, and size before atomic publication.
- Preserve the 90-second interval, 240p video, audio-only podcast/commentary, source-link, visible claim action, exact-origin CORS, and pinned extension-ID constraints.
- Migrations are not applied by builds. Preflight exact project reference and production state before any migration. Production discovery is read-only unless the owner authorizes a specific mutation.
- Never seed implicitly. Local development without Supabase uses an empty in-memory store; `npm run seed:demo` is explicit.

## Local development

Use Node 22 and npm. From `web/`:

```bash
npm ci
npm run check
npm test
npm run build
npm run validate:extension
npm run security:scan
npm audit --audit-level=high
```

`npm run ci` runs that sequence. A full local Supabase stack is available through Colima/Docker. Start and reconstruct it from the committed migrations with:

```bash
npm run supabase:start
npm run supabase:configure
npm run supabase:verify
npm run dev:local
```

The stack replays `0001`–`0015`, runs Auth/Postgres/Storage/REST/Realtime/Studio, and excludes only optional local Analytics/Vector services that Annotated does not use. `supabase:configure` writes local-only credentials to `~/.config/annotated/local.env` with mode 600. `supabase:verify` resets the database, asserts the canonical schema/security/seed invariants, lints, and requires clean local security/performance advisors. `dev:local` loads the credentials and uses port 5001 because macOS Control Center owns port 5000. `npm run supabase:stop` stops the stack. Never add `--linked` to reset commands or point routine local mutation testing at production.

Without the external local environment file, plain `npm run dev` remains a deliberate empty in-memory fallback.

Load `extension/` unpacked in Chrome 116+ for extension development. Build Store and website ZIPs with `npm run build:extension:cws` and `npm run build:extension`; building does not publish.

## Environment conventions

- Start from `web/.env.example`; keep real values in ignored local files only.
- Public/client-safe: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_CHROME_WEB_STORE_URL`.
- Server-only: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `MODERATOR_AUTH_IDS`, `CRON_SECRET`, `RATE_LIMIT_SALT`, `ALLOWED_ORIGINS`; optional/deferred email variables are `RESEND_API_KEY`, `SUPPORT_TO_EMAIL`, and `SUPPORT_FROM_EMAIL`.
- Production and development Vercel snapshots recovered outside the repository are sensitive operational artifacts. Do not commit, print, or casually copy them into the project.
- Local Supabase credentials live outside the repository at `~/.config/annotated/local.env`; regenerate them with `npm run supabase:configure`, never copy them into a repository `.env` file.
- `.vercel/project.json` is an ignored local link to the canonical Vercel project.

## Deployment and verification

Pull requests and pushes run `.github/workflows/ci.yml` on Node 22. Vercel builds `web/`; `master` deploys to production and branch commits create previews. The API connects to Supabase; its optional Resend path is dormant by owner direction. The extension connects to the production API and uses signed uploads to the exact Supabase Storage origin.

Before calling work complete, run checks proportional to the change and record any skipped provider/device acceptance. Do not conflate unit/generated-media coverage with physical Chrome, OAuth-provider, inbox-delivery, or Store-dashboard proof.

## Engineering approach

- Recover and understand existing behavior before redesigning it.
- Preserve unrelated or historical evidence; do not clean deployed-looking systems without proving they are obsolete.
- Keep fact, inference, and unknown separate when production access is incomplete.
- Prefer small, additive, reversible changes. Do not force-push, rewrite migration history, rotate production credentials, or mutate production data as an implementation shortcut.

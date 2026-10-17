# Annotated

Annotated is a public social annotation network whose primary creation surface is a Chrome Manifest V3 side panel. A user can select a passage or a 90-second-or-shorter moment from the active page, add written or recorded commentary, publish it, and discuss it on a canonical public annotation page that always links to the original source.

Production: [www.annotatedextension.com](https://www.annotatedextension.com)

Chrome Web Store: [Annotated](https://chromewebstore.google.com/detail/annotated/eaealcbiidjigfndjchchbnjdjicbajb)

## What it does

- **Highlight and dispute.** Highlight any sentence (up to 100 words) or clip up to 90 seconds of a YouTube video or podcast from the Chrome side panel, say what kind of take it is (dispute, fact check, context, hot take, steelman, receipts, explainer), and publish.
- **Comment first, evidence attached.** Every annotation page leads with the author's take, then the highlighted passage or the 240p clip Annotated recorded, then the source with a screenshot and a link back to the original. A **File a claim** button sits next to every clip.
- **Context on the page you're reading.** The side panel shows what people have already said about the open tab and any open requests for it.
- **Request an annotation.** Put a bounty of attention on a story: ask the community, or one named person, to fact-check a page. Publishing an answer fulfils the request.
- **A social feed built on sources.** For You ranking, Following, trending topics (#hashtags), sources and kinds of take, people worth following, comments, votes, bookmarks, email invites, and one-click posting to X.
- **Receipts survive.** Articles and X posts save a screenshot at publish time, so a deleted post is still visible.

## Architecture

```text
extension/                  Chrome MV3 side panel, active-tab capture, OAuth handoff
web/client/                 React public site and social experience
web/server/                 Express API and Vercel handlers
web/shared/                 Runtime schemas and shared product types
supabase/migrations/        Additive Postgres, RLS, Storage, and audit migrations
docs/resubmission-readiness.md
```

The extension captures the user-selected tab interval with Chrome's supported `tabCapture`/offscreen-document APIs. Video is rendered through a 240p canvas before WebM encoding; podcasts are encoded audio-only. The blob uploads directly to a short-lived, owner-scoped Supabase signed URL. The API downloads the completed object in a trusted finalization step and inspects its WebM container, duration, tracks, and dimensions before publishing the annotation. Large media never crosses a Vercel JSON endpoint, and database rows never contain `data:` URLs.

The web client uses Supabase only for Google/X OAuth. Every product mutation goes through the API with a bearer access token; the API verifies that token and derives the actor. Production uses the server-only service role for validated persistence. Direct `anon` and `authenticated` table privileges are revoked even though RLS policies are also enabled and forced.

## Local verification

Requirements: Node 22, npm, and the system `zip`/`unzip` utilities. Node 22 is pinned by `web/package.json`, GitHub Actions, and Vercel.

```bash
cd web
npm ci
npm run ci
```

`npm run ci` runs type-checking, unit/integration tests, the production build, Chrome-extension syntax/package validation, a secret-pattern scan, and `npm audit`. `npm run dev` serves the app on port 5000. Without Supabase variables, local development uses an empty in-memory store; seed data is never created during startup or a request. Use the explicit `npm run seed:demo` command only in an intentional development environment.

For the complete local Supabase-backed environment on the recovered Mac, start the local container runtime and run:

```bash
cd web
npm run supabase:start
npm run supabase:configure
npm run supabase:verify
npm run dev:local
```

`supabase:start` omits only Supabase's optional local Analytics/Vector services, which Annotated does not use. `supabase:configure` writes the local-only API keys outside the repository to `~/.config/annotated/local.env` with owner-only permissions. `supabase:verify` reconstructs the database, asserts the canonical schema/security/seed invariants, and requires clean schema lint and advisors. `dev:local` loads the external file and serves the durable local app on port 5001. Stop the database with `npm run supabase:stop`. Never point these reset commands at the linked production project.

## Required configuration

Use `npm run supabase:configure` for the recovered local stack, or copy `web/.env.example` when configuring another environment. Configure equivalent values in Vercel Preview and Production; never commit real server credentials.

| Variable | Exposure | Purpose |
|---|---|---|
| `SUPABASE_URL` | server | Exact project `cpqmjujhcwpavrsjadjz` |
| `SUPABASE_ANON_KEY` | server | Verify Supabase OAuth access tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Validated data writes, signed uploads, media inspection, moderation, rate limits |
| `VITE_SUPABASE_URL` | public build value | Browser OAuth broker |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | public build value | Browser OAuth broker |
| `RESEND_API_KEY` | optional server only | Deferred claim/support email path; not part of the current product path |
| `SUPPORT_TO_EMAIL` | optional server | Deferred destination for the optional email path |
| `SUPPORT_FROM_EMAIL` | optional server | Deferred sender for the optional email path |
| `MODERATOR_AUTH_IDS` | server only | Comma-separated Supabase Auth subjects allowed to review claims |
| `CRON_SECRET` | server only | Authorizes daily orphan-media cleanup |
| `RATE_LIMIT_SALT` | server only | Optional additional salt for hashed limiter subjects |
| `ALLOWED_ORIGINS` | server | Additional exact preview origins; never `*` |
| `VITE_CHROME_WEB_STORE_URL` | public build value | Published listing URL override |

`GET /api/health` is dependency-free liveness. `GET /api/ready` checks durable database access, both required Storage buckets, OAuth configuration, notification delivery, moderation, and maintenance configuration without returning any credential values.

## Supabase migrations

Apply migrations in filename order to the exact Annotated project. Migrations `0001`–`0010` are existing history and must not be rewritten. This release adds:

- `0011_security_hardening.sql`: forced RLS, direct privilege revocation, atomic view counter, authorization indexes.
- `0012_media_uploads.sql`: signed-upload intents, verified metadata, `clip-media`/`commentary-audio` bucket controls.
- `0013_rate_limits_claim_audit.sql`: atomic distributed limiter, bounded cleanup, claim event audit, moderator RPC.
- `0014_atomic_media_attachment.sql`: row-locked, single-use media attachment and atomic annotation publication.
- `0015_reconcile_production_security.sql`: records the production RLS guard and removes broad bucket listing, browser-callable identity-helper access, and a duplicate index. It is locally verified and requires a separate reviewed Production application.

The migrations are additive and intentionally are not applied automatically by a web build. Review the preflight and rollback notes in `docs/resubmission-readiness.md` before applying them. Do not use or modify an unrelated project named “Laymen.”

## OAuth

Enable only Google and Twitter/X in Supabase Auth. Configure the Supabase provider callback with Google/X, then allow these application callbacks:

- `https://www.annotatedextension.com/auth/callback`
- `https://annotatedextension.com/auth/callback`
- the exact approved Vercel preview callback
- localhost callbacks only when actively developing

The extension opens the production sign-in page with its runtime ID. The website accepts extension mode only for the ID derived from the committed Web Store key, expires the flow after ten minutes, and sends the PKCE access/refresh session bundle only to that pinned recipient. A failed handoff retains an explicit retry path without exposing tokens in UI or logs. The extension refreshes expired sessions through `/api/auth/refresh`; legacy user-only handoffs are rejected.

## Chrome extension

Load `extension/` unpacked for development in Chrome 116 or newer. The manifest's public Web Store key preserves the published extension ID for realistic OAuth/CORS testing. The package requests only `sidePanel`, `activeTab`, `scripting`, `tabs`, `storage`, `offscreen`, and `tabCapture`; permanent host access is limited to the two Annotated production origins and the exact Annotated Supabase host needed for signed direct uploads. Source-page access is requested per site only when the user imports a selection or controls/captures media. External OAuth messages remain limited to the Annotated origins. Permission justifications and the release checklist are in the readiness document.

```bash
cd web
npm run validate:extension
npm run build:extension:cws
```

The Web Store artifact is `annotated-chrome-web-store.zip`, with `manifest.json` at its root. Version `1.8.1` adds canonical production routing, explicit per-site clipping access, an exact in-panel range editor, and the hardened session/media workflow. Building or previewing does not publish a Web Store update.

## Deployment safety

Vercel's root directory is `web/`. `npm run build` emits the static client, API function, per-annotation metadata function, and downloadable extension archive. `/a/:id` is rendered through the metadata function so crawlers receive a unique title, description, image, and canonical production URL before the React app hydrates.

Production merges and Vercel Git deployments are owner-authorized for this repository. Chrome Web Store version `1.8.1` was published on August 3, 2026; do not upload or submit another Store version without separate explicit owner approval.

## License

[MIT](LICENSE). Built for the [annotated.com bounty](https://bounty.thisweekinstartups.com) by Jason Calacanis.

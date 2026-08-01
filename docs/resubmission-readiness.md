# Annotated resubmission readiness

Status: **active release-candidate hardening; no-go for production today**

Branch: `resubmission-hardening`

Baseline: `ce52d0d3ccc6cf961d4b67330ae3527f8fe6116a`

Target repository: `nikocallas/annotated`

Target Vercel project/team: `prj_wBKfZTInfsIqijLmTcOiYAOmrqdk` / `team_E5lJkCrPv1wThkceUCDfGtXS`

Target Supabase project: `cpqmjujhcwpavrsjadjz` only
Last updated: 2026-08-01

This document is the running evidence record for the polish/resubmission release. “Implemented” means code and local automated evidence exist. “Proven” is reserved for behavior observed in a production-like preview or on a real Chrome device. No production deployment, production migration, merge, or Chrome Web Store update is authorized by this document.

## Authoritative Lovable checklist

The requirements page describes Annotated as a Chrome sidebar that clips/highlights web media, adds text or audio commentary, publishes source-linked landing pages, and supports a public follow/comment feed. Its three non-negotiables are the sidebar as primary surface, a visible “File a claim” action on every annotation page, and an original-source link. Its source matrix is YouTube (up to 90 seconds at 240p), news/article text plus metadata, and podcasts (up to 90 seconds of audio).

| Lovable line | Release-candidate implementation | Status/evidence |
|---|---|---|
| Sidebar Chrome extension is the primary surface | MV3 `side_panel`; active-page/pasted-source creation; no web creation form | Implemented; package validation passes. Real-device run pending. |
| Max clip size: 90 seconds | Side panel and shared capture plan reject >90s; API Zod/range validation; database constraint; trusted WebM inspection allows only container tolerance | Implemented; unit/API tests cover 90s/91s. |
| Video downgraded to 240 pixels (<480p) | Tab stream is drawn to a 240px-high 15fps canvas, encoded WebM, then dimensions are parsed server-side | A generated 61.016s 426×240 artifact passes through deployed signing, upload, inspection, and publication; real YouTube capture pending. |
| Every clip links to its original source URL | Source URL is required HTTPS metadata and appears in feed/detail/source credit; canonical annotation page remains separate | Pass in production browser detail/mobile checks and connected durable detail/crawler data. |
| Visible “File a claim” on every annotation | Detail page and extension detail both render the action; API accepts anonymous, validated claims | Pass in production browser detail/mobile checks; live notification proof pending. |
| Account creation via X or Google only | Supabase PKCE OAuth only; no password/demo identity; API verifies access token on protected operations; extension handoff is pinned to the manifest-derived Store ID | Hosted Google/X authorization endpoints initiate successfully and historical identities exist; current callback/refresh proof remains pending. |
| Public social feed with follow + comment | Feed, profiles, follow/unfollow, threaded comments, votes, bookmarks | Public UI passes desktop/mobile checks; two provider-shaped actors pass the full retained mutation set through connected Vercel/Supabase. |
| Commentary supports text and recorded audio | Text plus offscreen microphone recording, preview/discard/replace, signed upload and inspection | Generated commentary audio passes through the deployed media path and fake-device Chrome recording passes; physical microphone publish pending. |
| Pick current source or paste URL | Side panel detects active tab and offers a different URL; media paste must be opened in the active tab before compliant capture | Implemented; real-device proof pending. |
| News/article passage plus metadata | Content script captures selected text and OG/title/author/publication; API preserves the passage and validates metadata | Exact passage/metadata passes through connected Vercel/Supabase; browser selection action pending. |
| Podcast 90-second audio segment | Tab audio capture, audio-only WebM encode, direct upload, trusted no-video/duration validation | A generated 61.016s audio-only artifact passes through deployed signing, upload, inspection, and publication; real podcast capture pending. |
| Public landing page | `/a/:id` returns crawler-visible per-annotation metadata and hydrates the React detail page | Connected deployed crawler request returns unique title/description/canonical/OG/Twitter tags; third-party validator pending. |

## Baseline snapshot before new migrations

- The reviewed branch began at `ce52d0d`. Production was not changed.
- Production Supabase had recently been resumed. A read-only check on 2026-08-01 showed the project `ACTIVE_HEALTHY`, `/api/feed` recovered with HTTP 200 and 55 durable annotations, and the retained users/most-viewed/detail APIs responding. The current production build still returned 404 for `/api/health` and `/api/ready`; those routes exist only in this branch until approved deployment. Its legacy `/api/users` response also still exposes internal `authId`, which the release candidate redacts.
- Existing migration history was preserved verbatim as `0001` through `0010`. `0001` explicitly disabled RLS on users, follows, annotations, comments, and claims. Later migrations added bookmarks, views, claim fields, votes/threads, thumbnail fields, and the original `clip-media` bucket.
- The original code initialized the serverless module through request/startup demo seeding, accepted caller identity fields, used a public-key persistence path, returned clipping command plans, accepted base64/data-URL media, trusted client media claims, and had no CI.
- Production data assumptions: seeded IDs are referenced by marketing/demo content; user/annotation rows must be preserved; annotation/media URLs may include legacy demo assets; there is no safe authorization to rewrite or delete production content during hardening.
- The live target's exact policy/bucket export has not been mutated. Before applying the additive migrations, capture a Supabase dashboard/CLI schema-only backup and row counts for all core tables, `storage.buckets`, and `storage.objects` in project `cpqmjujhcwpavrsjadjz`.
- A hosted read-only inventory confirms migrations `0011`–`0013` are not yet present: `media_uploads`, `rate_limit_buckets`, and `claim_events` are absent. Storage currently has only the public `clip-media` bucket, with zero objects; `commentary-audio` does not exist. This is evidence about current state, not authorization to migrate it.
- Supabase Auth currently enables Google, X OAuth 2.0, and the backend email provider. Google and X authorization endpoints redirect to their real providers, and two historical provider identities exist, but this does not prove a current callback, refresh, logout, or extension journey. Email must be disabled before release to match the Google/X-only contract.

## Before/after findings

| Area | Baseline | Release candidate |
|---|---|---|
| Cold start | Module readiness could be permanently rejected by seeding/provider failure | Route registration is synchronous; seed is explicit; liveness is dependency-free; readiness times out and reports components |
| Persistence | Silent memory fallback possible | Memory exists only in development/tests; production returns explicit 503 when durable storage/config is missing |
| Identity | Body/query actor IDs trusted | Supabase token verified on every protected request; actor always derived from the token; internal OAuth subject redacted |
| Database access | RLS disabled; anon-key server path | Service-role API path; forced RLS; all direct product-table privileges revoked from `anon` and `authenticated` |
| Media | Plans/base64/data URLs/client claims | Real tab artifact; direct signed upload; server parses container/duration/tracks/dimensions/bytes; processing/failed annotations stay private and invalid objects are deleted |
| Views | Read/modify/write race | Service-only atomic RPC |
| Abuse | Broad CORS and no limits | Exact production/preview/extension origins; atomic distributed per-endpoint limits; 429/Retry-After; bounded cleanup |
| Claims | Submission and email only | Honeypot/rate limit, private contact data, delivery result, immutable event trail, moderator-only review RPC/API |
| Sharing | Generic client-rendered metadata | Per-annotation server HTML, canonical production URL, unique OG/Twitter tags |
| Dependencies/build | Seven advisories; 542KB client chunk | Zero npm advisories; split 348KB app/146KB React/37KB data/12KB icon chunks |
| Quality | No meaningful tests/CI | Node unit/integration suite, migration/extension/package/security checks, GitHub Actions |
| Privacy | Inconsistent support domain; email-only deletion request | Singular support domain; in-product confirmed account/media/OAuth deletion; retention language |

## Security model

1. Supabase Auth is the identity provider; only Google and Twitter/X provider values are accepted.
2. Browser and extension send an access token in `Authorization: Bearer`. The API calls Supabase `getUser` and maps the verified `(provider, auth subject)` to the app user. Refresh tokens are accepted only by the refresh endpoint and are never logged. The website accepts extension OAuth mode only for the ID cryptographically derived from the committed manifest key, sends the session only to that pinned recipient, expires the handoff marker after ten minutes, and retains a bounded retry path if the extension is temporarily unreachable.
3. Product writes use the service role inside Vercel. The service credential never enters a `VITE_*` value, client bundle, extension package, response, or documentation value.
4. RLS is enabled and forced on all product tables. Direct table privileges are revoked for `anon` and `authenticated`, preventing clients from bypassing API validation, media inspection, and abuse controls. Claims, media intents, rate buckets, and claim events are server-owned.
5. Owner checks precede delete/media attachment. Private processing/failed annotations return 404 to non-owners and do not appear in feeds/profiles.
6. CORS permits only the two production site origins, exact runtime preview origins, and published extension `eaealcbiidjigfndjchchbnjdjicbajb`. Security headers apply to API/static responses; API CSP is `default-src 'none'`.
7. Rate-limit subjects are salted SHA-256 hashes of the client address. Endpoint families have isolated atomic buckets in Supabase and return 429 with standard retry headers. Health/readiness bypass the limiter so monitoring survives limiter/database incidents.
8. Structured request logs contain request ID, method, path, status, and duration only—no body, query, IP, token, email, or response payload.

## Clipping architecture

```text
active source tab
  → side-panel start/end selection (reject >90s)
  → background seeks/pauses and requests tabCapture stream
  → offscreen document records the exact real-time interval
      video: canvas → 240px high, 15fps, VP8/Opus WebM
      podcast: audio-only Opus WebM
  → API creates owner/kind/UUID signed-upload intent
  → extension PUTs Blob directly to Supabase Storage
  → API downloads object and parses EBML/WebM metadata
  → reject/delete invalid size, duration, tracks, container, or dimensions
  → attach verified object and atomically expose annotation as public/ready
```

The approach uses Chrome-supported [`tabCapture`](https://developer.chrome.com/docs/extensions/reference/api/tabCapture) and offscreen documents and Supabase signed upload URLs. It does not download protected source files, bypass DRM/auth/paywalls, invoke `yt-dlp`, or represent an iframe as a generated clip. Because capture is real time, a 61-second selection takes about 61 seconds; the UI exposes capturing/uploading/failure states. A pasted media URL must be open and playable in the active tab so the user remains the source of the captured playback.

Orphan/replacement controls:

- owner/kind/UUID object paths and non-upserting signed intents;
- replaced same-kind attachments delete the prior object/intent;
- annotation/account deletion removes corresponding objects;
- invalid finalization deletes the object and records failure;
- daily authenticated Vercel Cron removes pending/ready/failed/orphaned uploads older than 24 hours.

## Additive migrations and rollback

Migrations are not applied by the build and have not been applied to production in this branch.

1. `0011_security_hardening.sql` enables/forces RLS, revokes direct privileges, adds the auth lookup/indexes, and creates the atomic view RPC.
2. `0012_media_uploads.sql` converges bucket MIME/size limits and adds server-owned media upload intents/audit metadata.
3. `0013_rate_limits_claim_audit.sql` adds stable-key rate buckets, atomic consume RPC, claim event trigger/table, and moderator RPC.

Preflight on a branch/test database:

- schema-only backup plus row counts and duplicate `(auth_provider, auth_id)` check;
- inventory bucket settings and object counts;
- apply in order; verify policies/grants with `pg_policies` and `information_schema.role_table_grants`;
- use the anon key to prove SELECT/write denial; use two real users to prove API 401/403 behavior;
- sign/finalize one video, podcast, and commentary object; exercise cleanup on disposable orphan data.

Rollback order if preview validation fails:

- stop preview traffic first;
- `0013`: revoke/drop `moderate_claim`, trigger/function, `claim_events`, `consume_rate_limit`, and `rate_limit_buckets` after exporting audit rows;
- `0012`: stop uploads, export `media_uploads`, remove only disposable preview objects, then drop its policies/table; restore prior bucket settings from the captured inventory;
- `0011`: keep RLS/direct privilege revocation in place if at all possible. Roll back only the new RPC/policies/indexes after restoring an equivalent safe policy set. Never disable RLS on a live project merely to recover availability.

The application rollback is the prior Vercel deployment. Because the release changes server credential requirements, roll back code and database grants as one reviewed operation—never expose the service role to a prior client path.

## Automated evidence

Local release command: `cd web && npm run ci`.

Current checks implemented:

- type-checking;
- API authentication/identity spoof/cross-user/privacy/account-delete tests;
- claim submission, notification audit, moderator access/status, and legacy-author log-hygiene tests;
- follow, comment/reply, vote, bookmark tests;
- 90-second/source URL validation;
- WebM 61s/240p acceptance, >240p rejection, >90s rejection, audio-only enforcement;
- extension source detection, selection word count, manifest-derived OAuth recipient pinning, forged/stale handoff rejection, capture plan, and publish-state tests;
- public-site and extension accessibility invariants, including zoom, headings, labels, modal focus, target sizing, reduced motion, and non-nested controls;
- liveness/readiness outage behavior;
- RLS/grant/storage/rate/claim migration assertions;
- per-annotation metadata escaping/canonical tests;
- limiter isolation, 429 headers, expiry, bounded-memory behavior, and stalled-provider fail-closed timing tests;
- production build, extension syntax/package contents, secret-pattern scan, and npm audit.

Latest local result (2026-08-01): the complete `npm run ci` release command passes on claim-log-hardening commit `694e287808093f38fbe53d31fc7fd89418eb805b`—TypeScript, all 37 tests, production build, extension validation, source/bundle/package secret scan, and dependency audit. `npm audit` reports zero vulnerabilities. The frontend no longer emits the >500KB chunk warning. Tailwind 3 still triggers PostCSS 8.5's generic “generated parse has no from value” warning; this comes from Tailwind's in-memory generated rules, not an imported asset. It is retained rather than downgrading below the patched PostCSS version and should be re-evaluated during a planned Tailwind 4 migration. Both the [push workflow](https://github.com/nikocallas/annotated/actions/runs/30717168038) and [pull-request workflow](https://github.com/nikocallas/annotated/actions/runs/30717169999) pass on that exact commit.

Isolated production-mode integration evidence against a clean local Supabase stack:

- all 13 migrations apply from zero; ten product tables have forced RLS, 21 policies exist, and direct `anon` product-table writes return 401 with zero direct client mutation grants;
- the atomic distributed limiter allows requests one and two and rejects request three for a two-request bucket;
- two provider-shaped GoTrue sessions synchronize through the real API while keeping OAuth subject IDs private; anonymous/spoofed/cross-owner mutations return 401/403;
- a 61.008s 426×240 video+audio WebM, 61.008s audio-only podcast WebM, and 61.008s commentary-audio WebM complete signed direct upload and trusted finalization; pending objects use unlinked owner/UUID paths, annotations remain non-public until attachment, and invalid objects are deleted;
- an over-90s publish is rejected with no annotation row created; an article preserves the exact selected passage and source metadata while attaching verified audio commentary;
- stale-media maintenance removes both the disposable Storage object and upload-intent row (`scanned: 1`, `removed: 1`, `failures: 0`);
- confirmed account deletion removes the app user, media row, Storage object, and GoTrue identity; a lowercase confirmation attempt returns 400 first.

No production migration or write was used for this evidence.

## Manual/real-device QA evidence

Rows distinguish deployed artifacts and recorded browser observations from the remaining physical-device/provider work.

| Journey | Evidence | Result |
|---|---|---|
| Google web OAuth | Hosted authorization endpoint initiates and a historical Google identity exists; current preview callback/refresh/logout pending | Partial |
| X web OAuth | Hosted X OAuth 2.0 authorization endpoint initiates and a historical X identity exists; current callback/email behavior pending | Partial |
| Google/X extension handoff + refresh | Exact production-origin ping and isolated valid/invalid bundle handoff pass in Chrome; website recipient is pinned to the manifest-derived ID and forged IDs render normal web sign-in; real provider token/refresh pending | Partial |
| 61-second YouTube capture | Generated 61.016s 426×240 video+audio WebM completed the connected deployed media path | Partial (physical Chrome/YouTube capture pending) |
| 61-second podcast capture | Generated 61.016s audio-only WebM completed the connected deployed media path | Partial (physical Chrome/podcast capture pending) |
| Article exact passage | Exact passage and metadata passed through connected Vercel/Supabase; published detail renders correctly in browser | Partial (browser selection action pending) |
| Text/audio commentary preview, replace, publish | Connected deployed text/commentary media passes; isolated Chrome fake-device recording produces a valid 2.209s Opus WebM and closes offscreen context | Partial (physical microphone publish pending) |
| Source link + File a claim | Production canonical detail and 390×844 mobile detail show both controls; hardened production build renders them on article/video/podcast details backed by the migrated database | Pass |
| Claim recorded/notified/reviewed | Hardened rendered dialog submits; migrated database records `received` and notification-attempt events; anonymous moderator access is 401; allowlisted moderator advances the audit/status to `reviewing` | Partial (real Resend inbox delivery pending) |
| Feed/profile/follow/comment/reply/vote/bookmark | Production feed loads 50+ cards without console errors or horizontal overflow; two provider-shaped actors complete deployed retained mutations | Pass for server behavior; provider-browser UI remains in the OAuth row |
| OG/canonical validators | Connected deployed crawler request returns unique annotation title/description/canonical/OG/Twitter metadata | Partial (third-party validator pending because preview is protected) |
| Cold start and simulated provider recovery | Connected Vercel health survives the database pause, readiness/feed fail closed within bounds, and the same deployment recovers after unpause | Pass |

Latest isolated Vercel preview for claim-log-hardening commit `694e287808093f38fbe53d31fc7fd89418eb805b`: `https://annotated-2kq85i89u-laymen.vercel.app` (`dpl_CSjzwQPESd5DuCG7KqunZhSXXSbz`). The deployment is Ready. Through Vercel's authenticated preview bypass, `/api/health` returns 200 with request ID, HSTS, API CSP, and `Cache-Control: no-store`; `/api/ready` returns the expected component-by-component 503 because the standard Preview environment lacks complete Supabase/OAuth/notification/moderation/maintenance configuration; and durable routes fail closed rather than serving memory/demo data. The official extension origin receives a 204 preflight with its exact `Access-Control-Allow-Origin`, while `https://evil.example` receives 403 with no allow-origin header. The deployed `/downloads/annotated-extension.zip` exactly matches the validated CWS artifact at SHA-256 `d8d339d8173091ccf775bcb8486aa069fc24c33df5fd58bc0d44b88968ce50ea`. Vercel deployment protection intentionally redirects unauthenticated public requests to team SSO.

Rendered login regression evidence on the production build for `f7f38c74225e7a9689a5ded016638fdb4f0dbded`: `/login?extension=1&extensionId=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` renders the ordinary “Sign in” journey, while the manifest-derived `eaealcbiidjigfndjchchbnjdjicbajb` renders “Sign in to the extension.” The automated test independently derives the ID from the manifest public key and proves that malicious, malformed, stale, and future handoff records are rejected.

Connected production-runtime evidence for outage-hardening commit `06a6b52628b9a3023b8047704e1cbba341c799da`: protected Vercel deployment `https://annotated-87lzxt8n6-laymen.vercel.app` (`dpl_xyHjMnzLbLA9jsK56xx8t2cisy3M`) was connected through a short-lived encrypted tunnel to the disposable, fully migrated local Annotated Supabase stack. This did not use production, the unrelated Laymen project, or mock/in-memory persistence. Healthy `/api/ready`, feed, users, most-viewed, annotation detail, and crawler routes returned 200 with 55 durable annotations; readiness reported every configuration-level component `ok` (no Resend message was sent); rate-limit rows were consumed atomically; API user JSON contained no `authId`; and direct tunneled anon REST insertion returned 401 with zero rows created. After recording the evidence, the tunnel and its temporary Vercel alias were removed and only the Annotated local stack was stopped with its data volume preserved; the unrelated Laymen stack remained running.

The same deployment was tested through a deliberate database pause and recovery. Health stayed 200 in 0.2s; readiness returned a structured 503 in 4.1s; the first version exposed a real defect when feed exhausted the Vercel deadline with 504; commit `06a6b52` added a 2s abort plus a 2.5s enforcement bound and regression test; the redeployed feed then returned the intended structured 503 in 2.1s. After unpause, the same deployment recovered immediately to readiness/feed 200. No HTTP 500/504 remained in the fixed deployment logs.

Two provider-shaped GoTrue identities then synchronized through the deployed API and completed actor-spoof rejection, cross-user delete 403, article publication with the exact passage, follow, comment, reply, vote, bookmark, and account deletion. A 61.016s 426×240 video+audio WebM, 61.016s audio-only podcast WebM, and 2.508s recorded-commentary WebM each completed deployed sign → direct Storage PUT → server download/inspection → attach/publish. Account cleanup removed both identities, all probe annotations/media rows, and all Storage objects. These are real generated WebM artifacts through the connected production runtime, but they are not mislabeled as physical Chrome/YouTube/podcast/microphone acceptance.

Connected rendered-UI and moderation evidence for commit `694e287808093f38fbe53d31fc7fd89418eb805b`: the production build ran against the restored, fully migrated local Annotated Supabase volume and rendered all 55 durable feed records. Article, video, and podcast detail pages each showed a real source link and the shared “File a claim” control; the article preserved its exact passage and metadata. The actual claim dialog submitted an anonymous disposable claim, displayed the saved-for-review state, and produced `received` plus `notifications_dispatched` audit events. Unauthenticated moderator listing returned 401; a disposable Google-shaped GoTrue moderator session synchronized without exposing `authId`, listed the private audit trail, advanced the claim to `reviewing`, and created the corresponding event. The account and claim were deleted afterward, leaving zero probe auth users, app users, or claims. No email was represented as delivered: its audit explicitly recorded `not_configured`, so real Resend inbox proof remains open. A second post-fix claim request against the rebuilt production bundle emitted only the structured request summary—legacy seed subjects no longer cause an SDK validation stack—and was also removed before the local stack was stopped.

Isolated Chrome runtime evidence (Chrome for Testing 151.0.7922.71, fresh temporary profiles): unpacked 1.8.0 starts with the exact public Store ID, declared permissions/hosts, empty storage, and no sidebar console errors or horizontal overflow. After the 30-second MV3 idle window removes both sidebar and worker contexts, reopening the sidebar restarts the worker and renders cleanly. The production `www.annotatedextension.com` origin receives the read-only install ping (`ok: true`, version 1.8.0); `example.com` has no external messaging surface. The allowed production origin rejects an invalid bundle, accepts an isolated placeholder bundle, stores only `annotatedAuth` (not legacy `annotatedUser`), and the temporary storage is then cleared. With Chrome's fake media device, real offscreen `MediaRecorder` start/stop produces a 6,397-byte, 2.209s `audio/webm;codecs=opus` artifact and leaves zero offscreen contexts. This proves runtime wiring and lifecycle behavior without treating synthetic media or placeholder auth as provider/device acceptance.

Current external-browser diagnostics find Google Chrome 150 running, the ChatGPT browser bridge installed and enabled in Profile 2, and its native-host manifest correct. The browser binding is not connected, however; the browser-control procedure requires owner permission before opening the needed Profile 2 window. That is the smallest action that unlocks the physical real-source capture matrix.

Accessibility browser evidence for the exact candidate source at `772c7144136fec5c41a4ceab08c4ca173bcffa99`: axe 4.12 reports zero WCAG 2.0/2.1 A/AA violations on landing, feed, login, support, privacy, terms, signed-out extension, signed-in clip view, and the claim dialog in light and dark themes. Keyboard traces show visible 2px focus, 44px primary targets, and no hidden recorder controls in the tab order. The claim dialog receives initial focus, wraps Tab and Shift+Tab, closes with Escape, and restores focus to the File a claim button. Public routes at 390×844 and the side panel at 378px show no document-level horizontal overflow; the only intentionally offscreen support elements are the non-focusable bot honeypot. The website viewport permits zoom and both surfaces honor reduced-motion preferences.

The Annotated Supabase organization is on the Free plan and exposes only the `main` branch. A preview branch was unavailable (HTTP 402), and a disposable third free project in the exact Annotated organization was rejected by Supabase's active-project limit. Nothing was created or changed in either attempt, and no unrelated project was paused or modified.

## Acceptance gates

| # | Gate | Current result |
|---:|---|---|
| 1 | Preview survives cold starts/temporary DB failure | Pass: connected Vercel stays live, fails ready/feed closed within bounds, then recovers on the same deployment |
| 2 | Core feed/detail APIs return durable data | Pass: connected migrated Supabase preview returns 55 durable annotations plus feed/detail/users/most-viewed |
| 3 | Anonymous mutations return 401 | Pass in integration suite and connected deployed API |
| 4 | Spoofed actor IDs have no authority | Pass in integration suite and connected two-actor journey |
| 5 | Cross-user mutation/deletion returns 403 | Pass in integration suite and connected two-actor journey |
| 6 | Direct anonymous Supabase writes denied | Pass through the encrypted external Supabase route: 401 and zero inserted rows |
| 7 | Google and X work on site and extension | Both hosted provider authorization endpoints initiate; historical provider identities and pinned extension recipient are proven; current callbacks and refresh remain pending |
| 8 | Real 61s YouTube → verified 240p | Generated 61.016s/240p artifact passes the connected deployed pipeline; real YouTube device capture pending |
| 9 | >90s rejected before publication | Pass in extension/API tests |
| 10 | Real podcast → bounded audio artifact | Generated 61.016s audio-only artifact passes the connected deployed pipeline; real podcast device capture pending |
| 11 | Article publishes exact selection + metadata | Exact passage/metadata passes through connected Vercel/Supabase; browser selection action pending |
| 12 | Text and recorded audio commentary work | Connected deployed text plus verified WebM commentary pass; physical microphone publish pending |
| 13 | Source link and File a claim on every page | Pass on retained production detail in desktop/mobile browser and hardened article/video/podcast details backed by the migrated database |
| 14 | Claim submitted, recorded, notified, reviewed | Partial: rendered submission, durable record, notification-attempt audit, scoped moderator listing, and status/event review pass; real Resend delivery pending |
| 15 | Retained social behavior works | Pass through connected Vercel/Supabase with two verified actors; provider-browser UI remains part of gate 7 |
| 16 | Per-annotation canonical/OG works in validators | Connected crawler HTML pass; third-party validator pending because the preview is protected |
| 17 | Typecheck/tests/build/CI/package pass | Pass: full local CI has 37 tests, both hosted workflows pass on the exact code commit, and deployed/download/CWS packages are byte-identical |
| 18 | Zero high/critical dependency findings | Pass; npm audit is zero total |
| 19 | No service-role/secret leakage | Pass: source, built bundle, packages, PR diff, and full repository history scans are clean; CI now fetches full history and repeats the guard |
| 20 | Vercel smoke test has no new runtime errors | Pass on connected critical API/media/social/outage journey; fixed deployment has no HTTP 500/504 logs |
| 21 | Minimal versioned CWS package ready | 1.8.0 validates and loads with exact public ID/hosts; clean worker suspend/restart and synthetic-mic recording pass; real-device/privacy listing review pending |
| 22 | Lovable checklist line-by-line | Matrix above plus final accessibility browser evidence; provider/manual rows remain open |

## Remaining risks and owner/provider actions

These are the smallest external actions required; they do not authorize production mutation.

1. Enable a durable Supabase preview branch (Pro plan) or temporarily free one allowed project slot in the exact Annotated organization; then capture the preflight export and apply `0011`–`0013` only there. The short-lived connected-tunnel proof now covers migration, serverless, outage/recovery, RLS, social, media, and crawler behavior, but a durable hosted branch is still required for real provider callbacks and the final release rehearsal.
2. Remove or rotate the existing production-like encrypted secrets in Vercel Preview before connecting a branch. Then configure a complete matched Preview set: server/publishable branch Supabase values, branch-safe Resend credentials, singular support inbox, owner `MODERATOR_AUTH_IDS`, `CRON_SECRET`, `RATE_LIMIT_SALT`, and the exact preview OAuth/CORS origin.
3. Disable Supabase email sign-in, retain only Google and X OAuth 2.0, and add the exact approved preview callback allowlist. X must return the identity data Supabase requires; if the provider account cannot expose email, document that provider limitation rather than claiming success.
4. Verify the Resend sender/domain and inbox access, then retain filer/poster/support delivery evidence.
5. Open a controllable Chrome window for Profile 2, load the pinned-ID unpacked extension 1.8.0, grant microphone/tab capture through normal browser prompts, and run the manual matrix. Installed Store version 1.7.3 was detected read-only; it was not replaced.
6. Approve production migration/deployment only after every acceptance row is proven. Approve the separate Chrome Web Store upload only after production is stable.

## Final production deployment checklist

- [ ] Draft PR reviewed; CI green; no unexpected generated/untracked files.
- [ ] Preview URL and commit SHA recorded; Vercel logs clean for critical journey.
- [ ] Database/schema/bucket backup and rollback owner assigned.
- [ ] `0011`–`0013` proven in branch/test DB; anon and two-user authorization probes pass.
- [ ] Preview `/api/health` 200 and `/api/ready` 200 with every named check `ok`.
- [ ] Google/X site + extension OAuth, refresh, logout, and account deletion pass.
- [ ] Real YouTube/podcast/article/commentary artifacts pass trusted validation.
- [ ] Claim emails and moderator audit/status path pass.
- [ ] OG/canonical preview validators pass on a real annotation.
- [ ] Support, privacy, terms, retention, deletion, and singular support domain reviewed.
- [x] Keyboard, contrast, zoom/reflow, reduced-motion, and claim-modal accessibility audit passes on the exact release candidate.
- [ ] Explicit owner approval obtained for production migration/deploy.
- [ ] Apply migrations, deploy exact reviewed SHA, smoke test, then observe Vercel logs/readiness before declaring stable.

## Chrome Web Store release checklist

- [x] Manifest V3; version incremented to 1.8.0.
- [x] Public Web Store key pins unpacked QA builds to published ID `eaealcbiidjigfndjchchbnjdjicbajb`; OAuth handoff and API CORS therefore exercise the same origin used after release.
- [x] Minimum Chrome version is 116, matching offscreen consumption of a service-worker `tabCapture` stream ID; bounded offscreen progress messages protect 61–90s captures from the 30s worker idle window.
- [x] No remote executable code or remote stylesheet; no eval; package contains no maps, docs, env files, build directories, or secrets.
- [x] Host permissions limited to the two Annotated production origins plus the exact `cpqmjujhcwpavrsjadjz.supabase.co` media-storage origin required for signed direct uploads; OAuth messaging remains restricted to the Annotated origins.
- [x] `sidePanel`: primary product surface.
- [x] `activeTab` + `scripting`: user-invoked source metadata, selection, and media control on the active page only.
- [x] `tabs`: active-tab discovery/navigation events and opening sign-in/result/settings tabs.
- [x] `storage`: extension-owned OAuth session and minimal preference state.
- [x] `offscreen`: microphone recording and tab-stream MediaRecorder DOM context required by MV3 service workers.
- [x] `tabCapture`: user-selected source playback artifact; no background or unattended capture.
- [ ] Real-device install/update test, permission-prompt screenshots, and 90-second stability run.
- [ ] Web Store privacy disclosure updated for OAuth tokens, active-tab content, tab audio/video, microphone, user content, and Supabase/Vercel/Resend processing.
- [x] Ready-to-paste 1.8.0 description, single-purpose statement, permission justifications, and disclosure review drafted in `docs/chrome-web-store-listing.md`.
- [ ] Listing screenshots/demo/privacy URL/support URL reviewed in the owner dashboard; remove the live listing's “early version” language.
- [x] Download and CWS builders strip platform metadata and produce the same 1.8.0 bytes with a root manifest; current candidate SHA-256 `d8d339d8173091ccf775bcb8486aa069fc24c33df5fd58bc0d44b88968ce50ea`.
- [ ] Production endpoint/migrations stable and explicit owner approval obtained before upload/publish.

## Go/no-go

**Current recommendation: NO-GO for production resubmission.** The release candidate materially closes the known architecture/security gaps and now passes local CI, exact-commit hosted CI, connected durable serverless/data/social/media/crawler tests, rendered feed/detail/claim/moderation tests, and database outage/recovery. The remaining acceptance work is external: a durable provider-connected preview, current Google/X callback/refresh/logout and extension handoff, physical Chrome media/selection/microphone journeys, real Resend delivery, third-party crawler validators, owner-dashboard privacy/listing review, and explicit approval for production migration/deployment. The branch should remain active until those rows are proven or an exact external limitation is documented.

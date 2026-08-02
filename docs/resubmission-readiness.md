# Annotated resubmission readiness

Status: **main database hardened; reviewed release candidate live and healthy in Vercel Production; physical-extension and Store review pending**

Branch: `resubmission-hardening`

Baseline: `ce52d0d3ccc6cf961d4b67330ae3527f8fe6116a`

Target repository: `nikocallas/annotated`

Target Vercel project/team: `prj_wBKfZTInfsIqijLmTcOiYAOmrqdk` / `team_E5lJkCrPv1wThkceUCDfGtXS`

Target Supabase project: `cpqmjujhcwpavrsjadjz` only
Last updated: 2026-08-01

This document is the running evidence record for the polish/resubmission release. “Implemented” means code and local automated evidence exist. “Proven” is reserved for behavior observed in a production-like preview or on a real Chrome device. The owner authorized the exact main Supabase migration and Vercel Production deployment on 2026-08-01, with standing authorization for future Annotated deployments. Merge and Chrome Web Store upload/submission remain separate actions.

## Authoritative Lovable checklist

The requirements page describes Annotated as a Chrome sidebar that clips/highlights web media, adds text or audio commentary, publishes source-linked landing pages, and supports a public follow/comment feed. Its three non-negotiables are the sidebar as primary surface, a visible “File a claim” action on every annotation page, and an original-source link. Its source matrix is YouTube (up to 90 seconds at 240p), news/article text plus metadata, and podcasts (up to 90 seconds of audio).

| Lovable line | Release-candidate implementation | Status/evidence |
|---|---|---|
| Sidebar Chrome extension is the primary surface | MV3 `side_panel`; active-page/pasted-source creation; no web creation form | Implemented; package validation passes. Real-device run pending. |
| Max clip size: 90 seconds | Side panel and shared capture plan reject >90s; API Zod/range validation; database constraint; trusted WebM inspection allows only container tolerance | Implemented; unit/API tests cover 90s/91s. |
| Video downgraded to 240 pixels (<480p) | Tab stream is drawn to a 240px-high 15fps canvas, encoded WebM, then dimensions are parsed server-side | A generated 61.016s 426×240 artifact passes through deployed signing, upload, inspection, and publication; real YouTube capture pending. |
| Every clip links to its original source URL | Source URL is required HTTPS metadata and appears in feed/detail/source credit; canonical annotation page remains separate | Pass in production browser detail/mobile checks and connected durable detail/crawler data. |
| Visible “File a claim” on every annotation | Detail page and extension detail both render the action; API accepts anonymous, validated claims | Pass in production browser detail/mobile checks; live notification proof pending. |
| Account creation via X or Google only | Supabase PKCE OAuth only; no password/demo identity; API verifies access token on protected operations; extension handoff is pinned to the manifest-derived Store ID | Google and X web callbacks, authenticated profile identity, and logout pass in real Chrome; production readiness reports OAuth configured. Real 1.8.0 extension handoff and explicit refresh proof remain pending. |
| Public social feed with follow + comment | Feed, profiles, follow/unfollow, threaded comments, votes, bookmarks | Public UI passes desktop/mobile checks; two provider-shaped actors pass the full retained mutation set through connected Vercel/Supabase. |
| Commentary supports text and recorded audio | Text plus offscreen microphone recording, preview/discard/replace, signed upload and inspection | Generated commentary audio passes through the deployed media path and fake-device Chrome recording passes; physical microphone publish pending. |
| Pick current source or paste URL | Side panel detects active tab and offers a different URL; media paste must be opened in the active tab before compliant capture | Implemented; real-device proof pending. |
| News/article passage plus metadata | Content script captures selected text and OG/title/author/publication; API preserves the passage and validates metadata | Exact passage/metadata passes through connected Vercel/Supabase; browser selection action pending. |
| Podcast 90-second audio segment | Tab audio capture, audio-only WebM encode, direct upload, trusted no-video/duration validation | A generated 61.016s audio-only artifact passes through deployed signing, upload, inspection, and publication; real podcast capture pending. |
| Public landing page | `/a/:id` returns crawler-visible per-annotation metadata and hydrates the React detail page | Connected deployed crawler request returns unique title/description/canonical/OG/Twitter tags; third-party validator pending. |

## Main Supabase baseline and migration record

- The reviewed branch began at `ce52d0d`. After review and explicit approval, the hardened branch was rebuilt with Production-only settings and promoted to the canonical Annotated domains.
- Production Supabase is `ACTIVE_HEALTHY`. After deployment, `/api/health` and `/api/ready` return HTTP 200, every readiness component reports `ok`, `/api/feed` returns all 55 durable annotations, retained users/most-viewed/detail APIs respond, and `/api/users` contains no internal `authId` fields.
- A second read-only recovery check after the owner's latest unpause returned `/api/feed` 200 with the same 55 durable annotations, `/api/users` 200 with six users, and `/api/feed/most-viewed` 200. Vercel reported no production 5xx responses in the preceding six hours. Supabase's management connector was not authorized for this session, so no dashboard mutation or migration was attempted.
- Existing migration history was preserved verbatim as `0001` through `0010`. `0001` explicitly disabled RLS on users, follows, annotations, comments, and claims. Later migrations added bookmarks, views, claim fields, votes/threads, thumbnail fields, and the original `clip-media` bucket.
- The original code initialized the serverless module through request/startup demo seeding, accepted caller identity fields, used a public-key persistence path, returned clipping command plans, accepted base64/data-URL media, trusted client media claims, and had no CI.
- Production data assumptions: seeded IDs are referenced by marketing/demo content; user/annotation rows must be preserved; annotation/media URLs may include legacy demo assets; there is no safe authorization to rewrite or delete production content during hardening.
- Before mutation, a schema-only export, exact hosted migration history, core row counts, policies, grants, and Storage bucket inventory were captured for project `cpqmjujhcwpavrsjadjz`. The live history contained 13 earlier timestamped migrations and dashboard-authored legacy policy names, so `0011` was made convergent by explicitly dropping those names; a regression test locks this production-drift case.
- After the owner's explicit instruction to use the established main Annotated project, the four reviewed migrations were applied as new timestamped hosted entries corresponding exactly to `0011`–`0014`. Postflight shows 10 forced-RLS tables, 21 intended policies, zero legacy policies, zero direct `anon`/`authenticated` product-table mutation grants, both controlled media buckets, and all service-only RPCs. Anonymous REST and service-only RPC probes return 401; rate-limit, claim audit/moderation, and simultaneous atomic media-attachment probes pass, and all disposable probe data was removed.
- Existing data was preserved: postflight counts were six users, 55 annotations, five follows, seven comments, one retained claim, and zero bookmarks/votes/new hardening rows before disposable probes. No unrelated Supabase project was contacted or modified.
- During the controlled cutover, the hardened database made the legacy anonymous-key Vercel server fail closed. Deploying the reviewed service-role server restored the public APIs without reopening anonymous table access.
- Supabase Auth now enables Google and X OAuth 2.0 only. Email, phone, and anonymous sign-ups are disabled on the exact main project; a direct email signup returns 400 `Email signups are disabled`. Google and X web callbacks, authenticated profile identity, and logout passed in real Chrome; real 1.8.0 extension handoff and explicit token-refresh proof remain open.

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
2. Browser and extension send an access token in `Authorization: Bearer`. The API calls Supabase `getUser` and maps the verified `(provider, auth subject)` to the app user; simultaneous first-login callbacks converge on the row that wins the database uniqueness race instead of failing the sign-in. Refresh tokens are accepted only by the refresh endpoint and are never logged. The website accepts extension OAuth mode only for the ID cryptographically derived from the committed manifest key, sends the session only to that pinned recipient, expires the handoff marker after ten minutes, and retains a bounded retry path if the extension is temporarily unreachable.
3. Product writes use the service role inside Vercel. The service credential never enters a `VITE_*` value, client bundle, extension package, response, or documentation value.
4. RLS is enabled and forced on all product tables. Direct table privileges are revoked for `anon` and `authenticated`, preventing clients from bypassing API validation, media inspection, and abuse controls. Claims, media intents, rate buckets, and claim events are server-owned.
5. Owner checks precede delete/media attachment. A row-locked database function makes verified uploads single-use, serializes same-annotation replacement, and commits the winning URL/publication state atomically; superseded objects become retryable orphans only after the annotation points at the winner. Private processing/failed annotations return 404 to non-owners and do not appear in feeds/profiles.
6. CORS permits only the two production site origins, exact runtime preview origins, and published extension `eaealcbiidjigfndjchchbnjdjicbajb`. The packaged extension pins authenticated API and refresh traffic to `https://annotatedextension.com`; there is no query/runtime endpoint override that could redirect tokens. Security headers apply to API/static responses; API CSP is `default-src 'none'`.
7. Rate-limit subjects are salted SHA-256 hashes of the client address resolved by Express across its configured trusted-proxy boundary; raw leftmost forwarded prefixes are never accepted as client identity. Endpoint families have isolated atomic buckets in Supabase and return 429 with standard retry headers. Health/readiness bypass the limiter so monitoring survives limiter/database incidents.
8. Structured request logs contain request ID, method, path, status, and duration only—no body, query, IP, token, email, or response payload. Claim-notification failures likewise emit only a structured event name and claim ID, never raw provider errors.

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

## Applied additive migrations and rollback

Migrations are not applied by the build. After schema/history preflight and an exact dry run, the owner authorized applying these four migrations to main project `cpqmjujhcwpavrsjadjz` on 2026-08-01. The CLI applied only the four reviewed timestamped files; hosted and local histories now agree on 17 entries.

1. `0011_security_hardening.sql` enables/forces RLS, revokes direct privileges, adds the auth lookup/indexes, and creates the atomic view RPC.
2. `0012_media_uploads.sql` converges bucket MIME/size limits and adds server-owned media upload intents/audit metadata.
3. `0013_rate_limits_claim_audit.sql` adds stable-key rate buckets, atomic consume RPC, claim event trigger/table, and moderator RPC.
4. `0014_atomic_media_attachment.sql` adds the partial uniqueness invariant and row-locked attachment/publication RPC.

Completed main-project preflight and postflight:

- schema-only backup plus row counts and duplicate `(auth_provider, auth_id)` check;
- inventory bucket settings and object counts;
- apply in order; verify policies/grants with `pg_policies` and `information_schema.role_table_grants`;
- use the anon key to prove SELECT/write/RPC denial and the service role to prove the controlled server paths;
- exercise distributed rate limiting, claim receipt/moderation/event history, and two simultaneous media attachments; confirm one attached winner, one orphan, cross-annotation reuse rejection, and complete disposable-data cleanup.

Rollback order if production validation fails:

- stop production traffic first;
- `0014`: revoke/drop `attach_media_upload` and its partial unique index only after stopping attachment traffic and confirming no duplicate attached `(annotation_id, kind)` rows;
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
- limiter isolation, forwarded-prefix spoof resistance, 429 headers, expiry, bounded-memory behavior, and stalled-provider fail-closed timing tests;
- finite/bounded feed and moderator query parsing plus claim-notification log-redaction tests;
- atomic single-use media attachment, lock ordering, publication, and server-only RPC grant assertions;
- simultaneous first-login identity synchronization and concurrent follow/bookmark/vote uniqueness-race tests;
- limiter/readiness/unexpected-storage failure injection proving raw error details stay out of logs and responses;
- production build, extension syntax/package contents, secret-pattern scan, and npm audit.

Latest local result (2026-08-02): the complete release command passes on the current code candidate under the pinned Node 22 runtime—TypeScript, all 50 tests, production build, extension validation, source/bundle/package secret scan, and zero dependency vulnerabilities. The suite now also locks the Production CSP required by the clipped YouTube player, preventing a fresh annotation page from remaining on “Loading clip…”, prevents auth-state synchronization from re-entering Supabase's session lock, and covers the compact opaque refresh-token format issued by the live Supabase project. The branch's hosted push and pull-request workflows and immutable Vercel preview are required to pass before each promotion. [Vercel-supported Node 22](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) is pinned in both the package and hosted CI because Vercel's Node 24 default reports Express's current `parseurl` dependency as an error-level `url.parse()` deprecation even on successful HTTP 200 requests; the LTS pin preserves clean operational signal without suppressing warnings globally. The frontend no longer emits the >500KB chunk warning. Tailwind 3 still triggers PostCSS 8.5's generic “generated parse has no from value” warning; this comes from Tailwind's in-memory generated rules, not an imported asset. It is retained rather than downgrading below the patched PostCSS version and should be re-evaluated during a planned Tailwind 4 migration.

Isolated production-mode integration evidence against a clean local Supabase stack:

- all 13 migrations through `0013` apply from zero; ten product tables have forced RLS, 21 policies exist, and direct `anon` product-table writes return 401 with zero direct client mutation grants;
- the atomic distributed limiter allows requests one and two and rejects request three for a two-request bucket;
- two provider-shaped GoTrue sessions synchronize through the real API while keeping OAuth subject IDs private; anonymous/spoofed/cross-owner mutations return 401/403;
- a 61.008s 426×240 video+audio WebM, 61.008s audio-only podcast WebM, and 61.008s commentary-audio WebM complete signed direct upload and trusted finalization; pending objects use unlinked owner/UUID paths, annotations remain non-public until attachment, and invalid objects are deleted;
- an over-90s publish is rejected with no annotation row created; an article preserves the exact selected passage and source metadata while attaching verified audio commentary;
- stale-media maintenance removes both the disposable Storage object and upload-intent row (`scanned: 1`, `removed: 1`, `failures: 0`);
- confirmed account deletion removes the app user, media row, Storage object, and GoTrue identity; a lowercase confirmation attempt returns 400 first.

The local integration evidence in the preceding list did not use production. The separately recorded main-project migration/postflight above used only disposable writes for functional verification and removed every probe row afterward.

Migration `0014` now also has live PostgreSQL proof on the preserved, fully migrated Annotated local database. Only Annotated's PostgreSQL container was started; no hosted project was contacted and all 12 unrelated Laymen containers stayed running. The reviewed migration created the partial unique index and service-role-only `attach_media_upload` RPC. Transactional probes proved first attachment, same-kind replacement, atomic annotation publication/URL update, superseded-upload orphaning, cross-annotation single-use rejection, and full rollback cleanup. Two simultaneous database sessions then targeted the same annotation with different ready uploads: both calls completed, but row locking serialized them to exactly one attached winner, one retryable orphan, and an annotation URL matching the winner. All disposable rows were deleted, and the Annotated container was stopped with its data volume preserved.

## Manual/real-device QA evidence

Rows distinguish deployed artifacts and recorded browser observations from the remaining physical-device/provider work.

| Journey | Evidence | Result |
|---|---|---|
| Google web OAuth | Real Chrome 150 completes the current production Google redirect, callback exchange, authenticated feed/profile identity, and logout with zero console warnings/errors; release-candidate preview callback and explicit refresh proof remain pending | Partial |
| X web OAuth | Real Chrome 150 completes a fresh current-production X OAuth 2.0 redirect, callback exchange, authenticated Niko Callas feed/profile identity, and logout. Annotated emitted no warning/error; the only warning came from YouTube's embedded Google Publisher Tag library. | Pass for current production web; release-candidate preview/extension remains in the next row |
| Google/X extension handoff + refresh | Exact production-origin ping and isolated valid/invalid bundle handoff pass in Chrome; website recipient is pinned to the manifest-derived ID and forged IDs render normal web sign-in; real provider token/refresh pending | Partial |
| Signed-out data-use disclosure | Rendered extension panel explains active-tab context, Chrome-local OAuth state, user-chosen publication, and claim contact data before authentication; direct Privacy/Terms links and light/dark interaction pass with zero console warnings/errors | Pass |
| 61-second YouTube capture | Generated 61.016s 426×240 video+audio WebM completed the connected deployed media path | Partial (physical Chrome/YouTube capture pending) |
| 61-second podcast capture | Generated 61.016s audio-only WebM completed the connected deployed media path | Partial (physical Chrome/podcast capture pending) |
| Article exact passage | Exact passage and metadata passed through connected Vercel/Supabase; published detail renders correctly in browser | Partial (browser selection action pending) |
| Text/audio commentary preview, replace, publish | Connected deployed text/commentary media passes; isolated Chrome fake-device recording produces a valid 2.209s Opus WebM and closes offscreen context | Partial (physical microphone publish pending) |
| Source link + File a claim | Production canonical detail and 390×844 mobile detail show both controls; hardened production build renders them on article/video/podcast details backed by the migrated database | Pass |
| Claim recorded/notified/reviewed | Hardened rendered dialog submits; migrated database records `received` and notification-attempt events; anonymous moderator access is 401; allowlisted moderator advances the audit/status to `reviewing` | Partial (real Resend inbox delivery pending) |
| Feed/profile/follow/comment/reply/vote/bookmark | Production feed loads 50+ cards without console errors or horizontal overflow; two provider-shaped actors complete deployed retained mutations | Pass for server behavior; provider-browser UI remains in the OAuth row |
| OG/canonical validators | Connected release-candidate crawler request returns unique annotation title/description/canonical/OG/Twitter metadata. LinkPreview.io independently fetched current production at 94/100 with a valid 1200×630 image and six platform previews, but current production still serves generic root metadata for `/a/seed-ann-niko-01`; the protected release-candidate preview cannot be handed to a third party without exposing a bypass credential. | Partial (per-annotation third-party pass requires a public candidate deployment) |
| Cold start and simulated provider recovery | Connected Vercel health survives the database pause, readiness/feed fail closed within bounds, and the same deployment recovers after unpause | Pass |

Latest isolated Vercel preview for claim-log-hardening commit `694e287808093f38fbe53d31fc7fd89418eb805b`: `https://annotated-2kq85i89u-laymen.vercel.app` (`dpl_CSjzwQPESd5DuCG7KqunZhSXXSbz`). The deployment is Ready. Through Vercel's authenticated preview bypass, `/api/health` returns 200 with request ID, HSTS, API CSP, and `Cache-Control: no-store`; `/api/ready` returns the expected component-by-component 503 because the standard Preview environment lacks complete Supabase/OAuth/notification/moderation/maintenance configuration; and durable routes fail closed rather than serving memory/demo data. The official extension origin receives a 204 preflight with its exact `Access-Control-Allow-Origin`, while `https://evil.example` receives 403 with no allow-origin header. The deployed download for that commit exactly matches its validated CWS artifact. Vercel deployment protection intentionally redirects unauthenticated public requests to team SSO.

Final code preview for `7462783a64827bfef7bbacde43c6f5f30cda8fc2`: `https://annotated-b8y7z56sz-laymen.vercel.app` (`dpl_prx582NLuCc7Ub8Ze7ai4UAGcsCT`). It is Ready; authenticated preview smoke returns `/api/health` 200 and the expected structured `/api/ready` 503 with every intentionally missing standard-Preview component named. This verifies deployment integrity, not provider readiness or authorization to promote the build.

Prior documentation-only preview for `39f66cc2a3aceedb66c6583e634ae45951c2e747`: `https://annotated-iq2fc2yv0-laymen.vercel.app` (`dpl_6AEGLY8PXSBmipXBes2ox5Q1LmJw`). The only warning/error-level runtime record is the intentional `/api/ready` 503 caused by the standard Preview environment's missing durable configuration; its structured log contains only event, storage state, error class, request ID, method, path, status, and duration. There are no unexpected runtime exceptions for that deployment.

Rendered login regression evidence on the production build for `f7f38c74225e7a9689a5ded016638fdb4f0dbded`: `/login?extension=1&extensionId=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` renders the ordinary “Sign in” journey, while the manifest-derived `eaealcbiidjigfndjchchbnjdjicbajb` renders “Sign in to the extension.” The automated test independently derives the ID from the manifest public key and proves that malicious, malformed, stale, and future handoff records are rejected.

Connected production-runtime evidence for outage-hardening commit `06a6b52628b9a3023b8047704e1cbba341c799da`: protected Vercel deployment `https://annotated-87lzxt8n6-laymen.vercel.app` (`dpl_xyHjMnzLbLA9jsK56xx8t2cisy3M`) was connected through a short-lived encrypted tunnel to the disposable, fully migrated local Annotated Supabase stack. This did not use production, the unrelated Laymen project, or mock/in-memory persistence. Healthy `/api/ready`, feed, users, most-viewed, annotation detail, and crawler routes returned 200 with 55 durable annotations; readiness reported every configuration-level component `ok` (no Resend message was sent); rate-limit rows were consumed atomically; API user JSON contained no `authId`; and direct tunneled anon REST insertion returned 401 with zero rows created. After recording the evidence, the tunnel and its temporary Vercel alias were removed and only the Annotated local stack was stopped with its data volume preserved; the unrelated Laymen stack remained running.

The same deployment was tested through a deliberate database pause and recovery. Health stayed 200 in 0.2s; readiness returned a structured 503 in 4.1s; the first version exposed a real defect when feed exhausted the Vercel deadline with 504; commit `06a6b52` added a 2s abort plus a 2.5s enforcement bound and regression test; the redeployed feed then returned the intended structured 503 in 2.1s. After unpause, the same deployment recovered immediately to readiness/feed 200. No HTTP 500/504 remained in the fixed deployment logs.

Two provider-shaped GoTrue identities then synchronized through the deployed API and completed actor-spoof rejection, cross-user delete 403, article publication with the exact passage, follow, comment, reply, vote, bookmark, and account deletion. A 61.016s 426×240 video+audio WebM, 61.016s audio-only podcast WebM, and 2.508s recorded-commentary WebM each completed deployed sign → direct Storage PUT → server download/inspection → attach/publish. Account cleanup removed both identities, all probe annotations/media rows, and all Storage objects. These are real generated WebM artifacts through the connected production runtime, but they are not mislabeled as physical Chrome/YouTube/podcast/microphone acceptance.

Connected rendered-UI and moderation evidence for commit `694e287808093f38fbe53d31fc7fd89418eb805b`: the production build ran against the restored, fully migrated local Annotated Supabase volume and rendered all 55 durable feed records. Article, video, and podcast detail pages each showed a real source link and the shared “File a claim” control; the article preserved its exact passage and metadata. The actual claim dialog submitted an anonymous disposable claim, displayed the saved-for-review state, and produced `received` plus `notifications_dispatched` audit events. Unauthenticated moderator listing returned 401; a disposable Google-shaped GoTrue moderator session synchronized without exposing `authId`, listed the private audit trail, advanced the claim to `reviewing`, and created the corresponding event. The account and claim were deleted afterward, leaving zero probe auth users, app users, or claims. No email was represented as delivered: its audit explicitly recorded `not_configured`, so real Resend inbox proof remains open. A second post-fix claim request against the rebuilt production bundle emitted only the structured request summary—legacy seed subjects no longer cause an SDK validation stack—and was also removed before the local stack was stopped.

Isolated Chrome runtime evidence (Chrome for Testing 151.0.7922.71, fresh temporary profiles): unpacked 1.8.0 starts with the exact public Store ID, declared permissions/hosts, empty storage, and no sidebar console errors or horizontal overflow. After the 30-second MV3 idle window removes both sidebar and worker contexts, reopening the sidebar restarts the worker and renders cleanly. The production `www.annotatedextension.com` origin receives the read-only install ping (`ok: true`, version 1.8.0); `example.com` has no external messaging surface. The allowed production origin rejects an invalid bundle, accepts an isolated placeholder bundle, stores only `annotatedAuth` (not legacy `annotatedUser`), and the temporary storage is then cleared. With Chrome's fake media device, real offscreen `MediaRecorder` start/stop produces a 6,397-byte, 2.209s `audio/webm;codecs=opus` artifact and leaves zero offscreen contexts. This proves runtime wiring and lifecycle behavior without treating synthetic media or placeholder auth as provider/device acceptance.

Signed-out disclosure evidence for the current candidate: the locally served side panel renders the expected Annotated identity and a nonblank accessible tree with Google/X controls followed by a `role="note"` disclosure. It states active-tab URL/title/metadata/selection access, Chrome-local provider-session storage, user-chosen publication, and claim contact-data submission before authentication. Privacy and Terms resolve to the canonical production URLs, the framework-overlay count is zero, console warning/error output is empty, and the theme control changes the root to dark mode and its accessible label to “Switch to light mode.” A live Chrome 1.8.0 unpacked test on 2026-08-02 confirmed the pinned website-to-extension handshake, storage handoff, and signed-in clip UI against the production Supabase session. The two deterministic package builders produce byte-identical 1.8.0 ZIPs at SHA-256 `641586a9bf52aa1f17f1326d8e87e6a102da1babee0d5f47a56dee8a5ae4538c`.

Current external-browser diagnostics find Google Chrome 150 running, the ChatGPT browser bridge installed and enabled in Profile 2, and its native-host manifest correct. After explicit owner permission, a Profile 2 window opened and the browser binding connected successfully. Current production Google sign-in completed the provider redirect, Annotated callback exchange, authenticated feed/profile identity, and logout with no console warnings/errors. After the owner signed into X, a newly initiated X flow also completed redirect, callback, authenticated Niko Callas identity, and logout; Annotated emitted no warning/error, and the sole console warning originated inside YouTube's embedded Google Publisher Tag library. Browser security correctly blocks automated access to `chrome://extensions`; the owner must therefore choose **Load unpacked** and select the repository's `extension/` directory, not the 1.8.0 ZIP, before the physical source/microphone matrix can proceed. The owner removed Store version 1.7.3. The Chrome Web Store developer account is `niko@laymen.com`, and the publisher is **Niko Callas** (not Laymen, Inc.); no credential or re-authentication control was touched.

Independent public crawler evidence on 2026-08-01: LinkPreview.io fetched the current production domain, scored its generic card 94/100, verified a 1200×630 social image, and rendered X, Facebook, LinkedIn, Slack, Discord, and Google previews. A direct `facebookexternalhit` request to `/a/seed-ann-niko-01` confirmed that the current production deployment still returns the generic root title, description, canonical URL, and image for that annotation path. The release candidate already returns unique per-annotation metadata in connected crawler tests, but its Vercel preview is authentication-protected. A protected share/bypass credential was deliberately not sent to a third-party validator, so gate 16 correctly remains open until the candidate has an approved public deployment.

Accessibility browser evidence for the exact candidate source at `772c7144136fec5c41a4ceab08c4ca173bcffa99`: axe 4.12 reports zero WCAG 2.0/2.1 A/AA violations on landing, feed, login, support, privacy, terms, signed-out extension, signed-in clip view, and the claim dialog in light and dark themes. Keyboard traces show visible 2px focus, 44px primary targets, and no hidden recorder controls in the tab order. The claim dialog receives initial focus, wraps Tab and Shift+Tab, closes with Escape, and restores focus to the File a claim button. Public routes at 390×844 and the side panel at 378px show no document-level horizontal overflow; the only intentionally offscreen support elements are the non-focusable bot honeypot. The website viewport permits zoom and both surfaces honor reduced-motion preferences.

The Annotated Supabase organization is on the Free plan and exposes only the `main` branch. The owner removed the expendable second free project but explicitly preferred the already-established main project because it contains Annotated Auth and has no current users. The hardened migration was therefore applied to exact project `cpqmjujhcwpavrsjadjz`; no new project was needed, and the unrelated Laymen project remained untouched.

## Acceptance gates

| # | Gate | Current result |
|---:|---|---|
| 1 | Preview survives cold starts/temporary DB failure | Pass: connected Vercel stays live, fails ready/feed closed within bounds, then recovers on the same deployment |
| 2 | Core feed/detail APIs return durable data | Pass in Production: all 55 durable annotations plus feed/detail/users/most-viewed return successfully, and user responses redact `authId`. |
| 3 | Anonymous mutations return 401 | Pass in integration suite and connected deployed API |
| 4 | Spoofed actor IDs have no authority | Pass in integration suite and connected two-actor journey |
| 5 | Cross-user mutation/deletion returns 403 | Pass in integration suite and connected two-actor journey |
| 6 | Direct anonymous Supabase writes denied | Pass on the exact main project after migration: anonymous reads/writes and a service-only RPC return 401; functional service probes clean up to zero disposable rows. |
| 7 | Google and X work on site and extension | Partial: production Google and X web callbacks, authenticated profile identity, and logout pass in real Chrome; explicit refresh and real 1.8.0 extension handoff remain pending |
| 8 | Real 61s YouTube → verified 240p | Generated 61.016s/240p artifact passes the connected deployed pipeline; real YouTube device capture pending |
| 9 | >90s rejected before publication | Pass in extension/API tests |
| 10 | Real podcast → bounded audio artifact | Generated 61.016s audio-only artifact passes the connected deployed pipeline; real podcast device capture pending |
| 11 | Article publishes exact selection + metadata | Exact passage/metadata passes through connected Vercel/Supabase; browser selection action pending |
| 12 | Text and recorded audio commentary work | Connected deployed text plus verified WebM commentary pass; physical microphone publish pending |
| 13 | Source link and File a claim on every page | Pass on retained production detail in desktop/mobile browser and hardened article/video/podcast details backed by the migrated database |
| 14 | Claim submitted, recorded, notified, reviewed | Partial: rendered submission, durable record, notification-attempt audit, scoped moderator listing, and status/event review pass. Both existing Niko Auth subjects are configured as encrypted production moderators; real Resend delivery remains pending. |
| 15 | Retained social behavior works | Pass through connected Vercel/Supabase with two verified actors; provider-browser UI remains part of gate 7 |
| 16 | Per-annotation canonical/OG works in validators | Pass on the public domain: a direct crawler request returns the annotation-specific title, description, canonical URL, and OG fields. Optional third-party cache refresh remains. |
| 17 | Typecheck/tests/build/CI/package pass | Pass: full local release CI has 50 tests and byte-identical packages; exact code-commit push/PR workflows and immutable Vercel preview must pass before promotion |
| 18 | Zero high/critical dependency findings | Pass; npm audit is zero total |
| 19 | No service-role/secret leakage | Pass: source, built bundle, packages, PR diff, and full repository history scans are clean; CI now fetches full history and repeats the guard |
| 20 | Vercel smoke test has no new runtime errors | Pass in Production: health/readiness, feed/users/most-viewed/detail, public routes, CORS, and anonymous-auth boundaries pass; post-deploy logs show zero 5xx/error-level events during the observation window. |
| 21 | Minimal versioned CWS package ready | 1.8.0 validates and loads with exact public ID/hosts; clean worker suspend/restart, synthetic-mic recording, and rendered pre-auth data disclosure pass. Chrome must load the unpacked `extension/` directory—not the ZIP; real-device and owner-dashboard review remain pending. |
| 22 | Lovable checklist line-by-line | Matrix above plus final accessibility browser evidence; provider/manual rows remain open |

## Remaining risks and owner/provider actions

These are the smallest external actions still required. Main Supabase, Vercel configuration, Production deployment, and public smoke checks are complete. Chrome Web Store publication is still a separate authorization.

1. In Profile 2, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select `/Users/nikocallas/annotated/extension`. The ZIP is only for Chrome Web Store upload and cannot be selected by **Load unpacked**. Confirm version 1.8.0 and ID `eaealcbiidjigfndjchchbnjdjicbajb`, then grant microphone/tab capture through normal browser prompts and run the physical-source matrix. Store version 1.7.3 has already been removed.
2. Verify one real Resend delivery to the owner-controlled inbox. The durable claim/audit/moderation paths already pass, but no inbox receipt is claimed as proven.
3. In the Chrome Web Store developer account `niko@laymen.com`, open the item published by **Niko Callas** and review its private draft fields. Add the current equivalents of Authentication information, Web browsing activity, Form data, and User-generated content; review microphone/tab-media processing; and remove the public listing's “early version” language. Do not upload, save, submit, or publish until separately approved.
4. Approve the Chrome Web Store 1.8.0 upload and submission only after the real-device/provider rows are recorded.

## Final production deployment checklist

- [x] Draft PR reviewed; CI green; no unexpected generated/untracked files.
- [x] Preview URL and commit SHA recorded; Vercel logs clean for critical journey.
- [x] Database/schema/bucket preflight, migration history, core counts, and postflight captured for exact main project `cpqmjujhcwpavrsjadjz`; rollback sequence documented.
- [x] `0011`–`0014` proven in branch/test DB; anon and two-user authorization probes pass. `0014` additionally survives simultaneous same-annotation attachment calls with one winner and one orphan.
- [x] Production `/api/health` 200 and `/api/ready` 200 with every named check `ok` after the exact candidate deployment.
- [ ] Google/X site + extension OAuth, refresh, logout, and account deletion pass. Production Google and X web callbacks/identity/logout pass; real 1.8.0 extension handoff and explicit refresh proof remain open.
- [ ] Real YouTube/podcast/article/commentary artifacts pass trusted validation.
- [ ] Claim emails and moderator audit/status path pass.
- [x] OG/canonical crawler output passes on a public real annotation.
- [x] Support, privacy, terms, retention, deletion, and singular support domain reviewed.
- [x] Keyboard, contrast, zoom/reflow, reduced-motion, and claim-modal accessibility audit passes on the exact release candidate.
- [x] Explicit owner approval obtained and migrations `0011`–`0014` applied to exact main Supabase project.
- [x] Explicit owner approval obtained for Vercel Production deployment; standing future Annotated deployment permission recorded.
- [x] Every required production environment variable is present; `MODERATOR_AUTH_IDS`, `CRON_SECRET`, and `RATE_LIMIT_SALT` were added as sensitive values.
- [x] Deploy exact reviewed SHA, smoke test, then observe Vercel logs/readiness before declaring stable.

## Chrome Web Store release checklist

- [x] Manifest V3; version incremented to 1.8.0.
- [x] Public Web Store key pins unpacked QA builds to published ID `eaealcbiidjigfndjchchbnjdjicbajb`; OAuth handoff and API CORS therefore exercise the same origin used after release.
- [x] Minimum Chrome version is 116, matching offscreen consumption of a service-worker `tabCapture` stream ID; bounded offscreen progress messages protect 61–90s captures from the 30s worker idle window.
- [x] No remote executable code or remote stylesheet; no eval; package contains no maps, docs, env files, build directories, or secrets.
- [x] Permanent host permissions limited to the two Annotated production origins plus the exact `cpqmjujhcwpavrsjadjz.supabase.co` media-storage origin required for signed direct uploads; source sites are optional, per-site grants requested only from a clipping action. OAuth messaging remains restricted to the Annotated origins, and authenticated API/refresh traffic has no runtime origin override.
- [x] `sidePanel`: primary product surface.
- [x] `activeTab` + `scripting`: user-invoked source metadata, selection, and media control on the active page only.
- [x] `tabs`: active-tab discovery/navigation events and opening sign-in/result/settings tabs.
- [x] `storage`: extension-owned OAuth session and minimal preference state.
- [x] `offscreen`: microphone recording and tab-stream MediaRecorder DOM context required by MV3 service workers.
- [x] `tabCapture`: user-selected source playback artifact; no background or unattended capture.
- [ ] Real-device unpacked-folder install, permission-prompt screenshots, and 90-second stability run. Store version 1.7.3 is removed; Chrome must load the repository `extension/` directory rather than the ZIP.
- [x] Signed-out extension UI discloses active-tab context, local OAuth state, chosen publication, and claim contact data before authentication, with canonical Privacy/Terms links.
- [ ] Web Store dashboard privacy disclosure updated for OAuth tokens, browsing activity/URLs, active-tab content, form data, user content, microphone/tab media, and Supabase/Vercel/Resend processing.
- [x] Ready-to-paste 1.8.0 description, single-purpose statement, permission justifications, and disclosure review drafted in `docs/chrome-web-store-listing.md`.
- [ ] Listing screenshots/demo/privacy URL/support URL reviewed in the `niko@laymen.com` owner dashboard for publisher **Niko Callas**; remove the live listing's “early version” language.
- [x] Download and CWS builders strip platform metadata and produce the same 1.8.0 bytes with a root manifest; current candidate SHA-256 `641586a9bf52aa1f17f1326d8e87e6a102da1babee0d5f47a56dee8a5ae4538c`.
- [x] Hardened production endpoint stable after deployment; main migrations are applied. Separate explicit owner approval is still required before Store upload/publish.

## Go/no-go

**Current recommendation: Production GO and stable; NO-GO for Chrome Web Store resubmission until the manual extension matrix and publisher-dashboard review are complete.** The main database is backed up, migrated, hardened, and functionally probed; Auth is Google/X-only; all required Production settings are encrypted; and the reviewed app is live with green readiness, durable APIs, crawler metadata, security boundaries, and runtime logs. The remaining acceptance work is loading the unpacked 1.8.0 folder, physical Chrome media/selection/microphone journeys, explicit refresh/extension OAuth proof, one real Resend inbox receipt, and the Niko Callas publisher-dashboard privacy/listing review. The branch should remain active until those rows pass and the separate Store upload/submission is approved.

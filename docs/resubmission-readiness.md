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
| Video downgraded to 240 pixels (<480p) | Tab stream is drawn to a 240px-high 15fps canvas, encoded WebM, then dimensions are parsed server-side | Implemented; synthetic 61s/240p acceptance and >240p rejection pass. Real YouTube artifact pending. |
| Every clip links to its original source URL | Source URL is required HTTPS metadata and appears in feed/detail/source credit; canonical annotation page remains separate | Pass in production browser detail/mobile checks; hardened preview data path pending. |
| Visible “File a claim” on every annotation | Detail page and extension detail both render the action; API accepts anonymous, validated claims | Pass in production browser detail/mobile checks; live notification proof pending. |
| Account creation via X or Google only | Supabase PKCE OAuth only; no password/demo identity; API verifies access token on protected operations | Implemented; provider-by-provider preview proof pending. |
| Public social feed with follow + comment | Feed, profiles, follow/unfollow, threaded comments, votes, bookmarks | Public feed/detail UI passes desktop/mobile browser checks; authenticated mutations pass integration tests. |
| Commentary supports text and recorded audio | Text plus offscreen microphone recording, preview/discard/replace, signed upload and inspection | Implemented; real microphone publish pending. |
| Pick current source or paste URL | Side panel detects active tab and offers a different URL; media paste must be opened in the active tab before compliant capture | Implemented; real-device proof pending. |
| News/article passage plus metadata | Content script captures selected text and OG/title/author/publication; API preserves the passage and validates metadata | Implemented; exact-passage integration evidence passes; browser selection proof pending. |
| Podcast 90-second audio segment | Tab audio capture, audio-only WebM encode, direct upload, trusted no-video/duration validation | Implemented; real podcast artifact pending. |
| Public landing page | `/a/:id` returns crawler-visible per-annotation metadata and hydrates the React detail page | Implemented; preview crawler validator proof pending. |

## Baseline snapshot before new migrations

- The reviewed branch began at `ce52d0d`. Production was not changed.
- Production Supabase had recently been resumed. A read-only check on 2026-08-01 showed `/api/feed` recovered with HTTP 200 and durable seeded content. The current production build still returned 404 for `/api/health` and `/api/ready`; those routes exist only in this branch until approved deployment.
- Existing migration history was preserved verbatim as `0001` through `0010`. `0001` explicitly disabled RLS on users, follows, annotations, comments, and claims. Later migrations added bookmarks, views, claim fields, votes/threads, thumbnail fields, and the original `clip-media` bucket.
- The original code initialized the serverless module through request/startup demo seeding, accepted caller identity fields, used a public-key persistence path, returned clipping command plans, accepted base64/data-URL media, trusted client media claims, and had no CI.
- Production data assumptions: seeded IDs are referenced by marketing/demo content; user/annotation rows must be preserved; annotation/media URLs may include legacy demo assets; there is no safe authorization to rewrite or delete production content during hardening.
- The live target's exact policy/bucket export has not been mutated. Before applying the additive migrations, capture a Supabase dashboard/CLI schema-only backup and row counts for all core tables, `storage.buckets`, and `storage.objects` in project `cpqmjujhcwpavrsjadjz`.

## Before/after findings

| Area | Baseline | Release candidate |
|---|---|---|
| Cold start | Module readiness could be permanently rejected by seeding/provider failure | Route registration is synchronous; seed is explicit; liveness is dependency-free; readiness times out and reports components |
| Persistence | Silent memory fallback possible | Memory exists only in development/tests; production returns explicit 503 when durable storage/config is missing |
| Identity | Body/query actor IDs trusted | Supabase token verified on every protected request; actor always derived from the token; internal OAuth subject redacted |
| Database access | RLS disabled; anon-key server path | Service-role API path; forced RLS; all direct product-table privileges revoked from `anon` and `authenticated` |
| Media | Plans/base64/data URLs/client claims | Real tab artifact; direct signed upload; server parses container/duration/tracks/dimensions/bytes; failed media remains private |
| Views | Read/modify/write race | Service-only atomic RPC |
| Abuse | Broad CORS and no limits | Exact production/preview/extension origins; atomic distributed per-endpoint limits; 429/Retry-After; bounded cleanup |
| Claims | Submission and email only | Honeypot/rate limit, private contact data, delivery result, immutable event trail, moderator-only review RPC/API |
| Sharing | Generic client-rendered metadata | Per-annotation server HTML, canonical production URL, unique OG/Twitter tags |
| Dependencies/build | Seven advisories; 542KB client chunk | Zero npm advisories; split 348KB app/146KB React/37KB data/12KB icon chunks |
| Quality | No meaningful tests/CI | Node unit/integration suite, migration/extension/package/security checks, GitHub Actions |
| Privacy | Inconsistent support domain; email-only deletion request | Singular support domain; in-product confirmed account/media/OAuth deletion; retention language |

## Security model

1. Supabase Auth is the identity provider; only Google and Twitter/X provider values are accepted.
2. Browser and extension send an access token in `Authorization: Bearer`. The API calls Supabase `getUser` and maps the verified `(provider, auth subject)` to the app user. Refresh tokens are accepted only by the refresh endpoint and are never logged.
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
- claim submission, notification audit, moderator access/status tests;
- follow, comment/reply, vote, bookmark tests;
- 90-second/source URL validation;
- WebM 61s/240p acceptance, >240p rejection, >90s rejection, audio-only enforcement;
- extension source detection, selection word count, OAuth handoff, capture plan, publish-state tests;
- liveness/readiness outage behavior;
- RLS/grant/storage/rate/claim migration assertions;
- per-annotation metadata escaping/canonical tests;
- limiter isolation, 429 headers, expiry, and bounded-memory tests;
- production build, extension syntax/package contents, secret-pattern scan, and npm audit.

Latest local result (2026-08-01): the complete `npm run ci` release command passes—TypeScript, all 29 tests, production build, extension validation, source/bundle/package secret scan, and dependency audit. `npm audit` reports zero vulnerabilities. The frontend no longer emits the >500KB chunk warning. Tailwind 3 still triggers PostCSS 8.5's generic “generated parse has no from value” warning; this comes from Tailwind's in-memory generated rules, not an imported asset. It is retained rather than downgrading below the patched PostCSS version and should be re-evaluated during a planned Tailwind 4 migration. Both the [push workflow](https://github.com/nikocallas/annotated/actions/runs/30711940413) and [pull-request workflow](https://github.com/nikocallas/annotated/actions/runs/30711956582) pass on hardened code commit `e5b57d7af9d5684e82d5cb4f104d9d2919830e74`.

Isolated production-mode integration evidence against a clean local Supabase stack:

- all 13 migrations apply from zero; ten product tables have forced RLS, 21 policies exist, and direct `anon` product-table writes return 401 with zero direct client mutation grants;
- the atomic distributed limiter allows requests one and two and rejects request three for a two-request bucket;
- two provider-shaped GoTrue sessions synchronize through the real API while keeping OAuth subject IDs private; anonymous/spoofed/cross-owner mutations return 401/403;
- a 61.008s 426×240 video+audio WebM, 61.008s audio-only podcast WebM, and 61.008s commentary-audio WebM complete signed direct upload and trusted finalization; objects remain private before verification and public only after attachment;
- an over-90s publish is rejected with no annotation row created; an article preserves the exact selected passage and source metadata while attaching verified audio commentary;
- stale-media maintenance removes both the disposable Storage object and upload-intent row (`scanned: 1`, `removed: 1`, `failures: 0`);
- confirmed account deletion removes the app user, media row, Storage object, and GoTrue identity; a lowercase confirmation attempt returns 400 first.

No production migration or write was used for this evidence.

## Manual/real-device QA evidence

No item in this section is marked proven until a URL/artifact/screenshot is recorded.

| Journey | Evidence | Result |
|---|---|---|
| Google web OAuth | Pending preview callback test | Not proven |
| X web OAuth | Pending provider callback/email-scope test | Not proven |
| Google/X extension handoff + refresh | Exact production-origin ping and isolated valid/invalid bundle handoff pass in Chrome; real provider token/refresh pending | Partial |
| 61-second YouTube capture | Pending stored-object URL + parsed 240p metadata | Not proven |
| 61-second podcast capture | Pending stored-object URL + audio-only metadata | Not proven |
| Article exact passage | Exact-value local Supabase/API evidence; published detail renders correctly in browser | Partial (browser selection action pending) |
| Text/audio commentary preview, replace, publish | Isolated Chrome fake-device recording produces a valid 2.209s Opus WebM and closes offscreen context; physical microphone/publish pending | Partial |
| Source link + File a claim | Production canonical detail and 390×844 mobile detail each show the claim action and original-source links | Pass for retained production content; preview data pending |
| Claim recorded/notified/reviewed | Pending Resend inbox + moderator audit event | Not proven |
| Feed/profile/follow/comment/reply/vote/bookmark | Production feed loads 50+ cards without console errors or horizontal overflow; authenticated mutations pass integration tests | Partial (provider-authenticated browser mutations pending) |
| OG/canonical validators | Pending deployed `/a/:id` validation | Not proven |
| Cold start and simulated provider recovery | Local outage regression passes; isolated preview health repeatedly survives while missing dependencies fail closed | Partial (connected preview recovery pending) |

Latest isolated Vercel preview for hardened code commit `e5b57d7af9d5684e82d5cb4f104d9d2919830e74`: `https://annotated-hyvj019at-laymen.vercel.app` (`dpl_C5kFoQmyuYNHgRJdbg7ar52mH6xH`). The deployment built with zero dependency findings. `/api/health` returns 200 with request ID, HSTS, API CSP, and `Cache-Control: no-store`; `/api/ready` returns a component-by-component 503 because Preview has no Supabase URL/OAuth/moderation/maintenance configuration; `/api/feed` returns a controlled 503 rather than memory/demo data; `/` returns 200. The deployed `/downloads/annotated-extension.zip` exactly matches the validated CWS artifact at SHA-256 `fc2b02760571ac170b91c04acfc519c26099491b574504050e2076ffff726ed4`. Runtime logs contain only expected fail-closed readiness/rate-limit messages and structured request summaries—no crash or secret output.

Isolated Chrome runtime evidence (Chrome for Testing 151.0.7922.71, fresh temporary profiles): unpacked 1.8.0 starts with the exact public Store ID, declared permissions/hosts, empty storage, and no sidebar console errors or horizontal overflow. After the 30-second MV3 idle window removes both sidebar and worker contexts, reopening the sidebar restarts the worker and renders cleanly. The production `www.annotatedextension.com` origin receives the read-only install ping (`ok: true`, version 1.8.0); `example.com` has no external messaging surface. The allowed production origin rejects an invalid bundle, accepts an isolated placeholder bundle, stores only `annotatedAuth` (not legacy `annotatedUser`), and the temporary storage is then cleared. With Chrome's fake media device, real offscreen `MediaRecorder` start/stop produces a 6,397-byte, 2.209s `audio/webm;codecs=opus` artifact and leaves zero offscreen contexts. This proves runtime wiring and lifecycle behavior without treating synthetic media or placeholder auth as provider/device acceptance.

A Supabase preview branch was unavailable on the current plan (HTTP 402), and a disposable third free project in the exact Annotated organization was rejected by Supabase's active-project limit. Nothing was created or changed in either attempt, and no unrelated project was paused or modified.

## Acceptance gates

| # | Gate | Current result |
|---:|---|---|
| 1 | Preview survives cold starts/temporary DB failure | Isolated preview health survives cold invocations and fails dependencies closed; connected recovery pending |
| 2 | Core feed/detail APIs return durable data | Production feed/detail recovered after resume; hardened connected preview pending |
| 3 | Anonymous mutations return 401 | Pass in integration suite |
| 4 | Spoofed actor IDs have no authority | Pass in integration suite |
| 5 | Cross-user mutation/deletion returns 403 | Delete/media ownership implemented; delete test passes |
| 6 | Direct anonymous Supabase writes denied | Pass against clean migrated local Supabase REST; hosted branch proof pending |
| 7 | Google and X work on site and extension | Production-origin extension handshake passes in isolated Chrome; real Google/X provider and refresh proof pending |
| 8 | Real 61s YouTube → verified 240p | Actual 61.008s/240p signed-upload pipeline passes; real YouTube device capture pending |
| 9 | >90s rejected before publication | Pass in extension/API tests |
| 10 | Real podcast → bounded audio artifact | Actual 61.008s audio-only signed-upload pipeline passes; real podcast device capture pending |
| 11 | Article publishes exact selection + metadata | Pass in production-mode local API; browser selection action pending |
| 12 | Text and recorded audio commentary work | Text and verified commentary media pass local API; isolated Chrome offscreen recording passes; physical microphone publish pending |
| 13 | Source link and File a claim on every page | Pass on retained production detail in desktop/mobile browser; hardened preview data pending |
| 14 | Claim submitted, recorded, notified, reviewed | Integration pass; real Resend/moderator pending |
| 15 | Retained social behavior works | Public browser surfaces and mutation integrations pass; authenticated browser actions pending |
| 16 | Per-annotation canonical/OG works in validators | Implementation/unit pass; deployed validator pending |
| 17 | Typecheck/tests/build/CI/package pass | Pass: full local CI (29 tests) plus hosted push and pull-request workflows on hardened commit |
| 18 | Zero high/critical dependency findings | Pass; npm audit is zero total |
| 19 | No service-role/secret leakage | Pass: source, built bundle, packages, PR diff, and full repository history scans are clean; CI now fetches full history and repeats the guard |
| 20 | Vercel smoke test has no new runtime errors | Isolated preview pass with expected missing-config 503 logs; connected critical journey pending |
| 21 | Minimal versioned CWS package ready | 1.8.0 validates and loads with exact public ID/hosts; clean worker suspend/restart and synthetic-mic recording pass; real-device/privacy listing review pending |
| 22 | Lovable checklist line-by-line | Matrix above; provider/manual rows remain open |

## Remaining risks and owner/provider actions

These are the smallest external actions required; they do not authorize production mutation.

1. Enable a Supabase preview branch (Pro plan) or temporarily free one allowed project slot in the exact Annotated organization; then capture the preflight export and apply `0011`–`0013` only there. Local migration/REST proof is already complete.
2. Configure Vercel Preview variables: server/publishable Supabase values, Resend, singular support inbox, owner `MODERATOR_AUTH_IDS`, `CRON_SECRET`, `RATE_LIMIT_SALT`, and the preview OAuth/CORS origin.
3. Confirm Google and X providers and exact preview callback allowlists. X must return the identity data Supabase requires; if the provider account cannot expose email, document that provider limitation rather than claiming success.
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
- [x] Download and CWS builders strip platform metadata and produce the same 1.8.0 bytes with a root manifest; SHA-256 `fc2b02760571ac170b91c04acfc519c26099491b574504050e2076ffff726ed4`.
- [ ] Production endpoint/migrations stable and explicit owner approval obtained before upload/publish.

## Go/no-go

**Current recommendation: NO-GO for production resubmission.** The release candidate materially closes the known architecture/security gaps and has broad local automated coverage, but acceptance requires provider-applied migrations, a branch preview, real Google/X flows, real-device media artifacts, real notification evidence, crawler validation, and clean Vercel runtime observation. The branch should remain active until those rows are proven or an exact external limitation is documented.

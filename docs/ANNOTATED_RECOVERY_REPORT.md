# Annotated recovery report

Date: 2026-08-08  
Workspace: `/Users/nikocallas/Developer/Annotated`  
Recovered source: `nikocallas/annotated@4748328` (`master`)

## Evidence labels

- **Fact**: directly observed in source control, a connected provider, a live endpoint, or the running product.
- **Strong inference**: the available independent evidence agrees, but cannot prove a negative such as “no unpushed file ever existed.”
- **Open**: provider access or a physical/manual acceptance step is required to settle it.

## Executive summary

Annotated is a public social annotation network. Its primary creation surface is a Chrome MV3 side panel. A user selects an article passage or an exact interval from video/podcast playback, adds written or recorded context, and publishes a public annotation that preserves source attribution. The website is the discovery, playback, profile, reaction, discussion, sharing, and trust-and-safety surface.

The recoverable project is coherent and substantially intact:

- **Fact:** the private GitHub repository `nikocallas/annotated` is the only Annotated repository in the connected account. Its `master` commit `4748328` is the source of the latest Vercel Production deployment.
- **Fact:** every remaining remote branch is fully contained by `master`; there is no remote-only unmerged commit.
- **Fact:** the canonical site is live, `/api/health` and `/api/ready` are healthy, the public feed and annotation detail workflows work, and the deployed database/storage reference is `cpqmjujhcwpavrsjadjz`.
- **Fact:** Chrome Web Store version 1.8.1 is public and was updated on 2026-08-03, one day after the final repository commit. The committed extension is also version 1.8.1, and its deterministic Store/package artifact hashes match the recorded release candidate.
- **Fact:** the full source and dependency environment have been restored under `/Users/nikocallas/Developer/Annotated`. TypeScript, all 55 tests, production build, extension validation, and secret scan pass.
- **Fact:** the newly disclosed `nanoid` advisory was repaired with the smallest compatible lockfile change (`3.3.16` → `3.3.18`). The complete `npm run ci` sequence is green again with zero vulnerabilities.
- **Fact:** a safe local Supabase environment now runs through Colima/Docker. A clean reset applies migrations `0001`–`0015`, asserts the canonical schema/security/seed invariants, produces the expected 10 forced-RLS tables, 21 policies, two media buckets, 55 annotations, and returns a fully ready local API on port 5001 with clean local advisors.
- **Fact:** authenticated read-only dashboard access to the exact production Supabase project was restored on August 8. A fresh catalog, migration, grants/RLS, function/trigger, Storage, Auth, Edge Function, branch/job, advisor, and recent-log inventory is now recorded below. The generic Supabase connector still exposes only an unrelated project named Laymen, so production CLI linkage remains deliberately absent.

There is no affirmative evidence that application source was lost with the old computer. Production, previews, CI, branch tips, and the Store package all resolve to preserved Git content. Any uncommitted work after August 3 remains unknowable, but no indirect artifact points to it.

## Remote systems found

| System | Annotated resource | Status and authority |
|---|---|---|
| GitHub | Private `nikocallas/annotated` | Canonical source. Default/production branch `master`; head `4748328`. |
| Vercel | `annotated`, project `prj_wBKfZTInfsIqijLmTcOiYAOmrqdk`, team `team_E5lJkCrPv1wThkceUCDfGtXS` | Canonical web/API deployment relationship. Root `web`, Node 22, Vite/custom build. |
| Supabase | Project ref `cpqmjujhcwpavrsjadjz`, organization `Annotated` | Canonical Auth, Postgres, and Storage runtime. Exact project was inspected read-only in the authenticated dashboard; healthy Free/main production in `us-east-2`. |
| Chrome Web Store | Item `eaealcbiidjigfndjchchbnjdjicbajb` | Canonical extension publication state. Version 1.8.1, updated 2026-08-03. |
| Resend | Referenced by optional server email modules | Deferred by owner and not part of the current product/recovery path. No provider work was performed. |
| Google OAuth | Supabase provider | Enabled in Production; three current Auth identities. |
| X OAuth 2.0 | Supabase provider | Enabled in Production; one current Auth identity. |
| YouTube | Official iframe API; no app credential | Bounded source playback and annotation embeds. |
| Spotify | Official embed API; no app credential | Bounded podcast playback for Spotify sources. |
| Vercel Cron | `/api/maintenance/media` at `23 4 * * *` | Daily orphan/pending media cleanup. |

Connected but excluded after inspection:

- GitHub repositories `laymen`, `laymen-content-engine`, archived `laymen-terms`, `nikonotes`, and `onaircheck` are separate products. No second Annotated frontend, backend, mobile, infrastructure, AI, extension, or archived repository was found.
- Other Vercel projects with those product names are separate and have distinct repository/project relationships.
- The generic Supabase connector still shows only **Laymen**, ref `sdriznnaonzphciekupr`. Exact Annotated authority was recovered separately in the authenticated provider dashboard. Laymen is unrelated, is explicitly out of scope, and was not queried or modified during the exact-project inventory.

No code or environment evidence supports active OpenAI, Anthropic, Clerk, Auth0, Stripe, PostHog, Sentry, Redis/Upstash, Pinecone/Qdrant, Cloudflare, AWS, GCP, Railway, Fly.io, Render, or separate queue/search/OCR infrastructure.

## Repository map

There is one legitimate repository rather than a multi-repository system.

| Path | Responsibility |
|---|---|
| `extension/` | Chrome MV3 manifest, side panel, background service worker, content capture, offscreen media/microphone recording. |
| `web/client/` | React public website: landing, auth callback, feed, detail, profile, following, demo, install, support, privacy, terms, and claims copy. |
| `web/server/` | Express API, verified auth, persistence adapters, media signing/inspection, claims/moderation, email, rate limiting, static/metadata handlers. |
| `web/shared/` | Shared schemas and product types. |
| `supabase/migrations/` | Ordered Postgres schema, data, forced-RLS, Storage, rate-limit, audit, and atomic attachment migrations. |
| `web/api/` | Generated Vercel function entrypoints. |
| `web/script/` | Build, package, security, extension validation, and explicit demo seed scripts. |
| `marketing/` | Reproducible product demo/capture material. |
| `docs/` | Release, design, policy, migration, Store, and now recovery evidence. |
| `.github/workflows/ci.yml` | Node 22 verification workflow. |

The repository does not contain Supabase-generated TypeScript database types. Production rows are mapped deliberately in `web/server/storage.ts`, while `web/shared/schema.ts` uses Drizzle SQLite definitions as the shared contract and in-memory development/test model. This works today but makes a repeatable schema-drift check important.

## Product map

### Directly supported facts

**Problem:** important commentary is routinely detached from the evidence it discusses. A quote, transcript, or repost loses timing, tone, surrounding material, and source credit.

**Audience:** people who discover, explain, curate, and discuss useful moments across articles, video, and podcasts. The retained demo content and product copy emphasize founders, researchers, media consumers, and intellectually curious readers rather than a narrowly defined enterprise persona.

**Core promise:** “Clip the exact moment. Add the missing context.” Annotated aspires to be a context layer on top of the web while sending credit and traffic to original work.

**Primary creation workflow:** install/sign in to the extension, keep the source tab visible, capture a selected passage or an exact media range, add text or audio commentary, publish, then land on a canonical public annotation.

**Primary consumption workflow:** browse/search/filter the public feed, play or read the source excerpt, read the annotator's context, open the original source, react/bookmark/comment/follow, and share or file a rights claim.

**Main product surfaces:** marketing landing, demo, Chrome side panel, public feed/following, annotation detail, profiles, login/auth callback, install/invite, support, privacy/terms, and claim flow. There is no website creation form; the extension is intentionally the creation surface.

**Magic moment:** a user scrubs to an exact 30–90 second source interval, publishes it with context, and sees the actual bounded evidence remain playable beside their explanation and original-source credit. That is where Annotated becomes more than a bookmark or social post.

### Strong inferences

- The long-term direction is a cross-source public context network: extension-first creation feeding a searchable social graph of source-grounded annotations.
- The August work moved the product from a broad prototype toward a trustworthy, Store-ready release: real capture, server verification, authenticated writes, hardened database boundaries, policy disclosure, public product proof, and repeatable packaging.

### Open product questions

- Whether the founder wants Annotated to optimize first for personal knowledge/curation, public intellectual discussion, creator/audience interaction, or a more focused professional wedge is not settled by the repository.
- Growth mechanics beyond public sharing/following—notifications, invitations, collaboration, moderation operations, and retention loops—are implemented only narrowly or not at all.
- No repository evidence establishes a monetization model.

## Infrastructure map

```text
GitHub private repository
  ├─ pull request / master push → GitHub Actions (Node 22 verification)
  └─ branch / master push → Vercel project (root: web)
                              ├─ React/Vite static site
                              ├─ Express serverless API
                              ├─ per-annotation metadata handler
                              └─ daily media-cleanup cron
                                      │
Chrome extension ── bearer API calls ─┤
        │                             ├─ Supabase Auth (Google/X)
        └─ signed direct WebM PUT ────┼─ Supabase Storage
                                      └─ Supabase Postgres/RPC

Vercel API ── Resend REST → claim/support email
Website detail players ── official YouTube / Spotify embeds
```

Large captured blobs do not traverse Vercel JSON. The extension obtains an owner-scoped signed upload intent, uploads directly to Supabase Storage, and asks the API to finalize. The API downloads and inspects WebM metadata, rejects/deletes invalid media, and invokes an atomic database attachment/publication function.

## GitHub state

### Canonical state

- Repository: private `nikocallas/annotated`.
- Created: 2026-05-02; first recovered commit dates to 2026-05-01.
- Default and production branch: `master`.
- Current head: `4748328` — `Refresh Inter product captures` (2026-08-02).
- Releases/tags: none.
- Open issues: none found.
- Open pull requests: none.
- GitHub Actions: latest run for `4748328` succeeded. Recent runs across the hardening/polish sequence are green.

### Remote branches

`ahead` and `behind` are relative to `origin/master` at recovery time.

| Branch | Tip | Ahead | Behind | Conclusion |
|---|---:|---:|---:|---|
| `master` | `4748328` | 0 | 0 | Canonical and deployed. |
| `agent/inter-landing-polish` | `96199dd` | 0 | 2 | Merged/contained. |
| `agent/landing-demo-hardening` | `a6803ff` | 0 | 5 | Merged/contained. |
| `feat/youtube-clip-embed` | `78941cf` | 0 | 55 | Old experiment, fully contained. |
| `resubmission-hardening` | `685ca41` | 0 | 18 | Merged/contained. |

No dangling remote branch, branch mentioned only by CI, or deployment sourced from an unavailable SHA was found.

### Pull requests

All eight pull requests are closed and merged into `master`:

1. Final resubmission hardening and Supabase extension auth handoff.
2. Startup/product polish, discovery/search, and exact clip editor.
3. Spotify CSP hotfix.
4. Exact range-seek pause behavior.
5. Reliable `tabCapture` invocation/media verification.
6. Native podcast detection.
7. Landing/demo hardening.
8. Inter typography and product proof.

### CI

The workflow runs on pull requests and pushes to `master`/`resubmission-hardening`, with read-only repository permission, full history checkout, Node 22, `npm ci`, typecheck, tests, build, extension validation, secret scan, and high-level audit. There are no deployment-writing GitHub Actions or release workflows.

## Vercel state

### Project and domains

- Project: `annotated`.
- Project ID: `prj_wBKfZTInfsIqijLmTcOiYAOmrqdk`.
- Team: Laymen, `team_E5lJkCrPv1wThkceUCDfGtXS`.
- Root: `web`.
- Node runtime: 22.x.
- Framework/build: Vite client plus repository-defined custom serverless build.
- Production branch: `master`.
- Canonical domains: `www.annotatedextension.com` and `annotatedextension.com`.
- Vercel aliases also include `annotated-seven.vercel.app`, `annotated-laymen.vercel.app`, and `annotated-git-master-laymen.vercel.app`.

### Deployment comparison

The latest production deployment is `dpl_wMUaqbpzpyd5Hk5NSB77NL1wcUwM`, sourced from GitHub `master` SHA `4748328`. It is READY. This is byte-source agreement between canonical Git and production, not merely a branch-name match.

Preview history corresponds to the branch/PR tips listed above. The preview commits are all reachable from `master`. No preview exposes a newer missing commit. Production therefore does not contain source that appears lost from GitHub.

The current live checks return:

- `/api/health`: HTTP 200, `annotated-api` OK.
- `/api/ready`: HTTP 200; database, media Storage, OAuth, notifications, moderation, and maintenance all `ok`.
- `/api/feed?limit=100`: 58 public records on August 8 (55 retained seeded records plus the three physical article/video/podcast proof annotations published August 2).
- Production landing, feed, and a real podcast annotation detail rendered without Annotated browser errors.

### Build and runtime configuration

`web/vercel.json` defines two functions (`api/index.js`, `api/annotation.js`), security headers/CSP, annotation metadata routing, API/static rewrites, and daily media cleanup. The latest deployment build completed successfully. A PostCSS source-location warning is present but not build-fatal.

Vercel environment-variable names observed:

| Scope | Names |
|---|---|
| Development | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPPORT_TO_EMAIL`, `SUPPORT_FROM_EMAIL`, Vercel OIDC token. |
| Production | All above plus `SUPABASE_SERVICE_ROLE_KEY`, `MODERATOR_AUTH_IDS`, `CRON_SECRET`, `RATE_LIMIT_SALT`, `VITE_CHROME_WEB_STORE_URL`, and Vercel-generated values. The existing deployment also has legacy optional Resend/support names, but email delivery is deferred. |
| Preview | The hardening preview contained the core Supabase, moderation, cron, rate-limit, support, and public Store values needed for production-like verification. Optional Resend values are not a current recovery requirement. |

Values were not written into the repository or report. Encrypted provider snapshots are stored outside the workspace with owner-only permissions. The pulled Production snapshot did not reveal the legacy sensitive service-role value, although the immutable deployed environment clearly has a functioning credential because readiness and durable APIs pass.

Two historical Resend 403 events were visible in logs for the latest production deployment shortly after release on August 2. They are retained as forensic evidence only; the owner has deferred the integration. Older preview errors were associated with pre-cutover storage/permission configurations and are not current production failures.

## Supabase state

### Correct project

The exact project is `cpqmjujhcwpavrsjadjz`. This reference is independently embedded in repository configuration, the extension's allowed Storage host, production CSP, public media URLs, dated hardening evidence, and live readiness. On August 8 the authenticated dashboard confirmed organization **Annotated** on the Free plan, branch **main / Production**, status **Healthy**, nano compute in **East US (Ohio), `us-east-2`**, and Postgres **17.6**. There are no Supabase branches, no connected GitHub integration, and no scheduled backups on the Free project.

### Source-controlled schema

Migrations `0001`–`0010` define the original application history and retained demo content. Migrations `0011`–`0014` harden and extend it:

- `0011`: forced RLS, direct privilege revocation, auth/index hardening, atomic view counter.
- `0012`: signed media-upload intents and controlled `clip-media`/`commentary-audio` buckets.
- `0013`: distributed rate buckets, claim-event audit, moderation RPC.
- `0014`: row-locked, single-use atomic media attachment and annotation publication.
- `0015`: preserves production-only `private.current_user_id`, the automatic public-table RLS event trigger, and the already-live removal of the obsolete `clip-media` listing policy; it also removes the analogous commentary listing policy, browser execution of the public SECURITY DEFINER identity helper, and a duplicate users index. This migration is verified locally but not applied to Production.

The product entities are users, follows, annotations, bookmarks, comments/replies, votes, and claims. Production hardening adds `media_uploads`, `rate_limit_buckets`, and `claim_events`, for ten forced-RLS product/system tables. Important service-only functions include `increment_annotation_view`, `consume_rate_limit`, `moderate_claim`, and `attach_media_upload`, plus current-app-user mapping and the claim event trigger.

### Fresh August 8 production inventory

The new read-only catalog inventory confirms:

- 17 timestamped hosted migrations ending at `20260802010800 atomic_media_attachment`. Four early dashboard-authored security migrations (`enable_rls_and_baseline_policies`, `move_current_user_id_to_private_schema`, `drop_clip_media_public_read_policy`, and `move_rls_auto_enable_to_private_schema`) are not separate repository files. Repository `0010_seed_video_clip_assets.sql` is data-only and has no corresponding hosted ledger entry.
- The same 10 expected public tables, all with RLS enabled and forced; 21 public policies; zero direct `anon`/`authenticated` table grants; no public views, materialized views, or enums.
- Six public function definitions whose hashes exactly match the replayed local database: `attach_media_upload`, `consume_rate_limit`, `current_app_user_id`, `increment_annotation_view`, `moderate_claim`, and `record_claim_received`. Production additionally has the two earlier private functions and enabled `ensure_rls` event trigger now captured by `0015`.
- Exact live counts: eight app users, 62 annotations, five follows, eight comments, two claims, zero bookmarks, zero votes, 38 rate-limit buckets, two claim events, and two media-upload rows. The public API exposes 58 ready/public annotations (38 article, 10 podcast, 10 YouTube) and eight users without `authId`.
- Public Storage buckets `clip-media` (20 MiB limit, two objects) and `commentary-audio` (2 MiB limit, zero objects). Production had already removed the broad `clip-media` listing policy but still has the equivalent commentary policy.
- Four Supabase Auth users/identities: three Google and one X. Google and X OAuth 2.0 are enabled; email, phone, anonymous, SAML, Web3, and all other listed providers are disabled. The Site URL is `https://www.annotatedextension.com`; the two allowlisted callbacks are the `www` and apex `/auth/callback` URLs.
- No Supabase Edge Functions, no Realtime publication, no `pg_cron` extension or database-scheduled job, and no database branches. The only known scheduled application work remains the Vercel media-cleanup cron.
- Recent dashboard telemetry was healthy: the project overview reported zero warnings/errors across API/Auth/Storage/Postgres/Realtime/Edge Functions for the sampled hour, and the unified log sample contained successful Auth, REST, rate-limit RPC, and health traffic.

Supabase Advisors report zero errors, four security warnings, and one performance warning. The security warnings are broad listing on `commentary-audio`, anonymous and signed-in execution of `public.current_app_user_id()`, and leaked-password protection disabled. The performance warning is the duplicate users auth-provider index. `0015` resolves the listing/function/index findings in the local replay; leaked-password protection is not relevant while password auth is disabled.

### Drift assessment

| Comparison | Result |
|---|---|
| Git migrations vs hosted history | Application table/function structure converges through `0014`. Hosted history retains four earlier security migrations absent from Git and omits the repository's data-only `0010` ledger entry. New additive `0015` captures the durable production-only objects without rewriting history. |
| Git shared types vs live schema | Manual mapping remains intentional. A new local invariant checker now prevents silent table/RLS/policy/function/bucket/seed drift, while generated TypeScript database types remain optional future work. |
| Current deployed schema vs local replay | Ten tables, columns/constraints, 21 policies, and six public function hashes match. Production still lacks the three advisor remediations in locally verified `0015`; no production migration was applied during discovery. |
| Edge Functions/scheduled database jobs | Confirmed none in Supabase. Vercel owns the daily cleanup cron. |
| Auth configuration | Confirmed Google and X OAuth 2.0 enabled; email, phone, anonymous, and other providers disabled. |
| Storage | Both bucket definitions match. Production has two `clip-media` objects and no commentary objects; its broad commentary listing policy is removed locally by `0015`. |

No production mutation, migration, data write, credential rotation, or unrelated-project operation was performed during recovery.

## Chrome Web Store state

- Listing is public at the committed Store URL.
- Item ID matches the public key-derived extension ID: `eaealcbiidjigfndjchchbnjdjicbajb`.
- Current version is 1.8.1; public listing says updated 2026-08-03.
- The repository source and generated Store ZIP are version 1.8.1.
- Rebuilt Store and website ZIPs are byte-identical with SHA-256 `7890d251cc8eebe94af45a2bf690035d438df11a89d865ce6a33720b8664586b`, matching the hash recorded before publication.

This proves the release candidate source survived. It does not independently prove the Store uploaded exactly that ZIP because a downloadable signed Store package/hash was not available through the connected tools.

The public listing event makes the August 2 “hold publication” language in `docs/resubmission-readiness.md` and `docs/final-hardening-review.md` historical. The current public copy is the full product-accurate 1.8.1 description and no longer contains the old “early version” language. It identifies **Laymen, Inc.** as the developer and trader, includes business contact/D-U-N-S information, and links the canonical website, privacy policy, and support site.

The public privacy surface declares Personally identifiable information, User activity, and Website content, plus the three required no-sale/no-unrelated-use/no-creditworthiness commitments. The authenticated private Developer Dashboard tab was restored, but Chrome blocks automation of that privileged gallery surface. Exact private subcategory selections, screenshot inventory, and uploaded-package hash therefore remain manual/dashboard-only evidence; no setting or submission was changed.

## Recovery timeline

### Observed history

- **2026-05-01–05-03:** initial demo became a Vercel/Supabase production service; extension pointed at the API; real Supabase OAuth and the custom domain were added.
- **2026-05-03–05-07:** landing/feed/social surfaces, bookmarks/sharing, support via Resend, privacy/terms, Store packaging, source capture, and marketing/demo assets matured. Version 1.7.3 was the old Store baseline.
- **2026-08-01:** concentrated release hardening. Identity spoofing and direct database access were removed; RLS was forced; signed uploads, server WebM verification, atomic attachment, rate limits, claim audit/moderation, log redaction, accessibility, deterministic packaging, CI, and production proof were added. Migrations `0011`–`0014` were applied to the exact main project after pre/postflight.
- **2026-08-02:** Google/X and extension handoff issues were fixed; real article, YouTube, and podcast journeys published three retained proof annotations; Spotify/player timing and native podcast detection were corrected; startup/landing/demo/typography work was merged; final commit `4748328` refreshed product captures and deployed to Production.
- **2026-08-03:** Chrome Web Store version 1.8.1 was published. No newer Git commit or Vercel source followed it.
- **2026-08-08:** source, Vercel link/config inventory, secure environment snapshots, dependencies, builds, tests, Store artifact, and offline local UI were restored on this Mac. Live production and public data were revalidated.

### What was being built most recently

Immediately before work stopped, the project was not undergoing a framework rewrite. It was completing a release-readiness arc:

1. make extension capture reliable and verifiable across article, YouTube, and podcast sources;
2. harden auth, database, media, claims, abuse boundaries, and CI;
3. prove the physical source matrix in Production;
4. improve the landing/demo so the public presentation matched the working product;
5. package and submit version 1.8.1 to the Chrome Web Store.

The Store publication shows that step 5 occurred after the last repository note. The remaining dated acceptance items were physical microphone commentary, one uninterrupted 90-second capture, forced-expiry refresh, a real Resend inbox receipt, and Store dashboard disclosure/listing review. Publication may have happened with some of those still unrecorded; repository evidence cannot declare them complete.

## Preserved work

### Confirmed

- Complete canonical Git history, all remote branches, all eight PR heads, current `master`, CI configuration, migrations, docs, marketing assets, extension source, web/API source, and deterministic packaging scripts.
- Production deployment source and history sufficient to match the current deployment exactly to `4748328`.
- Live Supabase project, retained product data, real proof annotations, real WebM objects, OAuth/runtime configuration sufficient for current readiness, and the two required Storage systems.
- Published Chrome Web Store 1.8.1 listing and the matching recoverable source/package candidate.
- Vercel configuration names, domains, functions, cron, rewrites, environment-name inventory, and project link.
- Dated production schema/migration/RLS postflight and physical browser acceptance evidence committed to Git.

### Strongly inferred

- No application source used by Production or a preview was lost. Every observed deployment SHA is preserved and reachable from `master`.
- No unmerged feature was stranded remotely. Every surviving branch is zero commits ahead.
- The Store publication was an operational action on the already-preserved 1.8.1 candidate rather than a newer unpushed source build.

## Machine-local state recreated

- Workspace cloned to `/Users/nikocallas/Developer/Annotated`, all remote branches fetched, canonical Vercel project linked in ignored `web/.vercel/`.
- Node 22.17.0, npm 11.12.1, Git 2.51.0, GitHub CLI 2.92.0, Vercel CLI 53.1.1, Supabase CLI 2.98.2, Zip 3.0, and UnZip 6.0 verified.
- `web/node_modules` installed from the committed lockfile with `npm ci`.
- Production client/API build, downloadable extension ZIP, and Store ZIP regenerated.
- Sensitive Vercel Development/Production environment snapshots stored outside Git under `~/.config/annotated/` with directory mode 700 and file mode 600.
- Colima 0.10.3 and Docker CLI 29.7.2 installed; local Supabase Auth, Postgres, Storage, REST, Realtime, Studio, and mail-capture services started successfully. Optional Analytics/Vector services are omitted because Annotated does not use them and their local socket mount is incompatible with Colima.
- A clean `npm run supabase:verify` successfully replays migrations `0001`–`0015`, asserts the exact table/RLS/policy/function/trigger/bucket/grant/index/seed invariants, lints all relevant schemas, and returns no local advisor issues. The result has 10 forced-RLS tables, 21 public policies, both media buckets, six public functions plus the two production-derived private functions, 55 annotations, four demo users, and no direct browser-role table grants. Direct anonymous table and service-RPC probes return 401.
- Local-only keys are generated from Supabase status into `~/.config/annotated/local.env` with mode 600. They never enter the repository. The durable local server and 55-record feed were verified on port 5001 because macOS Control Center owns port 5000.

Not recreated because it would be unsafe or impossible from current authority:

- exact Supabase CLI/connector linkage; authenticated dashboard access was sufficient for the current read-only inventory, so no access token or production password was copied locally;
- old Chrome profiles, unpacked-extension storage, OAuth refresh tokens, microphone permissions, provider sessions, or simulator/browser state;
- Store private dashboard fields. Resend was explicitly removed from the immediate recovery scope by the owner.

## Potentially lost work

| Confidence | Finding |
|---|---|
| Confirmed | Old-machine ephemeral state—dependency caches, local env files, browser sessions/storage, device permissions, CLI links, and untracked build output—did not survive and had to be recreated or remains intentionally absent. |
| Strongly inferred | No deployed or remote source work is missing. Git/Vercel/branches/previews/package evidence converges on preserved code. |
| Possible | Uncommitted edits made after the August 3 Store publication could have existed only on the old computer. There is no deployment, database, package, branch, docs, or API evidence of such work. |
| Unknown | Private Store-dashboard subcategory/screenshot/package selections and any purely local edits made after the August 3 publication cannot be fully inventoried with current connected access. |

No work is labeled lost merely because current administrative access is incomplete.

## Repository vs production drift

| Area | Drift | Severity/action |
|---|---|---|
| Web/API source | None observed: Production SHA equals `master@4748328`. | Healthy. |
| Remote branches | None ahead of `master`. | Healthy; retain until intentionally archived. |
| Chrome Store state | Repository docs say hold; public Store says 1.8.1 published Aug 3. | Documentation drift; README corrected, historical evidence retained. |
| Node requirement | README said Node 24; package, CI, Vercel, and release evidence pin Node 22. | README corrected to Node 22. |
| Dependency audit | Dated docs/remote CI were superseded by a new `nanoid` advisory. | Resolved locally with lockfile-only `nanoid@3.3.18`; full CI is green. |
| Supabase schema | Live table/function structure matches the local replay through `0014`, but the hosted ledger contains four earlier security migrations absent from Git and Production retains three actionable advisor findings. | `0015` captures/remediates these locally; review and apply it to the exact project as a separate production migration. |
| Generated DB types | None exist. | The new invariant checker closes the immediate repeatability gap; generated types remain optional while the explicit storage mapper stays authoritative. |
| OAuth providers | Google and X OAuth 2.0 are both enabled; email, phone, anonymous, and all other providers are disabled. | Healthy and confirmed. |
| Resend | Readiness configured; two Aug 2 provider 403 log events and no recorded inbox proof. | Deferred by owner; Annotated will not use Resend for now. |
| Store disclosures | Public copy/categories, policy/support links, and trader identity now look complete; privileged private subcategories/screenshots/package metadata cannot be scripted. | Manual dashboard evidence remains, with no publication change required for the already-live 1.8.1 build. |
| Production env recovery | Current immutable deployment works; pulled Production snapshot did not yield the sensitive service-role value. | Do not rotate. Use the isolated local Supabase credentials for development. |

## Local environment and verification baseline

### Commands and results

From `web/`:

| Check | Result on 2026-08-08 |
|---|---|
| `npm ci` | Pass; 430 packages installed from lockfile. |
| `npm run check` | Pass. |
| `npm test` | Pass; 55/55 tests. |
| `npm run build` | Pass; client, Express functions, metadata function, and downloadable extension built. |
| `npm run validate:extension` | Pass; MV3 version 1.8.1. |
| `npm run security:scan` | Pass after provider env snapshots were moved outside the repository. |
| `npm audit --audit-level=high` | Pass; zero vulnerabilities after the minimal `nanoid@3.3.18` lockfile update. |
| `npm run build:extension:cws` | Pass; Store and website ZIP hashes match. |
| `npm run supabase:verify` | Pass; migrations `0001`–`0015` reconstruct the database, canonical invariants pass, schema lint is clean, and advisors report no local issues. |
| `npm run ci` | Pass end-to-end after dependency repair. |

### Browser/runtime checks

- Supabase-backed local landing and 55-record feed render on port 5001. `/api/health` and `/api/ready` both return HTTP 200; database, media Storage, OAuth configuration, notifications configuration, moderation, and maintenance checks report `ok`.
- Local Supabase replay produces 37 article, nine podcast, and nine YouTube annotations; `/api/users` returns four demo users without internal `authId` values.
- Production build output renders when served as static preview.
- Production landing/feed/detail render cleanly. A real podcast annotation includes bounded clipped audio, commentary, discussion, profile, source credit, original-source link, and visible claim path.
- Authenticated database writes, OAuth, direct signed upload, microphone, physical tab capture, and account deletion were not repeated during this read-only recovery. Their last physical evidence is the August 2 committed record.

Port 5000 is occupied by the macOS `ControlCe`/Control Center process. Use the repeatable local workflow:

```bash
cd /Users/nikocallas/Developer/Annotated/web
npm run supabase:start
npm run supabase:configure
npm run supabase:verify
npm run dev:local
```

Use `npm run supabase:stop` when the local stack is not needed. Never add `--linked` to the reset command or use Production as a development database.

## Architecture

### Application

- React 18/Vite 7/TypeScript website with Wouter hash navigation for application routes, TanStack Query server state, and Tailwind/Radix UI.
- Express 5 API deployed as Vercel serverless output. Static assets and per-annotation crawler metadata are separately generated/served.
- Vanilla MV3 extension with a side panel, service worker, content script, optional per-site host access, and offscreen recording context.
- No independent backend repository, websocket collaboration service, queue worker, or native application.

### Data

- Supabase Postgres is production persistence; an in-memory/SQLite-shaped adapter is development/test-only.
- Key relationships: users author annotations; users follow users; annotations own comments, threaded replies, votes, bookmarks, claims, and media intents. Claims emit immutable audit events. Rate buckets protect endpoint families.
- Supabase Storage holds verified `clip-media` and `commentary-audio` WebM objects. Original source content is not mirrored wholesale.
- No cache, vector database, search service, or materialized-view system is evidenced. Feed search/filtering is application-level over the API results.

### Authentication and authorization

- Supabase PKCE OAuth, intended Google/X only.
- Site/extension session bundle is handed to the extension only through the manifest-key-derived pinned Store ID and exact Annotated origins.
- API verifies access tokens with Supabase and maps the provider subject to an application user; it derives the actor rather than trusting caller-supplied identity.
- Product writes use the Vercel-only service role after authorization/validation. Forced RLS, revoked direct table grants, moderator allowlisting, signed upload ownership, and service-only RPCs provide defense in depth.

### Media

- Article selection is capped at 100 words and retains source metadata.
- Video/podcast intervals are capped at 90 seconds. Chrome records the actual tab stream in real time. Video is downscaled to 240px height/15fps; podcast is audio-only.
- Server-side EBML/WebM inspection verifies duration tolerance, dimensions, track types, bytes, and object ownership before a single-use atomic publish.
- YouTube and Spotify embeds provide source playback for applicable content; Annotated does not bypass DRM/paywalls or download arbitrary protected source files.

### AI

There is no AI architecture. No model provider, prompt system, retrieval, embedding, memory, tool calling, structured generation, evaluation, or agent system is present. “Annotation” here means human-authored source context.

### Deployment

GitHub Actions verifies source. Vercel builds on branch/master pushes and serves the client/API/metadata/cron. Vercel uses Supabase Auth/Postgres/Storage and Resend. The Chrome extension calls the production API and exact Storage origin. Database migrations are manual, reviewed, additive operations and are not part of web deployment.

## User experience

### Onboarding and creation

1. User learns the source-grounded promise on the landing/demo page.
2. User installs the Chrome extension and signs in with Google or X.
3. In the side panel, the user selects the current page or navigates to a pasted source.
4. For an article, the user imports a highlighted passage and metadata. For media, the user scrubs/nudges an exact range and grants per-site capture access.
5. User adds text or recorded commentary and publishes.
6. Progress states cover capture, upload, verification, failure, and the final public annotation link.

### Consumption and social loop

- Public home/feed, discovery/search/filter/sort, following feed, profiles.
- Source-specific cards/details for article, YouTube/video, and podcast content.
- Bookmarks, up/down votes, comments/replies, follows, share/post-on-X affordances.
- Source credits, canonical/OG metadata, original-source links, visible claims, privacy/terms/support.

### Missing or narrow UX

- No native mobile app. The website is responsive; extension creation is desktop Chrome-only.
- No social notification center or digest. Email is limited to support/claim operations.
- No billing, organization/workspace, multi-author document, team collaboration, or rich moderation dashboard.
- Invite/install routes exist, but a complete lifecycle onboarding/retention system is not evidenced.

## Feature inventory

| System | Classification | Evidence/qualification |
|---|---|---|
| Authentication | Implemented but incomplete | Google/X PKCE, extension handoff, refresh endpoint, logout/account deletion exist; current X toggle and forced-expiry proof need recheck. |
| Onboarding/install | Implemented but incomplete | Landing/demo/install/login and signed-out extension disclosure exist; no guided activation/retention analytics. |
| User profiles | Production-ready | Public profile, identity mapping, follow graph, authored annotations. |
| Primary annotation workflow | Production-ready with acceptance debt | Real article/video/podcast proof posts exist; physical microphone and uninterrupted 90-second proof remain undocumented. |
| Article handling | Production-ready | Exact passage/metadata/source credit; 100-word validation. |
| Video capture | Production-ready with device-risk caveat | Real 240p YouTube capture and trusted server inspection proven. |
| Podcast capture | Production-ready with device-risk caveat | Real audio-only Changelog capture and broad native audio detection proven. |
| Text commentary | Production-ready | Persisted/displayed on cards/details. |
| Audio commentary | Implemented but incomplete | Recording/upload/verification exists; synthetic/generated proof, physical microphone publish still open. |
| Feed/discovery/search | Production-ready | Public and following feeds, search/filter/sort, most-viewed. Search is not a separate indexed service. |
| Reactions/bookmarks | Production-ready | Votes, bookmark mutations, uniqueness-race tests. |
| Comments/replies | Production-ready | Threaded comments, authorization tests, retained production comments. |
| Following | Production-ready | Follow/unfollow and following feed. |
| Sharing/SEO | Production-ready | Canonical detail routes, server crawler metadata, source links, share/X affordances. |
| Claims/trust and safety | Implemented but incomplete | Anonymous claim, audit trail, moderator RPC/API, visible action; inbox delivery and rich admin UI open. |
| Notifications | Partially wired | Resend for support/claims only; no social notifications; delivery evidence incomplete. |
| Admin tooling | Prototype | Secured claims API/moderation exists, no comprehensive admin surface. |
| Database/RLS | Production-ready as of Aug 1; current status unknown | Forced RLS/service RPCs recorded and runtime healthy; fresh catalog access missing. |
| Storage/media lifecycle | Production-ready | Signed direct uploads, inspection, atomic attach, delete/replacement/orphan cron. |
| Rate limiting | Production-ready | Distributed RPC buckets, bounded failure behavior, tests. |
| Observability | Implemented but incomplete | Structured redacted logs, health/readiness; no Sentry/metrics/tracing product. |
| Analytics | Not implemented | No PostHog/GA/event pipeline evidence. |
| Billing | Not implemented/not evidenced | No Stripe or plans/entitlements. |
| AI/retrieval | Not applicable | No AI or vector/search architecture. |
| Testing | Implemented but incomplete | 55 server/security/accessibility invariants and CI; physical/browser E2E is documented but not a committed automated provider suite. |
| Website responsive support | Production-ready by retained evidence | Prior 390/400px checks and accessibility evidence; no native mobile app. |
| Chrome Store distribution | Production-ready/published | 1.8.1 public; public copy/categories/URLs/trader identity are reconciled. Only privileged private dashboard evidence remains manual. |
| Background jobs | Production-ready | One authenticated daily orphan-media cron. |

## Broken or inconsistent systems

1. **Production still has three actionable Supabase advisor findings.** Broad commentary-bucket listing, browser execution of a public SECURITY DEFINER helper, and the duplicate users index are fixed and advisor-clean in additive migration `0015`, but that migration has not been applied to Production.
2. **Store/readiness documentation drifted after publication.** Historical hold language is no longer current; the owner confirms 1.8.1 is published and locally installed. Public listing copy, categories, support/privacy links, and trader identity are reconciled, while private subcategories/screenshots/package metadata remain dashboard-only evidence.
3. **Port 5000 conflicts on this Mac.** The application works on port 5001 through `npm run dev:local`.
4. **Supabase management access is split.** The authenticated dashboard can inspect the exact project, but the generic connector/CLI still exposes only the unrelated Laymen project. Local development is intentionally isolated and does not need production credentials.
5. **Build emits a PostCSS warning.** Non-blocking, but worth removing when touching build tooling.

## Unfinished work

### Observed, not recommended invention

- Physical microphone commentary publish.
- One uninterrupted full 90-second capture.
- Explicit expired-session refresh recovery.
- Private Store subcategory/screenshot/uploaded-package dashboard evidence.
- Reviewed Production application of additive migration `0015` and a fresh advisor rerun.

Resend verification is intentionally excluded at the owner's direction.

No architectural migration appears half-complete. The significant migration was from an unsafe prototype (anonymous-key persistence, caller-supplied identity, client-trusted/base64 media, implicit seeding, no CI) to the current service-role API, forced-RLS, signed/verified media, explicit seed, and CI architecture. That migration is recorded as applied and live.

## What should happen next

### Completed Priority 0 — restore production management authority

1. Completed read-only inventory of exact project `cpqmjujhcwpavrsjadjz` without touching `sdriznnaonzphciekupr`: schema, migration history, grants/RLS, functions/triggers, buckets/policies, Auth providers/URLs, Edge Functions, jobs/branches, advisors, and recent logs. The application mapping matches the live structure; the remaining differences are explicitly captured above.

Also completed: the safe local database, external local configuration, minimal dependency repair, additive production-drift migration, automated invariant check, and green CI baseline.

### Remaining Priority 1 — close release acceptance gaps

2. Public Chrome Web Store audit is complete: 1.8.1, full current copy, privacy categories, canonical URLs, Laymen, Inc. developer/trader identity, support contact, and D-U-N-S are live. Record private dashboard subcategories, screenshots, and uploaded-package metadata manually because Chrome intentionally blocks automation of that privileged surface.
3. On a clean Chrome profile, run only the still-unproven device gates: forced token expiry/refresh, physical microphone commentary, and one uninterrupted full 90-second capture. Google/X browser OAuth, extension handoff, article/30-second video/30-second podcast publishing, logout, and cleanup already have retained physical evidence; the owner confirms Store 1.8.1 is installed locally.
4. Review additive migration `0015`, apply it to the exact production project in a controlled migration window, rerun both advisor categories, and smoke `/api/ready`, feed, Auth, and public media playback. No production change was made during discovery.

### Priority 1 — make recovery repeatable

5. Completed the immediate schema-repeatability step: `npm run supabase:verify` now asserts canonical database invariants and requires clean local lint/advisors. Generated types are optional future work while preserving the current storage abstraction.
6. Add a small browser smoke suite for landing/feed/detail/local states and document provider/device tests separately. Keep the distinction between simulated and physical proof.
7. Keep historical release evidence intact; add dated completion notes rather than rewriting its original state.

### Priority 2 — resume product development

8. After the remaining provider/device checks, choose the next product goal from real user needs. The shortest path to forward development is not a rewrite: keep the extension → verified media → public context architecture and build on the existing social/detail loop.
9. Before selecting growth features, clarify the initial user wedge and activation metric. The repository supports several directions but does not choose one conclusively.

## Recovery conclusion

Annotated survived. Canonical source, production deployment, database runtime/data, extension package, Store publication, and the recent product trajectory are all recoverable. The local workspace is reproducible and advisor-clean, the fresh production inventory is complete, and the current schema differences are preserved in one reviewed additive migration rather than hidden.

The right next move is to apply and verify `0015`, record the three remaining device-only gates and the private Store dashboard fields, then resume feature work from the existing hardened architecture. Resend is intentionally not part of that path.

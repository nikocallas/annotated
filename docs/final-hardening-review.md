# Annotated final hardening review

Review date: August 2, 2026

## Executed Codex goal

> Make Annotated submission-ready by redesigning the production landing page in a t3.codes-inspired, product-forward style using accurate product/feed screenshots; creating and integrating a new demo video; and completing a final functional, polish, security, and submission-rules hardening review, with verified changes merged to GitHub master and automatically deployed to Vercel Production.

## Outcome

The candidate presents the actual product instead of invented marketing UI, adds a
new reproducible demo-video pipeline, and keeps the existing hardened extension and
social product intact. The website changes do not alter the extension manifest,
permissions, authentication, database schema, or published annotation data.

## Bounty requirements

| Requirement | Evidence | Result |
|---|---|---|
| Sidebar Chrome extension is the primary surface | Manifest V3 `side_panel`, pinned Store identity, and working 1.8.1 side-panel package | Pass |
| Clip YouTube up to 90 seconds at 240p | Real 0:27–0:57 production annotation plus automated 61/90-second validation | Pass |
| Highlight news text and retain metadata | Real YC article publication with exact selected text, title, publisher, and source URL | Pass |
| Grab a podcast segment up to 90 seconds | Real 0:30–1:00 Changelog audio publication plus bounded-media validation | Pass |
| Add text or recorded-audio commentary | Text paths and a validated recorded WebM commentary path pass; physical microphone publication remains an owner acceptance check | Technical pass; physical acceptance open |
| Public landing page links to the source | Retained article, video, and podcast detail pages show the source and source credits | Pass |
| Visible File a claim control on every annotation | Shared detail-page control and claim workflow tests cover every source type | Pass |
| Google or X sign-in, no email/password | Both providers completed live web callbacks; the extension handoff completed in Chrome | Pass; forced-expiry refresh acceptance open |
| Public social feed with follow and comment | Feed, profiles, following, comments/replies, voting, bookmarks, and sharing were exercised against durable data | Pass |

## Chrome Web Store policy review

| Policy area | Candidate evidence | Result |
|---|---|---|
| Single, narrow purpose | Capture a user-selected source excerpt, add context, and publish a source-linked annotation | Pass |
| Helpful side-panel behavior | Opens only from user invocation and complements the active source; no search hijacking, new-tab override, or ads | Pass |
| Minimum permissions | Every required permission is exercised and documented; source-page host access is optional and requested per site | Pass |
| Manifest V3 / remote hosted code | MV3 package; no remote scripts/styles, `eval`, `new Function`, or remotely supplied logic | Pass |
| Minimum functionality | Article, video, podcast, commentary, publishing, and feed behavior are implemented in the package and live service | Pass |
| Accurate listing metadata | Store draft describes current 1.8.1 behavior and uses actual 1280×800 screenshots | Pass in repository; owner dashboard update open |
| User-data disclosure | Pre-auth UI explains active-tab data, local OAuth state, chosen publication, and claim data; Privacy/Terms are linked before sign-in | Pass in product |
| Privacy policy and secure handling | Policy covers identity, auth state, browser/source data, user content, processors, retention/deletion, and HTTPS-backed services | Pass |
| Dashboard privacy fields | Draft explicitly maps PII, authentication, browsing activity, user activity, website content, form data, and user-generated content | Owner action open |
| Rights and source attribution | Every retained detail page keeps the original source and visible claim flow | Pass |

## Website and demo QA

- New landing and demo routes compile in the production build.
- Live production feed, video-detail, podcast-detail, and side-panel captures replace generated product mockups.
- The 1280×720 H.264 demo is 52.97 seconds, caption-led, streamable with a fast-start atom, and accompanied by an accurate poster and chapter track.
- The video is reproducible with `npm --prefix web run demo:render`; the renderer uses the checked-in scenes and real captures.
- Desktop and mobile pages have zero horizontal overflow at 1440×1000 and 390×844.
- Light, dark, and reduced-motion behavior were rendered and inspected.
- Landing and demo return zero axe WCAG 2.0/2.1 A/AA violations on desktop/mobile in light/dark.
- Primary CTA, demo navigation, video duration, product-image loading, heading order, and keyboard focus were exercised in Chrome.
- The design-to-implementation comparison is recorded in `docs/design/annotated-landing-fidelity.md`.

## Security and release evidence

- Full local CI passes: TypeScript, 55/55 server tests, client/server/Vercel builds, extension validation, working-tree and repository-history secret scans, and `npm audit` with zero vulnerabilities.
- Manifest host scope, optional source-site access, pinned extension ID, package contents, and lack of remote executable code are enforced by `validate:extension`.
- Store and website packages normalize file order, modes, UTC timestamps, and entry order and reproduce SHA-256 `7890d251cc8eebe94af45a2bf690035d438df11a89d865ce6a33720b8664586b`.
- The repository and history secret-pattern scan is enforced by `security:scan`.
- GitHub CI and the Vercel Production build pass for merge commit `a5900d736a541c321b10d0df70f219b779f49688`.
- Production `/api/health` and `/api/ready` return HTTP 200; database, media storage, OAuth, notifications, moderation, and maintenance all report `ok`.
- Production landing, demo, feed, product imagery, and the retained article, YouTube, and podcast annotations return HTTP 200. The demo returns `video/mp4` and supports HTTP range requests with 206 responses.
- Post-deployment Chrome automation found zero WCAG 2.0/2.1 A/AA axe violations on the landing page at desktop and mobile viewports, zero horizontal overflow, and no unloaded product images. The demo reports a 52.966667-second duration.
- The deployed production functions emitted no error/fatal runtime logs during the smoke window; the only recent error clusters belong to the intentionally environment-less protected preview deployment.
- No Chrome Web Store upload or publication is authorized by this website deployment.

## Remaining owner actions before Store resubmission

1. In the Chrome Web Store dashboard for publisher **Niko Callas** under `niko@laymen.com`, paste/review the 1.8.1 listing draft and replace the old “early version” language.
2. Update the dashboard privacy categories to include the current equivalents of Authentication information, Web browsing activity, Form data, and User-generated content; confirm microphone/tab-media processing.
3. Upload the current 1280×800 article, video, and podcast screenshots from `marketing/assets/`; confirm the support, privacy, terms, website, and trader/contact fields.
4. Perform one physical microphone-commentary publication, one uninterrupted 90-second capture, and one forced-expiry session refresh.
5. Verify one real claim notification reaches the owner-controlled Resend inbox.
6. Only after those checks, upload `annotated-chrome-web-store.zip` version 1.8.1 and submit it for review.

## Recommendation

Website production deployment: **GO.** Local CI, GitHub CI, Vercel build, public-route smoke tests, production readiness checks, responsive Chrome QA, and production runtime-log review are green.

Chrome Web Store resubmission: **HOLD only for the six owner/dashboard acceptance actions above.**

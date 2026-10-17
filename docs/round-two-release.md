# Round-two release checklist

Branch: `agent/bounty-p0-fixes`. Prepared 2026-10-17. Each step is either
code that is already committed or an owner action that must be done by hand.

## 1. Push and preview (owner)

```bash
cd ~/Developer/Annotated
git push -u origin agent/bounty-p0-fixes
```

Vercel builds a preview from the branch. The preview uses the production
Supabase project, so the database steps below must be finished before testing
annotation types, requests, or screenshots on it. Everything else (layout,
recorded-clip playback, Spotify embeds, trending, For You, invites) works
without them, because new columns are only written when they have a value.

## 2. Database (owner approval, then apply in order)

| Migration | What it does | Reversible? |
|---|---|---|
| `0015_reconcile_production_security.sql` | Records production-only RLS guard objects; fixes the `current_app_user_id()` advisor finding | Yes (additive) |
| `0016_remove_seed_content.sql` | Deletes the 55 seed annotations and 4 seed users, with their comments, follows, and one claim | **No.** Take a backup or export first. |
| `0017_annotation_types_requests_screenshots.sql` | Adds `annotations.annotation_type`, the `annotation_requests` table, the `page-screenshot` media kind, and screenshot attachment | Yes (additive) |

Run `0016` right before recording real clips, so the feed is never empty for
long. After applying, run the Supabase security and performance advisors. The
expected new INFO finding is "RLS enabled, no policy" on
`annotation_requests`, matching the other API-only tables.

## 3. Ship (owner)

1. Merge the branch to `master`; Vercel deploys production.
2. Upload `annotated-chrome-web-store.zip` (version 1.9.0, built with
   `npm run build:extension:cws`) in the Chrome Web Store dashboard. Update the
   listing screenshots to show the type picker, the "On this page" panel, and
   the comment-first post page.
3. Make the GitHub repository public. The bounty rules say entries are open
   source, and the repo now carries an MIT `LICENSE`. Run
   `npm run security:scan` first; it scans the working tree and history.
4. Optional: set `RESEND_API_KEY`, `SUPPORT_FROM_EMAIL`, and `SUPPORT_TO_EMAIL`
   in Vercel so email invites send directly instead of opening the user's mail app.

## 4. Content and submission (owner)

1. Record 10–15 real annotations from 2–3 real accounts, mixing kinds of
   take, with real comments and follows.
2. Record the demo from `docs/round-two-demo-script.md`.
3. Resubmit at https://bounty.thisweekinstartups.com/enter. The current entry
   on the board is from May 6, 2026.
4. Post the demo on X tagging @Jason and @twistartups.

## Dependency audit note

`npm run audit` blocks on high-severity advisories in runtime dependencies
(currently none). It also runs the full audit and reports, without blocking,
advisories in build-only tooling: as of 2026-10-17, `braces` (through
Tailwind's `chokidar`/`micromatch`) has a published advisory with no fixed
release. It processes only the repository's own glob patterns at build time.
`tailwindcss-animate` moved to devDependencies because it is a build-time
Tailwind plugin.

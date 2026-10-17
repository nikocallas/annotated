# Judging notes: This Week in Startups E2338 (Round 1 review)

Source: "Jason's Put a $5K Bounty on His Dream Chrome Extension | E2338",
https://www.youtube.com/watch?v=X8SALDwOpTU (judges: Jason Calacanis, Lon Harris).
Notes are paraphrased from the episode's auto-captions; timestamps are approximate.
Our status is checked against `agent/bounty-p0-fixes` on 2026-10-17.

## How the contest is being judged

- **Rules (2:00).** Whatever code is written is open source. Jason controls the
  contest and can cancel, split, or award multiple prizes. Rules can change.
- **Scores given.** #1 Robert, annotated.wtf: 8.5/10. #2 Alan Shiflett: about 8.
  #3 Chirag Asarpota, anotated.com: about 6 "in terms of refinement, design".
- **Gut split before round two (23:30).** Roughly 80/20 between #1 and #2.
  Lon's favorite "all along" was #1: the extension is easy, intuitive, pretty,
  and does not look vibe-coded.
- **Rounds.** Round two about two weeks after the episode; maybe round three,
  then a pick. Jason posted "still time to win" on Oct 11, 2026.
- **What they are really scoring:** refinement, design, intuitive sidebar,
  social-network completeness, and the quality of the demo itself.
- **What comes next (24:30).** Jason wants to talk to the founders and possibly
  incubate the winner inside his venture firm as a startup.

## The vision Jason states (0:00 to 1:30, 24:30 to 27:30)

- Highlight any text on the web, then **dispute it or add context**; others can
  open that page and add their own opinions.
- Long-term options he named:
  - A public service.
  - A Reddit/Twitter-like social network.
  - **Bounties on stories**: request that a specific person annotate or
    fact-check a story.
  - A **data layer for LLMs**: experts publicly annotating things like legal
    cases.

## Feedback, mapped to our build

Status key: ✅ have it · 🟡 partial · ❌ missing.

### Annotation page layout
| # | Judge feedback | Our status | Action |
|---|---|---|---|
| L1 | **The comment is the star; put it at the top.** Then the quote or clip, then the source as context. #2 lost points because the page read like a link with comments under it (13:30–14:30, 18:30). | ❌ Detail page and feed card show the title and clip first, with commentary below ("Why this matters"). | Reorder detail page and FeedCard: author + commentary → quote/clip → source card. |
| L2 | **Source card with a thumbnail or screenshot of the page**, plus a little more about the story (5:30, 13:30, 19:00). | 🟡 We capture `og:image` (`sourceImage`) but do not show it on the article source card. | Show a thumbnail in the source card; consider a page screenshot via `chrome.tabs.captureVisibleTab` at publish time. |
| L3 | Profile panel on the permalink: who annotated, how many annotations, how many followers (13:30–14:00). | 🟡 There is an "Annotated by" panel; counts not shown there. | Add annotation and follower counts to the author panel. |
| L4 | Date and time are shown (19:30). | ✅ | — |
| L5 | Clean metadata. They flagged a stray "21" before a handle as looking broken (15:30). | 🟡 Mostly clean. The vote row reads "Upvote 0 Downvote". | Audit cards for raw labels and leaked metadata. |

### Extension flow
| # | Judge feedback | Our status | Action |
|---|---|---|---|
| E1 | **Video clipping should feel like QuickTime: drag handles.** They praised #1 and marked down #3 for typing timecodes ("two extra steps") (8:00–8:30, 21:30–22:00). | 🟡 We have a draggable range, typed times, one-second nudges, and "Use current time" buttons. | Make dragging the default. Keep the handles and the page playhead synced live both ways; demote the timecode inputs. |
| E2 | **After publishing, take the user straight to the permalink**, with share and invite options. Making them click "view note" was called out as a UX miss (22:30). | ❌ Side panel shows "Published!" with a "View post" button. | Auto-open the permalink on publish. Show share, copy-link and post-to-X right there. |
| E3 | **Post your comment to X from the sidebar** without leaving (9:00). | 🟡 Post-to-X exists on the website (feed card and detail page), not in the side panel. | Add "Also post to X" to the publish step. |
| E4 | **Annotation types: hot take, fact check, steelman, receipts, explainer.** Jason: "plus one" (15:00). | ❌ | Add a stance/type picker (include Dispute) and show it as a badge. Allow filtering the feed by type. |
| E5 | **Highlight a passage, not the whole article.** This is Jason's core idea; he noted #1 shared whole articles (2:30–3:00). | ✅ Passage clipping works. | Lead with this in the demo. |
| E6 | Sidebar guidance such as "select 30–1,000 characters" was liked (5:00). | 🟡 | Check that the empty state tells users exactly what to do. |
| E7 | **Sign-in prompt inside the sidebar** was noticed as new and good (18:00). | ✅ | — |
| E8 | **Highlighter branding.** A yellow highlighter was Jason's original icon idea; two entries used it (5:00, 12:30). | ❌ Our mark is an orange quotation mark. | Consider a highlighter mark or a yellow highlight motif in the logo and in-page selection. |

### X posts
| # | Judge feedback | Our status | Action |
|---|---|---|---|
| X1 | Annotating X posts works in #1 (8:30). | ✅ The content script detects X status URLs. | Include an X post in the demo. |
| X2 | **Preserve tweets with a screenshot, since they get deleted.** Offer embed, screenshot, or both (11:00–12:00). | ❌ We store metadata only. | Capture a screenshot of the post (`captureVisibleTab`, cropped) to Storage at publish time, and show it beside or instead of the embed. |

### Social layer
| # | Judge feedback | Our status | Action |
|---|---|---|---|
| S1 | **Comment threads turn an annotation into a destination**, like Digg, Fark or Reddit (7:30). | ✅ Comments exist. | Seed real discussions on real posts before the demo. |
| S2 | **Trending feed**, possibly an algorithmic one (10:30); trending topics or sources on the right rail (16:00, 19:30). | ❌ We have a "Live signal" card only. | Add Trending sources and Trending topics to the right rail. |
| S3 | **"For You" algorithmic feed** that learns your interests (16:00). | 🟡 A For You tab exists. | Make sure it is real, not just a relabeled Latest. |
| S4 | **"People worth following"** on the top right (16:00). | 🟡 It exists, but it lists seed personas. | Populate it from real users once seeds are removed. |
| S5 | **Invite by entering someone's email** (16:00). | 🟡 The invite page has a mailto link and copy-link. | Add an email field that sends an invite. Resend is already referenced in the server code. |
| S6 | Home / Explore / Profile / Saved navigation (19:30). | ✅ | — |

### Fair use and trust
| # | Judge feedback | Our status | Action |
|---|---|---|---|
| T1 | **"File a claim" button**; they pointed it out on two entries (7:00, 22:30). | ✅ It exists but sits below the fold. | Move it next to the clip. |
| T2 | Clips should be a small slice that credits and links to the original; around two minutes was fine to them; criticism is a fair-use factor (6:00–6:30). | ✅ 90-second cap, 240p, source links. | Mention fair-use framing in the demo voiceover. |

### Demo
| # | Judge feedback | Action |
|---|---|---|
| D1 | **"Examples matter."** Highlighting a headline made #3's demo confusing. Pick a substantive paragraph and say something insightful about it (19:00–21:30). | Script the demo around 2–3 strong examples. Lon suggested a Dwarkesh-style essay where one sentence's phrasing matters. Use a TWiST or All-In clip for the video. |
| D2 | Show it working live, logged in, with a real account (12:00). | Record on production with real accounts and real comments. No seed data. |
| D3 | Show the clip start/end being set by dragging (8:00). | Use drag handles on camera. |

## Bigger ideas worth showing (they signal "startup", not "contest entry")

- **Request an annotation (bounty on a story).** Ask a specific person to
  fact-check or annotate a URL (26:00).
- **Dispute and fact-check stance** as the core action. This was Jason's
  original idea (0:30).
- **Expert annotations as a data asset**, for example verified-expert badges on
  domains like law (26:30).

## Competitive note

The round-one leader, annotated.wtf, was down on 2026-10-17 ("Failed to start
container").

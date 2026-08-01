# Chrome Web Store 1.8.0 listing draft

This is owner-review copy for the existing item `eaealcbiidjigfndjchchbnjdjicbajb`. It does not authorize an upload or publication.

## Single purpose

Annotated lets a user capture a short, source-linked passage or media moment from the active tab, add commentary, and publish it to their Annotated profile and public feed.

## Short description

Clip 90-second highlights from videos, podcasts, and articles. Add commentary and share with the original source attached.

## Detailed description

Annotated is a Chrome side-panel extension for capturing the exact part of an article, video, or podcast that matters—then adding your own context and sharing it without losing the original source.

Use Annotated to:

- capture a selected passage from an article with its title, publisher, and source URL;
- capture a user-selected video segment of up to 90 seconds, constrained to 240p;
- capture a user-selected podcast segment of up to 90 seconds as audio;
- add written commentary or record an audio note;
- publish a source-linked annotation page;
- revisit annotations in your profile and public feed;
- follow people, comment and reply, vote, and bookmark; and
- file a claim from any annotation page when content raises a rights concern.

The side panel is the primary creation experience, so the source remains visible while you choose a passage or time range and add context. Annotated never presents a clip as the original work: every published annotation keeps a visible link to its source.

Sign-in uses Google or X through Supabase Auth. Annotated does not offer an email/password account flow. Media is uploaded directly to Annotated's Supabase Storage project using a short-lived signed URL, then inspected for duration, tracks, dimensions, MIME type, and size before an annotation can become public.

Annotated does not bypass DRM, authentication, paywalls, or other technical access controls. Capture starts only after a user invokes the extension and publishes only the selected excerpt.

Website: https://www.annotatedextension.com/

Privacy: https://www.annotatedextension.com/privacy

Terms: https://www.annotatedextension.com/tos

Support: https://www.annotatedextension.com/support

Claims: https://www.annotatedextension.com/claims/how-it-works

## Permission justifications

| Permission | Store-dashboard justification |
|---|---|
| `sidePanel` | Provides Annotated's primary clipping and commentary interface beside the source page. |
| `activeTab` | Grants temporary access only after the user invokes Annotated, so it can read the active source and capture the selected item. |
| `scripting` | Injects the packaged content script into the user-invoked active tab to read source metadata, selected text, and media timing and to control play/pause/seek during a chosen capture. |
| `tabs` | Identifies the active source tab, reacts when it navigates, opens sign-in/result pages, and keeps the side panel synchronized with the current source. |
| `storage` | Stores the user's Annotated OAuth session and minimal extension state locally in Chrome. |
| `offscreen` | Provides the packaged DOM context required by Manifest V3 for microphone recording, tab-stream recording, WebM encoding, and 240p canvas rendering. |
| `tabCapture` | Captures only the user-selected interval of the invoked active tab as a real video/audio artifact, with a hard 90-second cap. |
| `annotatedextension.com`, `www.annotatedextension.com` | Calls the Annotated API and permits the production OAuth callback page to hand the verified session to the published extension. |
| `cpqmjujhcwpavrsjadjz.supabase.co` | Uploads the encoded WebM Blob directly to the exact Annotated Storage project using a short-lived, owner-scoped signed URL; avoids proxying large media through the API. |

No permission allows unattended background browsing or broad all-sites access. `activeTab` and the toolbar/side-panel user gesture scope page access to the selected tab.

## Privacy disclosure review

Select the dashboard categories that accurately reflect the shipped behavior:

- **Personally identifiable information**: provider profile name/handle/avatar and claim/support contact information where the user chooses to submit it.
- **Authentication information**: short-lived access token and rotating refresh token stored in `chrome.storage.local` for Google/X sessions.
- **User activity**: annotations, follows, comments/replies, votes, bookmarks, and views used to provide the social product.
- **Website content**: selected article text, source title/author/publisher/image metadata, and the user-selected tab audio/video excerpt.
- **User-generated content**: written commentary and recorded audio commentary, if presented as a separate dashboard category.

Confirm the existing declarations remain true:

- data is not sold;
- data is used only for Annotated's user-facing purpose, security, support, and legal/claim handling;
- data is not used for creditworthiness or lending;
- no remote executable code is used; and
- the privacy policy names Vercel, Supabase, Resend, Google, and X where relevant and explains retention/deletion.

## Listing asset review

- Replace any screenshot that depicts placeholder clipping with the 1.8.0 side-panel capture states.
- Include one article selection, one 240p YouTube capture, one podcast capture, and one public detail page showing both **Original source** and **File a claim**.
- Ensure screenshots contain no private tokens, email addresses, browser profile data, third-party account menus, or unlicensed full-length media.
- Remove the current “early version” / “workflows may continue to improve” language before resubmission.
- Verify version 1.8.0, Chrome 116 minimum, support/privacy URLs, category, language, trader details, and the new exact Storage host warning in the draft dashboard before publishing.

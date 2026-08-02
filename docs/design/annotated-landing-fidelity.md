# Annotated landing fidelity ledger

This ledger compares the accepted 2026 landing concept in
`docs/design/annotated-landing-2026-concept.png` with the implemented website.
The concept was used as a layout and art-direction specification; every product
surface in production was replaced with a capture of the working product.

| Concept decision | Implemented result | Fidelity |
|---|---|---|
| Quiet three-part header with a compact logo, centered navigation, and one primary CTA | Sticky parchment header with Feed, Demo, How it works, Sign in, theme control, and the Chrome Store CTA | Direct |
| Oversized centered editorial hero | The exact two-line promise, “Clip the exact moment. Add the missing context.”, uses the archival serif and signal-orange second line | Direct |
| Immediate, oversized product proof | Live 1440px production-feed capture with the real 1.8.1 side panel overlaid at the exact-range editor | Direct, with real UI replacing concept UI |
| Articles, video, podcasts, and provenance called out before feature detail | Compact source-type proof rail plus “Always linked to the source” | Direct |
| Three-step context workflow | Capture the moment, Add what’s missing, and Publish with provenance are retained in a ruled three-column system | Direct |
| Dedicated exact-range product moment | A full, real YouTube-plus-side-panel capture proves numeric start/end entry, the selected range, and the 90-second bound | Stronger than concept |
| Demo section with a prominent video player | A new 53-second, caption-led MP4 and matching poster are embedded on the landing page and the expanded `/demo` page | Direct |
| Source-first social-feed section | The section uses the retained public YouTube annotation, including playable media, commentary, source credits, clip range, and discussion | Stronger than concept |
| Large framed final statement | “The internet deserves its footnotes.” closes the page with Store and feed actions | Direct |
| Desktop-first visual hierarchy that collapses cleanly | At 390px the navigation simplifies, product frames stack, feature grids become single-column, and the marquee becomes a readable two-line statement | Intent-preserving adaptation |

Deliberate deviations:

- The implementation omits concept testimonials, customer logos, and adoption metrics because Annotated does not yet have verified evidence for those claims.
- The implementation keeps Annotated’s established parchment, ink, orange, and ultramarine system instead of borrowing t3.codes’ palette or brand assets.
- The mobile product story favors legibility and vertical sequencing over the concept’s desktop overlap.
- Public product captures are dated, versioned artifacts from the working application; no generated image is presented as product UI.

QA comparison completed at 1440×1000 and 390×844 in light and dark themes,
with reduced motion enabled. Both landing and demo pages have zero document-level
horizontal overflow, zero missing assets after load, and zero axe WCAG 2.0/2.1 A/AA
violations.


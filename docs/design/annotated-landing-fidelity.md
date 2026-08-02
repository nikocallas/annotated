# Annotated landing fidelity ledger

This ledger compares the accepted 2026 landing concept in
`docs/design/annotated-landing-2026-concept.png` with the implemented website.
The concept was used as a layout and art-direction specification; every product
surface in production was replaced with a capture of the working product.

| Concept decision | Implemented result | Fidelity |
|---|---|---|
| Quiet three-part header with a compact logo, centered navigation, and one primary CTA | Sticky parchment header with Feed, Demo, How it works, Sign in, theme control, and the Chrome Store CTA | Direct |
| Oversized centered editorial hero | The exact two-line promise, “Clip the exact moment. Add the missing context.”, uses one tightly tracked Inter family with a signal-orange second line and collision-safe line height | Intent-preserving user-directed revision |
| Immediate, oversized product proof | Live production feed and the real 1.8.1 side panel are docked inside one browser window; neither panel, label, nor header overlaps the imagery | Direct, with real UI replacing concept UI |
| Articles, video, podcasts, and provenance called out before feature detail | Compact source-type proof rail plus “Always linked to the source” | Direct |
| Context-layer statement below the hero product | “The context layer of the internet.” now moves continuously in two identical horizontal groups with six rendered repetitions and a no-motion fallback | User-directed motion treatment |
| Three-step context workflow | Capture the moment, Add what’s missing, and Publish with provenance are retained in a ruled three-column system without the oversized competing section headline | Closer to concept |
| Dedicated exact-range product moment | Heading and supporting copy sit in their own ruled region above a full-width real YouTube-plus-side-panel browser frame; the three controls form a separate rail below it | Stronger than concept; no text/image collision |
| Demo section with a prominent video player | A new 53-second, caption-led MP4 and matching poster are embedded on the landing page and the expanded `/demo` page | Direct |
| Source-first social-feed section | The section uses the retained public YouTube annotation, including playable media, commentary, source credits, clip range, and discussion | Stronger than concept |
| Large framed final statement | “The internet deserves its footnotes.” closes the page with Store and feed actions | Direct |
| Desktop-first visual hierarchy that collapses cleanly | At 390px the navigation simplifies, the hero uses the real mobile-feed capture, product frames stack without overlap, feature rails become single-column, and the marquee keeps moving horizontally | Intent-preserving adaptation |

Deliberate deviations:

- The implementation omits concept testimonials, customer logos, and adoption metrics because Annotated does not yet have verified evidence for those claims.
- The implementation keeps Annotated’s established parchment, ink, orange, and ultramarine system instead of borrowing t3.codes’ palette or brand assets.
- The mobile product story favors legibility and vertical sequencing over the concept’s desktop overlap.
- Public product captures are dated, versioned artifacts from the working application; no generated image is presented as product UI.

QA comparison completed at 1440×1000, the concept-native 864×1820 viewport,
768×1024, and 390×844, plus a reduced-motion pass. The rendered landing page uses
one computed Inter font stack, has zero heading/image collisions, zero clipped
headings, zero document-level horizontal overflow, zero missing assets after load,
and zero axe WCAG 2.0/2.1 A/AA violations. The marquee has two equal groups, six
rendered repetitions, a continuous transform loop, and no animation when reduced
motion is requested.

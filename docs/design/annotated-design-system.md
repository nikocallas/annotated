# Annotated design system

## Position

**Annotated is the context layer of the internet.** It lets someone clip the exact moment from an article, video, or podcast, add the perspective that makes it matter, and carry both into a source-linked social conversation.

The product should feel credible enough for research, alive enough for a social feed, and exact enough for editing media. The visual metaphor is an annotated archival sheet: primary-source material remains central while a signal-colored rail makes the added perspective unmistakable.

## Identity

- **Ink** `#171512` — primary text, media editing surfaces, and high-contrast controls.
- **Parchment** `#F6F1E7` — the shared web and extension canvas.
- **Paper** `#FFFDF8` — cards, panels, and authored surfaces.
- **Signal orange** `#FF6A1A` — clipping actions, provenance rails, selected ranges, and the quotation mark.
- **Ultramarine** `#4B57D9` — social/discovery states, secondary emphasis, and focus support.
- **Rule** `#D9D1C4` — borders and structural separation.

Use orange for the act of selecting or publishing evidence. Use ultramarine for navigating or interacting with the social layer. Never use both as undifferentiated decoration.

## Typography

- UI and controls: Inter or the system sans stack, compact and direct.
- Source excerpts and major statements: Iowan Old Style, Palatino, or Georgia.
- Timecodes and technical state: system monospace.
- Eyebrows are uppercase, 11–12px, bold, with generous tracking.

## Core components

### Source sheet

A warm-paper card with a 3px signal rail. It follows this information order: author, provenance, exact source excerpt/media, “Why this matters” note, then social actions. The primary source should always carry more visual weight than the annotation.

### Exact range editor

An ink timeline containing an orange waveform or frame rhythm, two orange range handles, dimmed out-of-range regions, and a white playhead. It must support drag scrubbing, Set in, Set out, ±1 second nudges, a precise time readout, preview, and a 90-second maximum.

### Quotation mark

The orange rounded-square quotation mark is the compact brand asset. It should remain simple at 16px, read as a pair of quotation marks, and never be accompanied by a second decorative icon.

## Voice

Precise, curious, and source-aware. Prefer “exact moment,” “source,” “perspective,” “annotation,” and “conversation.” Avoid generic creator-economy language such as “content,” “viral,” or “engagement” unless describing analytics.

Primary promise: **Clip the exact moment. Add the missing context.**

## Interaction rules

- All controls have a minimum 44px target.
- Keyboard focus is clearly visible, using a contrast-safe orange or ultramarine ring.
- Motion is brief and functional; respect `prefers-reduced-motion`.
- Source URLs are never hidden or stripped from a published annotation.
- Media clips are bounded to 90 seconds and always show their selected time range.
- Authentication, publishing, and permissions explain what will happen before the action.

## Reference concepts

- `annotated-feed-concept.png` — desktop social-feed direction.
- `annotated-extension-concept.png` — exact-range extension direction.

These concepts define hierarchy and identity, not literal pixel requirements. Production components must preserve accessibility, real data density, responsive behavior, and Chrome side-panel constraints.

import assert from "node:assert/strict";
import test from "node:test";
import type { AnnotationWithRelations } from "@shared/schema";
import { metadataForAnnotation, renderAnnotationPage } from "./annotation-page";

const annotation = {
  id: "clip one/unsafe",
  sourceTitle: 'A <title> & "moment"',
  sourceUrl: "https://source.example/story",
  sourceImage: "javascript:alert(1)",
  sourcePublication: "Example",
  clipText: "The selected passage.",
  commentaryText: 'Why this <matters> & "now".',
  user: { displayName: "Niko & Co" },
  isPublic: 1,
} as AnnotationWithRelations;

test("per-annotation metadata uses the canonical production domain and safe images", () => {
  const metadata = metadataForAnnotation(annotation);
  assert.equal(metadata.canonical, "https://www.annotatedextension.com/a/clip%20one%2Funsafe");
  assert.equal(metadata.image, "https://www.annotatedextension.com/og-image.png");
  assert.match(metadata.title, /A <title>/);
});

test("annotation HTML exposes crawler-visible escaped metadata", () => {
  const template = `<!doctype html><head>
    <title>Default</title>
    <meta name="description" content="Default" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://www.annotatedextension.com/" />
    <meta property="og:title" content="Default" />
    <meta property="og:description" content="Default" />
    <meta property="og:image" content="https://www.annotatedextension.com/og-image.png" />
    <meta property="og:image:alt" content="Default" />
    <meta name="twitter:title" content="Default" />
    <meta name="twitter:description" content="Default" />
    <meta name="twitter:image" content="https://www.annotatedextension.com/og-image.png" />
    <meta name="twitter:image:alt" content="Default" />
  </head><body></body>`;
  const html = renderAnnotationPage(template, metadataForAnnotation(annotation));
  assert.match(html, /rel="canonical" href="https:\/\/www\.annotatedextension\.com\/a\/clip%20one%2Funsafe"/);
  assert.match(html, /Why this &lt;matters&gt; &amp; &quot;now&quot;\./);
  assert.doesNotMatch(html, /javascript:alert/);
});

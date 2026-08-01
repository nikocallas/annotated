import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const webRoot = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(webRoot, path), "utf8");

test("public UI retains core WCAG-oriented semantics and contrast tokens", () => {
  const css = read("client/src/index.css");
  const layout = read("client/src/components/AppLayout.tsx");
  const siteNav = read("client/src/components/SiteNav.tsx");
  const feed = read("client/src/pages/feed.tsx");
  const button = read("client/src/components/ui/button.tsx");
  const document = read("client/index.html");

  assert.match(css, /--primary-readable:/, "foreground accents must not reuse the low-contrast fill orange");
  assert.match(css, /--muted-foreground:\s*40 6% 40%/, "light muted copy must retain AA contrast");
  assert.match(css, /prefers-reduced-motion:\s*reduce/, "public UI must respect reduced motion");
  assert.match(css, /:focus-visible/, "public UI must preserve visible keyboard focus");
  assert.match(css, /min-height:\s*2\.75rem/, "controls must retain 44px touch targets");
  assert.doesNotMatch(button, /min-h-(?:8|9|10)\b/, "button variants must not override the 44px target minimum");
  assert.match(button, /icon:\s*"h-11 w-11"/, "icon-only buttons must retain a 44px target");
  assert.match(layout, /aria-label="Primary"/, "desktop navigation must have an accessible name");
  assert.match(layout, /aria-label="Primary mobile"/, "mobile navigation must have an accessible name");
  assert.match(siteNav, /aria-current=/, "path navigation must expose current-page state");
  assert.match(feed, /<h1 className="sr-only">Annotated public feed<\/h1>/, "feed needs a level-one heading");
  assert.doesNotMatch(document, /maximum-scale|user-scalable\s*=\s*no/i, "the viewport must permit user zoom");
});

test("feed cards do not nest mutation controls inside the annotation link", () => {
  const card = read("client/src/components/FeedCard.tsx");
  assert.doesNotMatch(
    card,
    /<Link href=\{`\/a\/\$\{a\.id\}`\} className="block">/,
    "an outer card link would contain vote, bookmark, share, and delete controls",
  );
  assert.match(card, /aria-label=\{`Open annotation:/, "each card needs an explicit accessible detail link");
});

test("support validation associates missing required fields with its alert", () => {
  const support = read("client/src/pages/support.tsx");
  assert.match(support, /id="support-error"/);
  assert.match(support, /aria-invalid=\{state\.kind === "error" && !email\.trim\(\)\}/);
  assert.match(support, /aria-invalid=\{state\.kind === "error" && !message\.trim\(\)\}/);
});

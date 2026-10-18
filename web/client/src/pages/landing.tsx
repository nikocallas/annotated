import { useEffect, useId, useRef, useState } from "react";
import { MarketingFooter, MarketingHeader, REPO_URL } from "@/components/MarketingChrome";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";
import {
  ANNOTATION_TYPES,
  ANNOTATION_TYPE_DESCRIPTIONS,
  ANNOTATION_TYPE_LABELS,
  type AnnotationType,
} from "@shared/schema";

/* ------------------------------------------------------------------------ */
/* Hero: the product doing its one job, played once.                         */
/* ------------------------------------------------------------------------ */

const HERO = {
  host: "ycombinator.com",
  title: "A guide to seed fundraising",
  passage:
    "Investors write checks when the idea they hear is compelling, when they are persuaded that the team of founders can realize its vision, and that the opportunity described is real and sufficiently large.",
  note:
    "The useful signal is story readiness. A fundable company can explain why this team, this market, and this moment belong together before the deck asks for a dollar.",
  href: "/a/4fe9ca44-61f0-48b5-b004-ee92bcf268fa",
};

// Stage timeline (ms). 0 page, 1 highlight, 2 passage in panel, 3 kind,
// 4 typing, 5 publishing, 6 published.
const STAGES = [0, 350, 1350, 1900, 2250, 4500, 5100];

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

function Workbench() {
  const reduced = usePrefersReducedMotion();
  const [stage, setStage] = useState(reduced ? 6 : 0);
  const [typed, setTyped] = useState(reduced ? HERO.note.length : 0);
  const [run, setRun] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (reduced) {
      setStage(6);
      setTyped(HERO.note.length);
      return;
    }
    setStage(0);
    setTyped(0);
    STAGES.forEach((t, i) => timers.current.push(window.setTimeout(() => setStage(i), t)));
    const typingStart = STAGES[4];
    const typingTime = STAGES[5] - STAGES[4] - 250;
    const step = typingTime / HERO.note.length;
    for (let i = 1; i <= HERO.note.length; i++) {
      timers.current.push(window.setTimeout(() => setTyped(i), typingStart + i * step));
    }
    return () => timers.current.forEach(clearTimeout);
  }, [run, reduced]);

  const note = HERO.note.slice(0, typed);

  return (
    <figure className="wb" data-stage={stage} aria-label="Example: annotating an article with the Annotated side panel">
      <figcaption className="sr-only">
        A reader highlights a sentence in a Y Combinator article, picks Context in the Annotated side panel, writes a
        note, and publishes it to the feed.
      </figcaption>

      <div className="wb-page" aria-hidden="true">
        <div className="wb-page-bar">
          <span className="wb-dots"><i /><i /><i /></span>
          <span className="wb-url">{HERO.host}/library/4A-a-guide-to-seed-fundraising</span>
        </div>
        <div className="wb-page-body">
          <p className="wb-kicker">YC Startup Library</p>
          <h3>{HERO.title}</h3>
          <span className="lp-line" style={{ width: "34%" }} />
          <div className="wb-text">
            <span className="lp-line" style={{ width: "96%" }} />
            <span className="lp-line" style={{ width: "91%" }} />
            <span className="lp-line" style={{ width: "58%" }} />
          </div>
          <p className="wb-passage">
            <mark className={stage >= 1 ? "is-on" : ""}>{HERO.passage}</mark>
          </p>
          <div className="wb-text">
            <span className="lp-line" style={{ width: "94%" }} />
            <span className="lp-line" style={{ width: "97%" }} />
            <span className="lp-line" style={{ width: "88%" }} />
            <span className="lp-line" style={{ width: "40%" }} />
          </div>
        </div>
      </div>

      <div className="wb-panel" aria-hidden="true">
        <div className="wb-panel-head">
          <span className="wb-logo" />
          <strong>Annotated</strong>
        </div>
        <div className="wb-panel-tabs"><span className="is-on">Clip</span><span>Feed</span><span>Profile</span></div>

        {stage < 6 ? (
          <div className="wb-panel-body">
            <div className="wb-source">
              <span className="wb-badge">Article</span>
              <span className="wb-host">{HERO.host}</span>
              <strong>{HERO.title}</strong>
            </div>
            <div className="wb-field">
              <span className="wb-label">Highlighted passage</span>
              <p className={`wb-quote ${stage >= 2 ? "is-on" : ""}`}>{HERO.passage}</p>
            </div>
            <div className="wb-field">
              <span className="wb-label">What kind of take?</span>
              <div className="wb-chips">
                {(["dispute", "fact-check", "context", "hot-take"] as AnnotationType[]).map((t) => (
                  <span key={t} data-type={t} className={stage >= 3 && t === "context" ? "is-on" : ""}>
                    {ANNOTATION_TYPE_LABELS[t]}
                  </span>
                ))}
              </div>
            </div>
            <div className="wb-field">
              <span className="wb-label">Your take</span>
              <p className={`wb-take ${stage >= 4 ? "is-typing" : ""}`}>
                {note}
                {stage >= 4 && stage < 5 && <span className="wb-caret" />}
                {stage < 4 && <span className="wb-placeholder">What’s wrong, missing, or worth knowing here?</span>}
              </p>
            </div>
            <span className={`wb-publish ${stage >= 5 ? "is-pressed" : ""}`}>
              {stage >= 5 ? "Publishing…" : "Publish annotation"}
            </span>
          </div>
        ) : (
          <div className="wb-panel-body wb-done">
            <span className="wb-check" />
            <strong>Published to the feed</strong>
            <p>Your note is live, pinned to the exact sentence, with a link back to {HERO.host}.</p>
            <div className="wb-post">
              <span className="type-badge" data-type="context">Context</span>
              <p>{HERO.note}</p>
              <span className="wb-post-src">Niko Callas on {HERO.host}</span>
            </div>
          </div>
        )}
      </div>

      <div className="wb-controls">
        {stage === 6 && !reduced ? (
          <button type="button" className="wb-replay" onClick={() => setRun((n) => n + 1)}>
            Play again
          </button>
        ) : null}
        <a href={HERO.href} className="lp-text-link">Read this post</a>
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------------ */
/* Three kinds of source, each a real post from the feed.                     */
/* ------------------------------------------------------------------------ */

const EXAMPLES = [
  {
    key: "article",
    tab: "Article",
    href: "/a/4fe9ca44-61f0-48b5-b004-ee92bcf268fa",
    source: "ycombinator.com",
    title: "A guide to seed fundraising",
    passage:
      "Investors write checks when the idea they hear is compelling, when they are persuaded that the team of founders can realize its vision, and that the opportunity described is real and sufficiently large.",
    note:
      "The useful signal is not “raise whenever you can”; it is story readiness. A fundable company can explain why this team, this market, and this moment belong together before the deck asks for a dollar.",
  },
  {
    key: "video",
    tab: "Video",
    href: "/a/cb88eb8f-9b88-40ac-99c8-68a05ee3bae8",
    source: "YouTube, Stanford",
    title: "Steve Jobs’ 2005 Stanford Commencement Address",
    range: { start: "0:27", end: "0:57", from: 3, to: 6.3 },
    note:
      "The first thirty seconds keep the room, the applause, and the speaker’s hesitation attached to the words. Context is not overhead here; it is part of the evidence.",
  },
  {
    key: "podcast",
    tab: "Podcast",
    href: "/a/43fd61bb-6f99-400c-a856-72b4817b706d",
    source: "The Changelog",
    title: "Castro leans into indie, Changelog Interviews #589",
    range: { start: "0:30", end: "1:00", from: 8, to: 16 },
    note:
      "The opening exchange works because the pause and cadence survive the transcript. Audio carries confidence, uncertainty, and timing that a pulled quote would flatten.",
  },
] as const;

type Example = (typeof EXAMPLES)[number];

function Lines({ widths }: { widths: number[] }) {
  return (
    <>
      {widths.map((w, i) => (
        <span key={i} className="lp-line" style={{ width: `${w}%` }} aria-hidden />
      ))}
    </>
  );
}

function Waveform() {
  return (
    <div className="lp-wave" aria-hidden>
      {Array.from({ length: 64 }).map((_, i) => (
        <i key={i} style={{ height: `${18 + Math.round(Math.abs(Math.sin(i * 0.61) * Math.cos(i * 0.23)) * 78)}%` }} />
      ))}
    </div>
  );
}

function Evidence({ ex }: { ex: Example }) {
  if (ex.key === "article") {
    return (
      <div className="lp-doc">
        <Lines widths={[92, 97, 64]} />
        <p className="lp-passage">
          <mark className="lp-mark">{ex.passage}</mark>
        </p>
        <Lines widths={[95, 88, 41]} />
      </div>
    );
  }
  const r = ex.range;
  return (
    <div className="lp-media">
      {ex.key === "video" ? (
        <div className="lp-video" aria-hidden>
          <span className="lp-video-play" />
        </div>
      ) : (
        <Waveform />
      )}
      <div className="lp-scrub" aria-hidden>
        <span className="lp-scrub-range" style={{ left: `${r.from}%`, width: `${r.to - r.from}%` }} />
      </div>
      <p className="lp-range">
        Clipped <strong>{r.start}</strong> to <strong>{r.end}</strong>,{" "}
        {ex.key === "video" ? "saved at 240p" : "audio only"}
      </p>
    </div>
  );
}

function SourceExamples() {
  // The hero already shows an article, so open on the video example.
  const [active, setActive] = useState(1);
  const id = useId();
  const ex = EXAMPLES[active];
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (i + (e.key === "ArrowRight" ? 1 : -1) + EXAMPLES.length) % EXAMPLES.length;
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section className="lp-section lp-sources" aria-labelledby="sources-title">
      <div className="lp-sources-head">
        <h2 id="sources-title">Pin a note to a sentence, a scene, or a moment of audio.</h2>
        <p>
          Articles, YouTube videos, podcasts, and posts on X. The note stays attached to the exact thing it is about,
          so nobody has to guess what you were reacting to.
        </p>
      </div>
      <div className="lp-tabs" role="tablist" aria-label="Kinds of source">
        {EXAMPLES.map((e, i) => (
          <button
            key={e.key}
            ref={(el) => { tabs.current[i] = el; }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={(k) => onKey(k, i)}
          >
            {e.tab}
          </button>
        ))}
      </div>
      <div className="lp-spread" role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${active}`} key={ex.key}>
        <article className="lp-sheet">
          <header>
            <span>{ex.source}</span>
            <h3>{ex.title}</h3>
          </header>
          <Evidence ex={ex} />
        </article>
        <aside className="lp-note" aria-label="Annotation">
          <svg className="lp-leader" viewBox="0 0 40 24" preserveAspectRatio="none" aria-hidden>
            <path d="M0 12 C 14 12, 18 4, 40 4" />
          </svg>
          <div className="lp-note-head">
            <span>Niko Callas</span>
          </div>
          <p>{ex.note}</p>
          <a href={ex.href} className="lp-note-link">Read the post</a>
        </aside>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Kinds of take                                                              */
/* ------------------------------------------------------------------------ */

const TAKE_EXAMPLES: Record<AnnotationType, string> = {
  dispute: "The 2019 audit flagged these welds. “Without warning” isn’t accurate.",
  "fact-check": "The 40% figure comes from a 2021 survey, not this year’s.",
  context: "This was said a week before the merger was announced.",
  "hot-take": "Nobody will remember this launch in a year.",
  steelman: "The best case for the rule is the one the piece skips: it protects small sellers.",
  receipts: "Here’s the earlier post where they said the opposite.",
  explainer: "“25 basis points” means the rate moved a quarter of a percent.",
};

function KindsOfTake() {
  return (
    <section className="lp-section lp-kinds" aria-labelledby="kinds-title">
      <div className="lp-kinds-head">
        <h2 id="kinds-title">Say what kind of note it is.</h2>
        <p>
          Every annotation carries one of seven labels, so readers can tell a correction from an opinion at a glance,
          and the feed can be filtered by either.
        </p>
      </div>
      <ul className="lp-kinds-list">
        {ANNOTATION_TYPES.map((t) => (
          <li key={t}>
            <span className="type-badge" data-type={t}>{ANNOTATION_TYPE_LABELS[t]}</span>
            <p className="lp-kind-desc">{ANNOTATION_TYPE_DESCRIPTIONS[t]}</p>
            <p className="lp-kind-eg">{TAKE_EXAMPLES[t]}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* How it works                                                               */
/* ------------------------------------------------------------------------ */

const STEPS = [
  {
    title: "Open the side panel on any page",
    body: "Click the Annotated icon in Chrome. The panel opens beside the page and reads what you’re looking at: the article, the video, or the episode.",
  },
  {
    title: "Highlight the line, or set the clip",
    body: "Select up to 100 words of text. On a video or podcast, drag the handles while it plays; clips stop at 90 seconds.",
  },
  {
    title: "Write or record your note, then publish",
    body: "Pick a kind of take, add a #topic, and publish. The post opens with your note on top, the evidence under it, and the source linked. Share it to X from the same screen.",
  },
];

function HowItWorks() {
  return (
    <section className="lp-section lp-how" id="how-it-works" aria-labelledby="how-title">
      <h2 id="how-title">How it works</h2>
      <ol className="lp-steps">
        {STEPS.map((s) => (
          <li key={s.title}>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* From the feed                                                              */
/* ------------------------------------------------------------------------ */

interface FeedItem {
  id: string;
  sourceType: string;
  sourceTitle: string | null;
  sourcePublication: string | null;
  sourceUrl: string;
  commentaryText: string | null;
  clipText: string | null;
  clipStartSec: number | null;
  clipEndSec: number | null;
  annotationType: string | null;
  user: { displayName: string; username: string };
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function FromTheFeed() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/feed?limit=3")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: FeedItem[]) => live && setItems(Array.isArray(rows) ? rows.slice(0, 3) : []))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, []);
  if (!items || items.length === 0) return null;
  return (
    <section className="lp-section lp-recent" aria-labelledby="recent-title">
      <div className="lp-section-head">
        <h2 id="recent-title">From the feed</h2>
        <a href="/feed" className="lp-text-link">Browse all annotations</a>
      </div>
      <ul>
        {items.map((a) => {
          const type = a.annotationType && (ANNOTATION_TYPES as readonly string[]).includes(a.annotationType)
            ? (a.annotationType as AnnotationType)
            : null;
          return (
            <li key={a.id}>
              <a href={`/a/${encodeURIComponent(a.id)}`}>
                {type && <span className="type-badge" data-type={type}>{ANNOTATION_TYPE_LABELS[type]}</span>}
                <p className="lp-recent-note">{a.commentaryText ?? a.sourceTitle}</p>
                {a.clipText ? (
                  <p className="lp-recent-quote"><mark>{a.clipText}</mark></p>
                ) : a.clipStartSec != null && a.clipEndSec != null ? (
                  <p className="lp-recent-clip">
                    {a.sourceType === "youtube" ? "Video" : "Audio"} clip, {clock(a.clipStartSec)} to {clock(a.clipEndSec)}
                  </p>
                ) : null}
                <p className="lp-recent-meta">
                  {a.user.displayName} on {a.sourcePublication ?? host(a.sourceUrl)}
                </p>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* Requests, fair use, FAQ                                                    */
/* ------------------------------------------------------------------------ */

function Requests() {
  return (
    <section className="lp-section lp-ask" aria-labelledby="ask-title">
      <div>
        <h2 id="ask-title">Not sure a story holds up? Ask someone to check it.</h2>
        <p>
          Post a request with a link and a question. Ask everyone, or name the one person whose judgment you trust.
          When they annotate the page, the request is marked answered and links to their note.
        </p>
        <a href="/requests" className="lp-button-quiet">See open requests</a>
      </div>
      <div className="lp-ask-card" aria-hidden="true">
        <p className="lp-ask-who"><strong>Maya Okafor</strong> asked <strong>@devpatel</strong></p>
        <p className="lp-ask-q">Is the cost figure in paragraph three right?</p>
        <div className="lp-ask-src">
          <span>Riverton Ledger</span>
          <strong>Harbor Bridge reopening pushed to spring</strong>
        </div>
        <div className="lp-ask-answer">
          <span className="type-badge" data-type="fact-check">Fact check</span>
          <p>The $40M is the 2019 estimate. The city’s current budget lists $63M.</p>
          <span className="lp-ask-status">Answered by @devpatel</span>
        </div>
      </div>
    </section>
  );
}

const GUARANTEES = [
  ["90 seconds at most", "Video and podcast clips are capped, so a post can quote a moment but never replace the work."],
  ["Video saved at 240p", "Enough to see what was said. Anyone who wants the full picture goes to the original."],
  ["Always linked", "Every post credits the creator and links back to the page, video, or episode it came from."],
  ["A claim button on every post", "Rights holders can file a fair-use claim from the clip itself, and we review each one."],
];

function FairUse() {
  return (
    <section className="lp-section lp-fair" aria-labelledby="fair-title">
      <div className="lp-fair-intro">
        <h2 id="fair-title">Built for commentary, not reposting.</h2>
        <p>
          Quoting a source to argue with it is fair use. Lifting the whole thing is not. The limits are part of the
          product, not a setting.
        </p>
      </div>
      <dl>
        {GUARANTEES.map(([term, detail]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const FAQ: { q: string; a: React.ReactNode }[] = [
  { q: "Is it free?", a: "Yes. The extension, the feed, and requests are all free." },
  {
    q: "Which browsers does it work in?",
    a: "Chrome on desktop, version 116 or newer. Annotated uses Chrome’s side panel, so it sits next to the page instead of on top of it.",
  },
  {
    q: "Do I need an account?",
    a: "Only to publish, comment, or vote. You sign in with X or Google; there is no password to create. Anyone can read the feed and individual posts.",
  },
  {
    q: "What gets saved when I publish?",
    a: "The passage you highlighted (up to 100 words) or the clip you set (up to 90 seconds; video at 240p, podcasts as audio only), your note, and a link to the source. Articles and X posts also keep a screenshot of the page as you saw it, so the post still makes sense if the original changes.",
  },
  {
    q: "What if I own the content someone annotated?",
    a: (
      <>
        Every post has a File a claim button. Claims are reviewed by a person, and{" "}
        <a href="/claims">the claims page</a> explains how decisions are made.
      </>
    ),
  },
  {
    q: "Can I delete what I post?",
    a: "Yes. You can delete any of your posts, or delete your whole account and everything in it from your profile.",
  },
  {
    q: "Is the code open?",
    a: (
      <>
        Yes, under the MIT license. <a href={REPO_URL} target="_blank" rel="noopener noreferrer">Read it on GitHub</a>.
      </>
    ),
  },
];

function Faq() {
  return (
    <section className="lp-section lp-faq" aria-labelledby="faq-title">
      <h2 id="faq-title">Questions</h2>
      <div className="lp-faq-list">
        {FAQ.map(({ q, a }) => (
          <details key={q}>
            <summary>{q}</summary>
            <div className="lp-faq-a">{a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <div className="lp">
      <MarketingHeader current="home" />
      <main>
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <div>
              <p className="lp-tagline">
                Clip. <mark>Annotate.</mark>
              </p>
              <h1 id="hero-title">Highlight any sentence on the web. Dispute it, or add what’s missing.</h1>
            </div>
            <div className="lp-hero-side">
              <p>
                Annotated is a Chrome side panel for fact-checking and adding context to articles, videos, and
                podcasts. Your note stays pinned to the exact line or moment, with a link back to the source.
              </p>
              <div className="lp-actions">
                <DownloadExtensionButton size="lg" />
                <a href="/feed" className="lp-button-quiet" data-testid="link-hero-feed">
                  Browse annotations
                </a>
              </div>
              <p className="lp-fineprint">Free for Chrome. Works on news sites, blogs, YouTube, podcasts, and X.</p>
            </div>
          </div>
          <Workbench />
        </section>

        <SourceExamples />
        <KindsOfTake />
        <HowItWorks />
        <FromTheFeed />
        <Requests />
        <FairUse />
        <Faq />

        <section className="lp-close" aria-labelledby="close-title">
          <h2 id="close-title">Your first annotation takes about a minute.</h2>
          <div className="lp-actions" style={{ marginTop: 0 }}>
            <DownloadExtensionButton size="lg" />
            <a href="/demo" className="lp-button-quiet">Watch the demo</a>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

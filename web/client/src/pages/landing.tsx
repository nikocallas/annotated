import { useEffect, useId, useState } from "react";
import { MarketingFooter, MarketingHeader } from "@/components/MarketingChrome";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";
import { ANNOTATION_TYPES, ANNOTATION_TYPE_DESCRIPTIONS, ANNOTATION_TYPE_LABELS } from "@shared/schema";

// Three real posts from the live feed. The hero shows exactly what each one
// looks like: the evidence on the page, and the note pinned beside it.
const EXAMPLES = [
  {
    key: "article",
    tab: "Article",
    href: "/a/4fe9ca44-61f0-48b5-b004-ee92bcf268fa",
    source: "ycombinator.com",
    title: "A guide to seed fundraising",
    passage:
      "Investors write checks when the idea they hear is compelling, when they are persuaded that the team of founders can realize its vision, and that the opportunity described is real and sufficiently large.",
    kind: "Context",
    note:
      "The useful signal is not “raise whenever you can”; it is story readiness. A fundable company can explain why this team, this market, and this moment belong together before the deck asks for a dollar.",
  },
  {
    key: "video",
    tab: "Video",
    href: "/a/cb88eb8f-9b88-40ac-99c8-68a05ee3bae8",
    source: "YouTube, Stanford",
    title: "Steve Jobs’ 2005 Stanford Commencement Address",
    range: { start: "0:27", end: "0:57", from: 3, to: 6.3, total: 100 },
    kind: "Context",
    note:
      "The first thirty seconds keep the room, the applause, and the speaker’s hesitation attached to the words. Context is not overhead here; it is part of the evidence.",
  },
  {
    key: "podcast",
    tab: "Podcast",
    href: "/a/43fd61bb-6f99-400c-a856-72b4817b706d",
    source: "The Changelog",
    title: "Castro leans into indie, Changelog Interviews #589",
    range: { start: "0:30", end: "1:00", from: 8, to: 16, total: 100 },
    kind: "Explainer",
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
        <Lines widths={[95, 88, 97, 41]} />
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
        Clipped <strong>{r.start}</strong> to <strong>{r.end}</strong>, {ex.key === "video" ? "saved at 240p" : "audio only"}
      </p>
    </div>
  );
}

function AnnotatedPage() {
  const [active, setActive] = useState(0);
  const [replay, setReplay] = useState(0);
  const id = useId();
  const ex = EXAMPLES[active];

  return (
    <div className="lp-stage">
      <div className="lp-tabs" role="tablist" aria-label="Example annotations">
        {EXAMPLES.map((e, i) => (
          <button
            key={e.key}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel`}
            onClick={() => {
              setActive(i);
              setReplay((n) => n + 1);
            }}
          >
            {e.tab}
          </button>
        ))}
      </div>
      <div
        className="lp-spread"
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${active}`}
        key={`${ex.key}-${replay}`}
      >
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
            <span className="lp-kind">{ex.kind}</span>
            <span>Niko Callas</span>
          </div>
          <p>{ex.note}</p>
          <a href={ex.href} className="lp-note-link">
            Read the post
          </a>
        </aside>
      </div>
    </div>
  );
}

interface FeedItem {
  id: string;
  sourceTitle: string | null;
  sourcePublication: string | null;
  sourceUrl: string;
  commentaryText: string | null;
  clipText: string | null;
  user: { displayName: string; username: string };
}

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function RecentAnnotations() {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/feed?limit=4")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: FeedItem[]) => live && setItems(Array.isArray(rows) ? rows.slice(0, 4) : []))
      .catch(() => live && setItems([]));
    return () => {
      live = false;
    };
  }, []);
  if (!items || items.length === 0) return null;
  return (
    <section className="lp-section lp-recent" aria-labelledby="recent-title">
      <div className="lp-section-head">
        <h2 id="recent-title">Recently annotated</h2>
        <a href="/feed" className="lp-text-link">Open the feed</a>
      </div>
      <ul>
        {items.map((a) => (
          <li key={a.id}>
            <a href={`/a/${encodeURIComponent(a.id)}`}>
              <p className="lp-recent-note">{a.commentaryText ?? a.clipText ?? a.sourceTitle}</p>
              <p className="lp-recent-meta">
                {a.user.displayName} on {a.sourcePublication ?? host(a.sourceUrl)}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STEPS = [
  {
    title: "Highlight the line, or set the clip",
    body: "Select up to 100 words on any page. On a video or podcast, drag the handles while it plays; clips stop at 90 seconds.",
  },
  {
    title: "Say what kind of take it is",
    body: "Pick one, then write or record your note. Add a #topic so people can find it.",
    types: true,
  },
  {
    title: "Publish",
    body: "The post opens with your note on top, the evidence under it, and the source linked below. Share it to X from the same screen.",
  },
];

const GUARANTEES = [
  ["90 seconds at most", "Video and podcast clips are capped, so a post can quote a moment but never replace the work."],
  ["Video saved at 240p", "Enough to see what was said. Anyone who wants the full picture goes to the original."],
  ["Always linked", "Every post credits the creator and links back to the page, video, or episode it came from."],
  ["A claim button on every post", "Rights holders can file a fair-use claim from the clip itself, and we review each one."],
];

export default function LandingPage() {
  return (
    <div className="lp">
      <MarketingHeader current="home" />
      <main>
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-hero-copy">
            <h1 id="hero-title">Highlight any sentence on the web. Dispute it, or add what’s missing.</h1>
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
            <p className="lp-fineprint">Free. Works on news sites, blogs, YouTube, podcasts, and X.</p>
          </div>
          <AnnotatedPage />
        </section>

        <section className="lp-section lp-how" id="how-it-works" aria-labelledby="how-title">
          <h2 id="how-title">How it works</h2>
          <ol className="lp-steps">
            {STEPS.map((s) => (
              <li key={s.title}>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                {s.types && (
                  <ul className="lp-types" aria-label="Kinds of take">
                    {ANNOTATION_TYPES.map((t) => (
                      <li key={t} data-type={t} title={ANNOTATION_TYPE_DESCRIPTIONS[t]}>
                        {ANNOTATION_TYPE_LABELS[t]}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>

        <section className="lp-section lp-fair" aria-labelledby="fair-title">
          <div className="lp-fair-intro">
            <h2 id="fair-title">Built for commentary, not reposting</h2>
            <p>
              Quoting a source to argue with it is fair use. Lifting the whole thing is not. The limits are part of
              the product, not a setting.
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

        <section className="lp-section lp-ask" aria-labelledby="ask-title">
          <h2 id="ask-title">Not sure a story holds up? Ask someone to check it.</h2>
          <p>
            Post a request with a link and a question. Ask the whole community, or name the one person whose
            judgment you trust. When they annotate the page, the request is marked answered.
          </p>
          <a href="/requests" className="lp-button-quiet">See open requests</a>
        </section>

        <RecentAnnotations />

        <section className="lp-close" aria-labelledby="close-title">
          <h2 id="close-title">Your first annotation takes about a minute.</h2>
          <DownloadExtensionButton size="lg" />
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

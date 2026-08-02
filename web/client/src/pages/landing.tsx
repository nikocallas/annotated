import { Logo, QuoteMark } from "@/components/Logo";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  Link2,
  MessageSquareQuote,
  Mic2,
  Play,
  Scissors,
  User as UserIcon,
  Video,
} from "lucide-react";

const STEPS = [
  {
    icon: Scissors,
    title: "Capture the moment",
    body: "Highlight the exact passage or scrub to the precise start and end of a video or podcast clip.",
  },
  {
    icon: MessageSquareQuote,
    title: "Add what’s missing",
    body: "Write or record the context that turns a source into an idea worth carrying forward.",
  },
  {
    icon: Link2,
    title: "Publish with provenance",
    body: "Share a public annotation with the creator, source, clip range, and original link still attached.",
  },
];

const MEDIA = [
  { icon: FileText, label: "Articles" },
  { icon: Video, label: "Video" },
  { icon: Mic2, label: "Podcasts" },
];

function ProductFrame({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <figure className={`landing-browser ${className}`}>
      <div className="landing-browser-bar" aria-hidden="true">
        <span /><span /><span />
        <div>annotatedextension.com</div>
      </div>
      <img src={src} alt={alt} loading="eager" decoding="async" />
    </figure>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Logo />
          <nav className="landing-nav" aria-label="Primary">
            <a href="/feed">Feed</a>
            <a href="/demo">Demo</a>
            <a href="#how-it-works">How it works</a>
          </nav>
          <div className="landing-header-actions">
            <ThemeToggle />
            <a href="/login" className="landing-sign-in" data-testid="link-signin-header" aria-label="Sign in">
              <UserIcon aria-hidden />
              <span>Sign in</span>
            </a>
            <DownloadExtensionButton size="sm" className="hidden sm:inline-flex" label="Get the extension" />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <section className="landing-hero" aria-labelledby="landing-title">
          <h1 id="landing-title" data-testid="text-hero">
            Clip the exact moment.<br />
            <span>Add the missing context.</span>
          </h1>
          <p>
            Annotated turns the best part of any article, video, or podcast into a
            source-linked post built for conversation.
          </p>
          <div className="landing-actions">
            <DownloadExtensionButton size="lg" label="Get the extension" />
            <a href="/demo" className="landing-secondary-button" data-testid="link-watch-demo">
              <Play aria-hidden fill="currentColor" />
              Watch the demo
            </a>
          </div>
          <div className="landing-proof" aria-label="Supported media">
            {MEDIA.map(({ icon: Icon, label }) => (
              <span key={label}><Icon aria-hidden />{label}</span>
            ))}
            <strong>Always linked to the source</strong>
          </div>
        </section>

        <section className="landing-product-stage" aria-label="Annotated product preview">
          <ProductFrame
            src="/product/annotated-feed.png"
            alt="The live Annotated feed showing source-linked podcast and video posts"
            className="landing-feed-frame"
          />
          <figure className="landing-panel-frame">
            <div className="landing-panel-label">
              <QuoteMark size={20} />
              Exact-range clipping
            </div>
            <img
              src="/product/annotated-extension-panel.png"
              alt="The real Annotated Chrome side panel with exact start and end controls"
              loading="eager"
              decoding="async"
            />
          </figure>
        </section>

        <section className="landing-marquee" aria-label="Product principle">
          <span>The context layer of the internet.</span>
          <span aria-hidden="true">The context layer of the internet.</span>
        </section>

        <section className="landing-system" id="how-it-works" aria-labelledby="system-title">
          <header className="landing-section-heading">
            <span>One gesture. Three kinds of media.</span>
            <h2 id="system-title">Ideas travel farther when their evidence travels with them.</h2>
          </header>
          <div className="landing-steps">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <article key={title}>
                <div><Icon aria-hidden /><span>0{index + 1}</span></div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-feature landing-feature-clip" aria-labelledby="clip-title">
          <div className="landing-feature-copy">
            <span>Precision, not timestamps in a caption</span>
            <h2 id="clip-title">Scrub to the line that made you stop.</h2>
            <p>
              Set the clip’s exact in and out points before you publish. Annotated keeps the
              result short, playable, and connected to the original creator.
            </p>
            <ul>
              <li>Drag the range or enter exact times</li>
              <li>Nudge either edge one second at a time</li>
              <li>Preview the bounded clip before publishing</li>
            </ul>
          </div>
          <figure className="landing-context-frame">
            <img
              src="/product/annotated-extension-youtube-context.png"
              alt="Annotated running beside a YouTube video with a selected 66-second clip range"
              loading="eager"
              decoding="async"
            />
          </figure>
        </section>

        <section className="landing-demo-band" aria-labelledby="demo-title">
          <div className="landing-demo-copy">
            <span>Product demo</span>
            <h2 id="demo-title">From source to social post in under a minute.</h2>
            <p>See article, video, and podcast clipping with the real product—not a prototype.</p>
            <a href="/demo" className="landing-inline-link">
              Watch the full demo <ArrowRight aria-hidden />
            </a>
          </div>
          <a href="/demo" className="landing-video-poster" aria-label="Watch the Annotated product demo">
            <img src="/media/annotated-demo-poster.jpg" alt="Annotated product demo video" loading="eager" />
            <span><Play aria-hidden fill="currentColor" /></span>
          </a>
        </section>

        <section className="landing-feed-story" aria-labelledby="feed-story-title">
          <div className="landing-feed-story-copy">
            <span>Social, with receipts</span>
            <h2 id="feed-story-title">A feed built around sources, not screenshots.</h2>
            <p>
              Every post begins with something verifiable: a passage, a playable moment, and a
              path back to the work it came from. Commentary becomes the layer on top—not a
              replacement for the source.
            </p>
            <a href="/feed" className="landing-inline-link" data-testid="link-explore-feed">
              Explore the live feed <ArrowUpRight aria-hidden />
            </a>
          </div>
          <ProductFrame
            src="/product/annotated-video-post.png"
            alt="A live Annotated post with a bounded YouTube clip, commentary, source credits, and discussion"
            className="landing-detail-frame"
          />
        </section>

        <section className="landing-final-cta" aria-labelledby="final-cta-title">
          <QuoteMark size={44} />
          <h2 id="final-cta-title">The internet deserves its footnotes.</h2>
          <p>Clip precisely. Add context. Publish with the source intact.</p>
          <div className="landing-actions">
            <DownloadExtensionButton size="lg" label="Get the extension" />
            <a href="/feed" className="landing-secondary-button">Browse the feed</a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div>
          <Logo />
          <p>Source-linked conversations for the open web.</p>
        </div>
        <nav aria-label="Footer">
          <a href="/feed">Feed</a>
          <a href="/demo">Demo</a>
          <a href="/support">Support</a>
          <a href="/privacy">Privacy</a>
          <a href="/tos">Terms</a>
        </nav>
        <small data-testid="text-footer-copyright">© 2026 Annotated · Built by Niko Callas</small>
      </footer>
    </div>
  );
}

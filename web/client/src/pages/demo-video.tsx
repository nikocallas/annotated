import { Logo, QuoteMark } from "@/components/Logo";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ArrowRight, Check, Clock3, FileText, Mic2, Play, ShieldCheck, User as UserIcon, Video } from "lucide-react";

const CHAPTERS = [
  { time: "0:00", icon: Play, title: "Why Annotated", body: "Turn exact moments into source-linked posts." },
  { time: "0:04", icon: Video, title: "Clip video", body: "Scrub to a precise start and end point." },
  { time: "0:12", icon: FileText, title: "Annotate articles", body: "Keep the selected passage and publication attached." },
  { time: "0:21", icon: Mic2, title: "Clip podcasts", body: "Preserve the audio moment, not just its transcript." },
  { time: "0:29", icon: ArrowRight, title: "Publish to the feed", body: "Share a playable post with its source intact." },
  { time: "0:40", icon: ShieldCheck, title: "Keep provenance", body: "Show credits, exact range, and the original link." },
];

export default function DemoVideoPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground demo-page">
      <header className="landing-header">
        <div className="landing-header-inner">
          <Logo />
          <nav className="landing-nav" aria-label="Primary">
            <a href="/">Home</a>
            <a href="/feed">Feed</a>
            <a href="/demo" aria-current="page">Demo</a>
          </nav>
          <div className="landing-header-actions">
            <ThemeToggle />
            <a href="/login" className="landing-sign-in" data-testid="link-signin-header" aria-label="Sign in">
              <UserIcon aria-hidden /><span>Sign in</span>
            </a>
            <DownloadExtensionButton size="sm" className="hidden sm:inline-flex" label="Get the extension" />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="demo-hero">
          <div className="demo-hero-copy">
            <span>Product walkthrough</span>
            <h1 data-testid="text-demo-video-title">See the moment become the post.</h1>
            <p>
              A 53-second tour of real article, video, podcast, and feed surfaces—captured from
              the working Annotated product.
            </p>
            <div className="demo-facts" aria-label="Demo facts">
              <span><Clock3 aria-hidden /> 53 seconds</span>
              <span><Check aria-hidden /> No prototype screens</span>
            </div>
          </div>
          <QuoteMark size={56} />
        </section>

        <section className="demo-player-section" aria-label="Annotated demo video">
          <div className="demo-player-shell">
            <video
              className="demo-player"
              controls
              playsInline
              preload="metadata"
              poster="/media/annotated-demo-poster.jpg"
              data-testid="video-demo"
            >
              <source src="/media/annotated-demo.mp4" type="video/mp4" />
              <track kind="chapters" src="/media/annotated-demo-chapters.vtt" srcLang="en" label="Chapters" default />
              Your browser doesn&rsquo;t support embedded video. You can{" "}
              <a href="/media/annotated-demo.mp4">download the demo</a> instead.
            </video>
          </div>
          <div className="demo-chapters">
            {CHAPTERS.map(({ time, icon: Icon, title, body }) => (
              <article key={time}>
                <div><Icon aria-hidden /><time>{time}</time></div>
                <h2>{title}</h2>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="demo-proof" aria-labelledby="demo-proof-title">
          <header>
            <span>What the demo proves</span>
            <h2 id="demo-proof-title">One workflow, three kinds of source material.</h2>
          </header>
          <div>
            <figure>
              <img src="/product/annotated-extension-article-context.png" alt="Annotated clipping an article passage" loading="eager" />
              <figcaption><FileText aria-hidden /> Article passage</figcaption>
            </figure>
            <figure>
              <img src="/product/annotated-extension-youtube-context.png" alt="Annotated setting an exact YouTube clip range" loading="eager" />
              <figcaption><Video aria-hidden /> Exact video range</figcaption>
            </figure>
            <figure>
              <img src="/product/annotated-extension-podcast-context.png" alt="Annotated setting an exact podcast clip range" loading="eager" />
              <figcaption><Mic2 aria-hidden /> Bounded podcast audio</figcaption>
            </figure>
          </div>
        </section>

        <section className="demo-cta">
          <h2>Try the workflow on something worth sharing.</h2>
          <p>Install Annotated, open Chrome’s side panel, and clip the moment—not the whole tab.</p>
          <div className="landing-actions">
            <DownloadExtensionButton size="lg" label="Get the extension" />
            <a href="/feed" className="landing-secondary-button">Explore the feed</a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div><Logo /><p>Source-linked conversations for the open web.</p></div>
        <nav aria-label="Footer">
          <a href="/">Home</a><a href="/feed">Feed</a><a href="/support">Support</a>
          <a href="/privacy">Privacy</a><a href="/tos">Terms</a>
        </nav>
        <small data-testid="text-footer-copyright">© 2026 Annotated · Built by Niko Callas</small>
      </footer>
    </div>
  );
}

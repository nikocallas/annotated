import { Logo, QuoteMark } from "@/components/Logo";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteNav } from "@/components/SiteNav";
import { ArrowRight, Link2, MessageSquareQuote, Play, Scissors, User as UserIcon } from "lucide-react";

const STEPS = [
  {
    icon: Scissors,
    title: "Clip the evidence",
    body: "Select a passage or set the exact in and out points on a video or podcast.",
  },
  {
    icon: MessageSquareQuote,
    title: "Add your perspective",
    body: "Explain why the moment matters without separating it from its original source.",
  },
  {
    icon: Link2,
    title: "Carry context forward",
    body: "Publish to a social feed built for useful ideas, attribution, and conversation.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center gap-4 sm:gap-6">
          <Logo />
          <SiteNav current="home" />
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <DownloadExtensionButton size="sm" className="hidden md:inline-flex" label="Clip with Annotated" />
            <a
              href="/login"
              className="md:hidden min-h-11 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground shadow-sm hover:opacity-95"
              data-testid="link-signin-header-mobile"
            >
              <UserIcon className="w-4 h-4" />
              Sign in
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <div className="landing-kicker">
              <QuoteMark size={22} />
              The context layer of the internet
            </div>
            <h1 data-testid="text-hero">
              Clip the exact moment.
              <span>Add the missing context.</span>
            </h1>
            <p>
              Annotated turns the strongest moments from articles, video, and podcasts into
              source-linked conversations worth returning to.
            </p>
            <div className="landing-actions">
              <DownloadExtensionButton size="lg" label="Start clipping" />
              <a href="/feed" className="landing-feed-link" data-testid="link-explore-feed">
                Explore the feed <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            <div className="landing-proof">
              <span>90-second maximum</span>
              <span>Source always attached</span>
              <span>Built for fair-use commentary</span>
            </div>
          </div>

          <div className="landing-product" aria-label="Example Annotated post">
            <div className="landing-product-browser">
              <i /><i /><i />
              <span>annotatedextension.com</span>
            </div>
            <article className="landing-example-card">
              <div className="landing-example-author">
                <div className="landing-avatar">NC</div>
                <div><strong>Niko Callas</strong><span>@nikocallas · just now</span></div>
                <small>VIDEO</small>
              </div>
              <div className="landing-source-rail">
                <span>FROM A PRIMARY SOURCE</span>
                <strong>The moment an idea becomes inevitable</strong>
              </div>
              <div className="landing-video-shell">
                <button type="button" aria-label="Play example clip"><Play fill="currentColor" /></button>
                <div className="landing-wave" aria-hidden>
                  {Array.from({ length: 32 }).map((_, index) => <i key={index} />)}
                </div>
                <span>12:08—12:34 · 26s</span>
              </div>
              <div className="landing-note">
                <span>WHY THIS MATTERS</span>
                <p>The source is the evidence. The annotation is the invitation to think with it.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="landing-system" aria-labelledby="how-it-works">
          <div className="landing-system-heading">
            <span>One gesture, three kinds of media</span>
            <h2 id="how-it-works">A social layer designed around provenance.</h2>
          </div>
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
      </main>

      <footer className="border-t border-border mt-12">
        <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col sm:flex-row gap-6 sm:items-center sm:justify-between text-sm text-muted-foreground">
          <Logo />
          <div className="flex gap-5 flex-wrap">
            <a href="/feed" className="inline-flex min-h-11 items-center hover:text-foreground">Explore</a>
            <a href="/demo" className="inline-flex min-h-11 items-center hover:text-foreground">Demo Video</a>
            <a href="/support" className="inline-flex min-h-11 items-center hover:text-foreground">Support</a>
            <a href="/privacy" className="inline-flex min-h-11 items-center hover:text-foreground">Privacy</a>
            <a href="/tos" className="inline-flex min-h-11 items-center hover:text-foreground">Terms</a>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-6 text-xs text-muted-foreground" data-testid="text-footer-copyright">
          © 2026 Annotated · Built by Niko Callas
        </div>
      </footer>
    </div>
  );
}

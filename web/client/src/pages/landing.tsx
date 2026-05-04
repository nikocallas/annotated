import { Logo, QuoteMark } from "@/components/Logo";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center gap-4">
          <Logo />
          <div className="ml-auto flex items-center gap-3">
            <a
              href="/feed"
              className="hidden sm:inline text-sm text-muted-foreground hover:text-foreground"
              data-testid="link-feed"
            >
              The Feed
            </a>
            <ThemeToggle />
            <DownloadExtensionButton size="sm" />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-32 flex flex-col items-center text-center">
          <QuoteMark size={72} />

          <h1
            className="mt-10 font-bold tracking-tight leading-[0.9]"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: "clamp(4rem, 14vw, 11rem)",
            }}
            data-testid="text-hero"
          >
            <span className="block">Clip.</span>
            <span
              className="block"
              style={{
                background: "var(--gradient-primary)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Annotate.
            </span>
          </h1>

          <p className="mt-8 max-w-xl text-base sm:text-lg text-muted-foreground">
            Clip 90-second highlights from any video, podcast, or article. Annotate. Share.
            Always linked back to the source.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <DownloadExtensionButton size="lg" />
            <a
              href="/feed"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
              data-testid="link-explore-feed"
            >
              Explore the feed →
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-border mt-12">
        <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row gap-6 sm:items-center sm:justify-between text-sm text-muted-foreground">
          <Logo />
          <DownloadExtensionButton size="sm" />
          <div className="flex gap-5 flex-wrap">
            <a href="/feed" className="hover:text-foreground">Feed</a>
            <a href="/support" className="hover:text-foreground">Support</a>
            <a href="/privacy" className="hover:text-foreground">Privacy</a>
            <a href="/tos" className="hover:text-foreground">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

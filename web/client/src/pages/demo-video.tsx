import { Logo } from "@/components/Logo";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteNav } from "@/components/SiteNav";
import { User as UserIcon } from "lucide-react";

export default function DemoVideoPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-14 flex items-center gap-4 sm:gap-6">
          <Logo />
          <SiteNav />
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <DownloadExtensionButton size="sm" className="hidden md:inline-flex" />
            <a
              href="/login"
              className="md:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground shadow-sm hover:opacity-95"
              data-testid="link-signin-header-mobile"
            >
              <UserIcon className="w-4 h-4" />
              Sign in
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-6 py-12 md:py-16 space-y-8">
          <header className="space-y-3">
            <h1
              className="text-4xl md:text-5xl font-bold leading-[1.05]"
              style={{ fontFamily: "var(--font-sans)" }}
              data-testid="text-demo-video-title"
            >
              Demo Video
            </h1>
            <p className="text-muted-foreground max-w-2xl">
              A short walkthrough of Annotated &mdash; clip a moment from a video, article, or
              podcast, attach your commentary, and share it.
            </p>
          </header>

          <div className="rounded-lg overflow-hidden border border-border bg-black">
            <video
              className="w-full h-auto block"
              controls
              preload="metadata"
              poster="/media/annotated-demo-poster.jpg"
              data-testid="video-demo"
            >
              <source src="/media/annotated-demo.mp4" type="video/mp4" />
              Your browser doesn&rsquo;t support embedded video. You can{" "}
              <a href="/media/annotated-demo.mp4" className="underline">
                download the demo
              </a>{" "}
              instead.
            </video>
          </div>

          <div className="text-sm text-muted-foreground space-y-3 max-w-2xl">
            <p>
              Want to try it yourself? Install the Chrome extension and open the side panel on any
              page with a video, article, or podcast.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <DownloadExtensionButton />
              <a
                href="/feed"
                className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Browse the feed &rarr;
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border mt-12">
        <div className="mx-auto max-w-5xl px-6 py-8 text-sm text-muted-foreground flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <Logo />
          <DownloadExtensionButton size="sm" />
          <div className="flex gap-4 flex-wrap">
            <a href="/" className="hover:text-foreground">Home</a>
            <a href="/demo" className="hover:text-foreground">Demo Video</a>
            <a href="/support" className="hover:text-foreground">Support</a>
            <a href="/privacy" className="hover:text-foreground">Privacy</a>
            <a href="/tos" className="hover:text-foreground">Terms</a>
          </div>
        </div>
        <div
          className="mx-auto max-w-5xl px-6 pb-6 text-xs text-muted-foreground"
          data-testid="text-footer-copyright"
        >
          © 2026 Laymen, Inc.
        </div>
      </footer>
    </div>
  );
}

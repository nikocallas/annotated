import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { DownloadExtensionButton } from "./DownloadExtensionButton";
import { ThemeToggle } from "./ThemeToggle";
import { SiteNav } from "./SiteNav";
import { User as UserIcon } from "lucide-react";

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-14 flex items-center gap-4 sm:gap-6">
          <Logo />
          <SiteNav />
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <DownloadExtensionButton size="sm" className="hidden md:inline-flex" />
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
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-6 py-12 prose prose-neutral dark:prose-invert">
          <h1>{title}</h1>
          {children}
        </article>
      </main>
      <footer className="border-t border-border mt-12">
        <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted-foreground flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <Logo />
          <div className="flex gap-4 flex-wrap">
            <a href="/demo" className="inline-flex min-h-11 items-center hover:text-foreground">Demo Video</a>
            <a href="/support" className="inline-flex min-h-11 items-center hover:text-foreground">Support</a>
            <a href="/privacy" className="inline-flex min-h-11 items-center hover:text-foreground">Privacy</a>
            <a href="/tos" className="inline-flex min-h-11 items-center hover:text-foreground">Terms</a>
            <a href="/" className="inline-flex min-h-11 items-center hover:text-foreground">Home</a>
          </div>
        </div>
        <div
          className="mx-auto max-w-3xl px-6 pb-6 text-xs text-muted-foreground"
          data-testid="text-footer-copyright"
        >
          © 2026 Annotated · Built by Niko Callas
        </div>
      </footer>
    </div>
  );
}

import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { DownloadExtensionButton } from "./DownloadExtensionButton";
import { ThemeToggle } from "./ThemeToggle";

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-14 flex items-center gap-4">
          <Logo />
          <div className="ml-auto flex items-center gap-3">
            <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
              Back to Annotated
            </a>
            <ThemeToggle />
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
          <DownloadExtensionButton size="sm" />
          <div className="flex gap-4 flex-wrap">
            <a href="/support" className="hover:text-foreground">Support</a>
            <a href="/privacy" className="hover:text-foreground">Privacy</a>
            <a href="/tos" className="hover:text-foreground">Terms</a>
            <a href="/" className="hover:text-foreground">Home</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

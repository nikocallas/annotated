import type { ReactNode } from "react";
import { MarketingFooter, MarketingHeader } from "./MarketingChrome";

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <MarketingHeader />
      <main className="flex-1">
        <article className="legal-article mx-auto max-w-3xl px-6 py-12 prose prose-neutral dark:prose-invert">
          <h1>{title}</h1>
          {children}
        </article>
      </main>
      <MarketingFooter />
    </div>
  );
}

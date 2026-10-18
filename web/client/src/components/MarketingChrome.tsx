import type { ReactNode } from "react";
import { Link } from "wouter";
import { Logo } from "@/components/Logo";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";
import { ThemeToggle } from "@/components/ThemeToggle";

export type Section = "home" | "feed" | "requests" | "demo" | null;

// `app` is the route inside the hash-routed app; `href` is the path-routed URL
// used from marketing pages, which load the app fresh.
const NAV: { href: string; app?: string; label: string; key: Exclude<Section, null> }[] = [
  { href: "/feed", app: "/", label: "Feed", key: "feed" },
  { href: "/requests", app: "/requests", label: "Requests", key: "requests" },
  { href: "/demo", label: "Demo", key: "demo" },
];

export const REPO_URL = "https://github.com/nikocallas/annotated";

function NavLinks({ current, inApp, mobile }: { current: Section; inApp: boolean; mobile?: boolean }) {
  return (
    <>
      {NAV.map((item) => {
        const props = {
          "aria-current": current === item.key ? ("page" as const) : undefined,
          "data-testid": `link-nav-${item.key}${mobile ? "-mobile" : ""}`,
        };
        return inApp && item.app ? (
          <Link key={item.key} href={item.app} {...props}>
            {item.label}
          </Link>
        ) : (
          <a key={item.key} href={item.href} {...props}>
            {item.label}
          </a>
        );
      })}
    </>
  );
}

/**
 * The one site header. Marketing pages pass nothing; the app passes `inApp`
 * so links stay inside the hash router, plus its own account controls.
 */
export function MarketingHeader({
  current = null,
  inApp = false,
  account,
}: {
  current?: Section;
  inApp?: boolean;
  account?: ReactNode;
}) {
  return (
    <header className="mk-header">
      <div className="mk-header-inner">
        <Logo />
        <nav className="mk-nav" aria-label="Primary">
          <NavLinks current={current} inApp={inApp} />
        </nav>
        <div className="mk-header-actions">
          <ThemeToggle />
          {account ?? (
            <a href="/login" className="mk-signin" data-testid="link-signin-header">
              Sign in
            </a>
          )}
          <DownloadExtensionButton size="sm" className="mk-header-cta" />
        </div>
      </div>
      <nav className="mk-nav-mobile" aria-label="Primary mobile">
        <NavLinks current={current} inApp={inApp} mobile />
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="mk-footer">
      <div className="mk-footer-inner">
        <div className="mk-footer-brand">
          <Logo />
          <p>Every note stays attached to the exact line or moment it is about.</p>
        </div>
        <nav aria-label="Footer">
          <a href="/feed">Feed</a>
          <a href="/requests">Requests</a>
          <a href="/demo" data-testid="link-footer-demo">Demo</a>
          <a href="/support" data-testid="link-footer-support">Support</a>
          <a href="/privacy" data-testid="link-footer-privacy">Privacy</a>
          <a href="/tos" data-testid="link-footer-tos">Terms</a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">Source code</a>
        </nav>
        <small data-testid="text-footer-copyright">© 2026 Annotated. Built by Niko Callas.</small>
      </div>
    </footer>
  );
}

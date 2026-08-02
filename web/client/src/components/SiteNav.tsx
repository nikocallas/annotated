import { Home, Compass } from "lucide-react";

type Current = "home" | "feed" | null;

// Shared Home / Feed header nav used on path-routed pages (landing, privacy,
// terms, support). Mirrors the SITE_NAV used inside AppLayout so the header
// is visually identical across the entire site.
export function SiteNav({ current = null }: { current?: Current }) {
  const items: { href: string; label: string; key: Current; Icon: typeof Home }[] = [
    { href: "/", label: "Home", key: "home", Icon: Home },
    { href: "/feed", label: "Explore", key: "feed", Icon: Compass },
  ];
  return (
    <nav className="hidden md:flex items-center gap-1" aria-label="Primary">
      {items.map((item) => {
        const active = current === item.key;
        const className = `px-3 py-1.5 rounded-md text-sm font-medium hover-elevate flex items-center gap-2 ${
          active ? "text-foreground" : "text-muted-foreground"
        }`;
        return (
          <a
            key={item.key}
            href={item.href}
            className={`${className} min-h-11`}
            aria-current={active ? "page" : undefined}
            data-testid={`link-nav-${item.label.toLowerCase()}`}
          >
            <item.Icon className="w-4 h-4" aria-hidden />
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

import { Link, useLocation } from "wouter";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Compass, Users, User as UserIcon, Chrome, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { ReactNode } from "react";

const NAV = [
  { href: "/", label: "Feed", icon: Compass },
  { href: "/following", label: "Following", icon: Users },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center gap-4 sm:gap-6">
          <Logo />
          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((item) => {
              const active = location === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium hover-elevate flex items-center gap-2 ${
                    active ? "text-foreground" : "text-muted-foreground"
                  }`}
                  data-testid={`link-nav-${item.label.toLowerCase()}`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 min-w-0">
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex" data-testid="button-install-extension">
              <Link href="/install">
                <Chrome className="w-4 h-4 mr-1.5" />
                Install extension
              </Link>
            </Button>
            {user ? (
              <>
                <Link href={`/u/${user.username}`} className="hover-elevate rounded-full" data-testid="link-profile-self">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.avatarUrl ?? undefined} alt={user.displayName} />
                    <AvatarFallback>{user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </Link>
                <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out" data-testid="button-logout">
                  <LogOut className="w-4 h-4" />
                </Button>
              </>
            ) : (
              <Button asChild size="sm" data-testid="button-signin-header">
                <Link href="/login">
                  <UserIcon className="w-4 h-4 mr-1.5" />
                  Sign in
                </Link>
              </Button>
            )}
          </div>
        </div>
        {/* Mobile nav */}
        <nav className="md:hidden border-t border-border flex">
          {NAV.map((item) => {
            const active = location === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 px-3 py-2 text-xs font-medium hover-elevate flex items-center justify-center gap-1.5 ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border mt-12">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground flex flex-wrap gap-4 justify-between">
          <span>
            <span className="font-serif italic">annotated</span> — clip and share what's worth saving.
            Always linked to source.
          </span>
          <div className="flex gap-4">
            <Link href="/install" className="hover:text-foreground" data-testid="link-footer-install">Get the extension</Link>
            <span>Bounty by Jason Calacanis</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

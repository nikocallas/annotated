import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { ReactNode } from "react";
import { MarketingFooter, MarketingHeader, type Section } from "./MarketingChrome";

function sectionFor(location: string): Section {
  if (location === "/" || location === "/feed") return "feed";
  if (location.startsWith("/requests")) return "requests";
  return null;
}

export function AppLayout({
  children,
}: {
  children: ReactNode;
  // Accepted but ignored, so existing callers keep type-checking.
  feedHeader?: boolean;
}) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const account = user ? (
    <>
      <Link href={`/u/${user.username}`} className="hover-elevate rounded-full" data-testid="link-profile-self">
        <Avatar className="h-8 w-8">
          <AvatarImage src={user.avatarUrl ?? undefined} alt={user.displayName} />
          <AvatarFallback>{user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          // Profile pages disappear the moment we sign out, so send the user
          // to /login rather than leave them on an empty state.
          const onProfile = location.startsWith("/u/");
          void logout().then(() => {
            if (onProfile) window.location.assign("/login");
          });
        }}
        aria-label="Sign out"
        data-testid="button-logout"
      >
        <LogOut className="w-4 h-4" />
      </Button>
    </>
  ) : (
    <Link href="/login" className="mk-signin" data-testid="button-signin-header">
      Sign in
    </Link>
  );

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <MarketingHeader current={sectionFor(location)} inApp account={account} />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}

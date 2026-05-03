import { useQuery } from "@tanstack/react-query";
import type { AnnotationWithRelations } from "@shared/schema";
import { AppLayout } from "@/components/AppLayout";
import { FeedCard } from "@/components/FeedCard";
import { OAuthSignIn } from "@/components/OAuthSignIn";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Link, useLocation } from "wouter";
import { Chrome, Scissors, FileText, Mic } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type FeedTab = "all" | "following";

export default function FeedPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // The active tab lives in the URL hash so it survives reload and
  // copy/paste. Hash router updates trigger re-renders via useLocation, but
  // we read the raw window hash to avoid coupling to its routing internals.
  const activeTab: FeedTab = readTabFromHash();
  const setTab = (tab: FeedTab) => {
    if (tab === "all") setLocation("/");
    else setLocation(`/?tab=${tab}`);
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-6 py-10 grid lg:grid-cols-[1fr_320px] gap-10">
        <div>
          <header className="mb-6">
            <h1
              className="text-4xl md:text-5xl leading-[1.05]"
              style={{ fontFamily: "var(--font-serif)" }}
              data-testid="text-feed-title"
            >
              The feed
            </h1>
            <p className="text-muted-foreground mt-2 max-w-xl">
              Clipped, annotated, and credited. 90-second highlights from videos, podcasts, and articles —
              every one linked back to the source.
            </p>
          </header>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setTab(v as FeedTab)}
            className="mb-6"
          >
            <TabsList data-testid="feed-tabs">
              <TabsTrigger value="all" data-testid="tab-all">
                All
              </TabsTrigger>
              <TabsTrigger value="following" data-testid="tab-following">
                Following
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-6">
              <AllFeed />
            </TabsContent>

            <TabsContent value="following" className="mt-6">
              <FollowingFeed />
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-6">
          <div className="rounded-lg border border-card-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold mb-2">
              <Chrome className="w-4 h-4 text-primary" />
              The clipper lives in your browser
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Annotated is a Chrome side panel extension. Open it on any video, article, or podcast
              and clip what's worth saving.
            </p>
            <Link
              href="/install"
              className="inline-flex items-center text-sm text-primary hover:underline mt-3"
              data-testid="link-aside-install"
            >
              Install the extension →
            </Link>
          </div>

          <div className="rounded-lg border border-card-border bg-card p-5">
            <div className="text-sm font-semibold mb-3">What you can clip</div>
            <ul className="space-y-2.5 text-sm">
              <li className="flex gap-2.5">
                <Scissors className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>YouTube — up to 90s, downscaled to 240p</span>
              </li>
              <li className="flex gap-2.5">
                <FileText className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>News articles — passage highlights with full attribution</span>
              </li>
              <li className="flex gap-2.5">
                <Mic className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <span>Podcasts — 90-second segments, waveform-trimmed</span>
              </li>
            </ul>
          </div>

          {!user && (
            <OAuthSignIn
              compact
              title="Sign in to follow"
              description="Use X or Google to follow creators and unlock your Following feed."
            />
          )}
        </aside>
      </div>
    </AppLayout>
  );
}

function readTabFromHash(): FeedTab {
  // Hash router URL looks like "#/?tab=following" — parse the part after the
  // first "?" of the hash for the tab value.
  const hash = typeof window !== "undefined" ? window.location.hash : "";
  const q = hash.split("?")[1] ?? "";
  const params = new URLSearchParams(q);
  return params.get("tab") === "following" ? "following" : "all";
}

function AllFeed() {
  const { data, isLoading } = useQuery<AnnotationWithRelations[]>({
    queryKey: ["/api/feed"],
  });
  return (
    <div className="space-y-5" data-testid="feed-list-all">
      {isLoading ? (
        Array.from({ length: 3 }).map((_, i) => <FeedSkeleton key={i} />)
      ) : (data ?? []).length === 0 ? (
        <div className="text-sm text-muted-foreground">No annotations yet.</div>
      ) : (
        (data ?? []).map((a) => <FeedCard key={a.id} annotation={a} />)
      )}
    </div>
  );
}

function FollowingFeed() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<AnnotationWithRelations[]>({
    queryKey: ["/api/feed", { followerOf: user?.id ?? "" }],
    queryFn: async () => {
      if (!user) return [];
      const res = await fetch(`/api/feed?followerOf=${user.id}`);
      return res.json();
    },
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="space-y-4" data-testid="feed-following-signed-out">
        <div className="rounded-lg border border-card-border bg-card p-6">
          <h3 className="text-lg font-semibold mb-1">Following requires sign-in</h3>
          <p className="text-sm text-muted-foreground">
            Sign in with X or Google to see clips from the people you follow.
          </p>
        </div>
        <OAuthSignIn
          title="Sign in to see your Following feed"
          description="Annotated uses X or Google to sign you in. No email, no password."
        />
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="space-y-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <FeedSkeleton key={i} />
        ))}
      </div>
    );
  }
  if ((data ?? []).length === 0) {
    return (
      <div
        className="rounded-lg border border-card-border bg-card p-6 text-sm text-muted-foreground"
        data-testid="feed-following-empty"
      >
        No annotations from people you follow yet. Switch to the All tab and tap{" "}
        <span className="font-medium">Follow</span> on creators you want to track.
      </div>
    );
  }
  return (
    <div className="space-y-5" data-testid="feed-list-following">
      {(data ?? []).map((a) => (
        <FeedCard key={a.id} annotation={a} />
      ))}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="rounded-lg border border-card-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-3 w-full" />
    </div>
  );
}

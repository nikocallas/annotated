import { useQuery } from "@tanstack/react-query";
import type { AnnotationWithRelations } from "@shared/schema";
import { AppLayout } from "@/components/AppLayout";
import { FeedCard } from "@/components/FeedCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Chrome, Scissors, FileText, Mic } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

export default function FeedPage() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery<AnnotationWithRelations[]>({
    queryKey: ["/api/feed"],
  });

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl px-6 py-10 grid lg:grid-cols-[1fr_320px] gap-10">
        <div>
          <header className="mb-8">
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
          <div className="space-y-5">
            {isLoading
              ? Array.from({ length: 3 }).map((_, i) => <FeedSkeleton key={i} />)
              : (data ?? []).map((a) => <FeedCard key={a.id} annotation={a} />)}
            {!isLoading && data && data.length === 0 && (
              <div className="text-sm text-muted-foreground">No annotations yet.</div>
            )}
          </div>
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
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-5">
              <div className="text-sm font-semibold mb-1">Want to clip and comment?</div>
              <p className="text-sm text-muted-foreground mb-3">Sign in with X or Google.</p>
              <Link href="/login" className="text-sm text-primary hover:underline">
                Sign in →
              </Link>
            </div>
          )}
        </aside>
      </div>
    </AppLayout>
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

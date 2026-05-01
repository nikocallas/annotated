import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { AppLayout } from "@/components/AppLayout";
import { ClipPreview } from "@/components/ClipPreview";
import { CommentThread } from "@/components/CommentThread";
import { FileClaimButton } from "@/components/FileClaimButton";
import { SourceBadge, timeAgo, hostname } from "@/components/SourceBadge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ExternalLink, Share2, Mic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { AnnotationWithRelations } from "@shared/schema";

export default function AnnotationDetailPage() {
  const [, params] = useRoute("/a/:id");
  const id = params?.id ?? "";
  const { toast } = useToast();

  const { data, isLoading } = useQuery<AnnotationWithRelations>({
    queryKey: ["/api/annotations", id],
    enabled: !!id,
  });

  function handleShare() {
    const url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() =>
        toast({ title: "Link copied", description: "Share this annotation anywhere." })
      );
    }
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-6 py-10">Loading…</div>
      </AppLayout>
    );
  }
  if (!data) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-6 py-10">
          <p className="text-muted-foreground">Annotation not found.</p>
        </div>
      </AppLayout>
    );
  }

  const a = data;

  return (
    <AppLayout>
      <article className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        {/* Header */}
        <header className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <SourceBadge type={a.sourceType} />
            <span className="text-xs text-muted-foreground">
              From {a.sourcePublication ?? hostname(a.sourceUrl)} · {timeAgo(a.createdAt)}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={handleShare} data-testid="button-share">
                <Share2 className="w-4 h-4 mr-1.5" />
                Share
              </Button>
              <FileClaimButton annotationId={a.id} />
            </div>
          </div>
          <h1
            className="text-3xl md:text-4xl leading-[1.15]"
            style={{ fontFamily: "var(--font-serif)" }}
            data-testid="text-annotation-title"
          >
            {a.sourceTitle ?? "Untitled clip"}
          </h1>
          {a.sourceAuthor && (
            <p className="text-sm text-muted-foreground">By {a.sourceAuthor}</p>
          )}

          {/* Source link — REQUIRED */}
          <a
            href={a.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            data-testid="link-source-detail"
          >
            <ExternalLink className="w-4 h-4" />
            View original on {hostname(a.sourceUrl)}
          </a>
        </header>

        {/* Author */}
        <Link
          href={`/u/${a.user.username}`}
          className="flex items-center gap-3 hover-elevate rounded-md p-2 -mx-2"
          data-testid="link-author-profile"
        >
          <Avatar className="h-10 w-10">
            <AvatarImage src={a.user.avatarUrl ?? undefined} alt={a.user.displayName} />
            <AvatarFallback>{a.user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <div className="text-sm font-semibold">{a.user.displayName}</div>
            <div className="text-xs text-muted-foreground">@{a.user.username}</div>
          </div>
        </Link>

        {/* Clip preview */}
        <ClipPreview annotation={a} fullPlayer />

        {/* Commentary */}
        {(a.commentaryText || a.commentaryAudioUrl) && (
          <section className="rounded-lg border-l-2 border-primary bg-card-foreground/[0.02] pl-5 py-4 pr-4 space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Commentary
            </div>
            {a.commentaryAudioUrl && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mic className="w-4 h-4 text-primary" />
                <audio controls src={a.commentaryAudioUrl} className="h-8" />
              </div>
            )}
            {a.commentaryText && (
              <p className="text-base leading-relaxed text-foreground/90" data-testid="text-commentary">
                {a.commentaryText}
              </p>
            )}
          </section>
        )}

        {/* Bottom source CTA + claim button (so it's near the fold AND at the bottom) */}
        <div className="flex flex-wrap gap-3 items-center justify-between border-t border-border pt-6">
          <a
            href={a.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm inline-flex items-center gap-1.5 text-primary hover:underline"
            data-testid="link-source-bottom"
          >
            <ExternalLink className="w-4 h-4" />
            Original source: {hostname(a.sourceUrl)}
          </a>
          <FileClaimButton annotationId={a.id} />
        </div>

        {/* Comments */}
        <CommentThread annotationId={a.id} />
      </article>
    </AppLayout>
  );
}

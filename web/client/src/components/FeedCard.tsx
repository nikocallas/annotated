import { Link, useLocation } from "wouter";
import { useState } from "react";
import type { AnnotationWithRelations } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { SourceBadge, timeAgo, hostname } from "./SourceBadge";
import { MessageCircle, Mic, Bookmark, Share2, Eye } from "lucide-react";
import { SiX } from "react-icons/si";
import { ClipPreview } from "./ClipPreview";
import { useAuth } from "@/lib/auth-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface FeedCardProps {
  annotation: AnnotationWithRelations;
  bookmarked?: boolean;
}

export function FeedCard({ annotation, bookmarked }: FeedCardProps) {
  const a = annotation;
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [optimisticBookmarked, setOptimisticBookmarked] = useState<boolean | null>(null);
  const isBookmarked = optimisticBookmarked ?? !!bookmarked;

  const bookmarkMutation = useMutation({
    mutationFn: async (action: "bookmark" | "unbookmark") => {
      if (!user) return;
      const method = action === "bookmark" ? "POST" : "DELETE";
      await apiRequest(method, `/api/annotations/${a.id}/bookmark`, { userId: user.id });
    },
    onSuccess: (_data, action) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks/ids", { userId: user?.id ?? "" }] });
      toast({
        title: action === "bookmark" ? "Bookmarked" : "Bookmark removed",
        description: a.sourceTitle ?? undefined,
      });
    },
    onError: (err: unknown) => {
      // revert optimistic state
      setOptimisticBookmarked((prev) => (prev === null ? prev : !prev));
      const message = err instanceof Error ? err.message : "Couldn't update bookmark";
      toast({ title: "Couldn't update bookmark", description: message, variant: "destructive" });
    },
  });

  const annotationUrl = typeof window !== "undefined"
    ? `${window.location.origin}/a/${a.id}`
    : `/a/${a.id}`;
  const shareTitle = a.sourceTitle ?? "Annotated clip";
  const shareText = a.commentaryText
    ? `${shareTitle} — ${a.commentaryText.slice(0, 140)}`
    : shareTitle;

  const handleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast({ title: "Sign in to bookmark", description: "Use X or Google to save clips." });
      setLocation("/login");
      return;
    }
    const next = !isBookmarked;
    setOptimisticBookmarked(next);
    bookmarkMutation.mutate(next ? "bookmark" : "unbookmark");
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const navAny = typeof navigator !== "undefined" ? (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }) : null;
    if (navAny?.share) {
      try {
        await navAny.share({ title: shareTitle, text: shareText, url: annotationUrl });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(annotationUrl);
      toast({ title: "Link copied", description: annotationUrl });
    } catch {
      toast({ title: "Couldn't copy", description: annotationUrl, variant: "destructive" });
    }
  };

  const handlePostOnX = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const text = `${shareTitle} — clipped on @annotated`;
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(annotationUrl)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  };

  return (
    <Card
      className="overflow-hidden border-card-border bg-card hover-elevate"
      data-testid={`card-annotation-${a.id}`}
    >
      <Link href={`/a/${a.id}`} className="block">
        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src={a.user.avatarUrl ?? undefined} alt={a.user.displayName} />
              <AvatarFallback>{a.user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm" data-testid={`text-author-${a.id}`}>
                  {a.user.displayName}
                </span>
                <span className="text-xs text-muted-foreground">@{a.user.username}</span>
              </div>
              <div className="text-xs text-muted-foreground">{timeAgo(a.createdAt)}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <SourceBadge type={a.sourceType} />
            </div>
          </div>

          {/* Source attribution */}
          <div className="text-sm">
            <div className="text-muted-foreground text-xs mb-1">From {a.sourcePublication ?? hostname(a.sourceUrl)}</div>
            <div className="font-medium leading-snug" data-testid={`text-source-title-${a.id}`}>
              {a.sourceTitle ?? a.sourceUrl}
            </div>
            {a.sourceAuthor && (
              <div className="text-xs text-muted-foreground mt-0.5">By {a.sourceAuthor}</div>
            )}
          </div>

          {/* Clip preview */}
          <ClipPreview annotation={a} compact />

          {/* Commentary */}
          {a.commentaryText && (
            <p className="text-sm leading-relaxed text-foreground/90" data-testid={`text-commentary-${a.id}`}>
              {a.commentaryText}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1 border-t border-card-border/60 -mx-5 -mb-5 mt-1 px-3 py-2">
            <span className="inline-flex items-center gap-1 px-2">
              <MessageCircle className="w-3.5 h-3.5" />
              {a.commentCount} {a.commentCount === 1 ? "note" : "notes"}
            </span>
            <span
              className="inline-flex items-center gap-1 px-2"
              data-testid={`text-views-${a.id}`}
              aria-label={`${a.viewCount ?? 0} views`}
            >
              <Eye className="w-3.5 h-3.5" />
              {(a.viewCount ?? 0).toLocaleString()}
              <span className="hidden sm:inline ml-0.5">views</span>
            </span>
            {a.commentaryAudioUrl && (
              <span className="inline-flex items-center gap-1 px-2">
                <Mic className="w-3.5 h-3.5" />
                Audio
              </span>
            )}
            <div className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                onClick={handleBookmark}
                aria-pressed={isBookmarked}
                aria-label={isBookmarked ? "Remove bookmark" : "Bookmark"}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover-elevate text-xs ${
                  isBookmarked ? "text-primary" : ""
                }`}
                data-testid={`button-bookmark-${a.id}`}
              >
                <Bookmark className={`w-3.5 h-3.5 ${isBookmarked ? "fill-current" : ""}`} />
                {isBookmarked ? "Marked" : "Mark"}
              </button>
              <button
                type="button"
                onClick={handlePostOnX}
                aria-label="Post on X"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover-elevate text-xs"
                data-testid={`button-post-x-${a.id}`}
              >
                <SiX className="w-3 h-3" />
                Post
              </button>
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md hover-elevate text-xs"
                data-testid={`button-share-${a.id}`}
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </button>
            </div>
          </div>
        </div>
      </Link>
    </Card>
  );
}

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { AppLayout } from "@/components/AppLayout";
import { ClipPreview } from "@/components/ClipPreview";
import { CommentThread } from "@/components/CommentThread";
import { FileClaimButton } from "@/components/FileClaimButton";
import { DeleteAnnotationButton } from "@/components/DeleteAnnotationButton";
import { SourceBadge, hostname } from "@/components/SourceBadge";
import { SourceCredit } from "@/components/SourceCredit";
import { VoteButtons } from "@/components/VoteButtons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ExternalLink,
  Share2,
  Mic,
  ArrowLeft,
  Bookmark,
  ShieldCheck,
  Eye,
} from "lucide-react";
import { SiX } from "react-icons/si";
import { useToast } from "@/hooks/use-toast";
import { apiFetch, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import type { AnnotationWithRelations } from "@shared/schema";

const CANONICAL_ORIGIN = "https://www.annotatedextension.com";

export default function AnnotationDetailPage() {
  const [, params] = useRoute("/a/:id");
  const id = params?.id ?? "";
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AnnotationWithRelations>({
    queryKey: ["/api/annotations", id, { userId: user?.id ?? "" }],
    queryFn: async () => {
      const res = await apiFetch(`/api/annotations/${id}`);
      if (!res.ok) throw new Error(`${res.status}`);
      return res.json();
    },
    enabled: !!id,
  });

  // Bookmarks (best-effort; requires sign-in)
  const { data: bookmarkIdsRes } = useQuery<{ ids: string[] }>({
    queryKey: ["/api/bookmarks/ids", { userId: user?.id ?? "" }],
    queryFn: async () => {
      if (!user) return { ids: [] };
      const res = await apiFetch("/api/bookmarks/ids");
      return res.json();
    },
    enabled: !!user,
  });
  const isBookmarked = !!bookmarkIdsRes?.ids?.includes(id);
  const [optimisticBookmark, setOptimisticBookmark] = useState<boolean | null>(null);
  const bookmarked = optimisticBookmark ?? isBookmarked;

  const bookmarkMutation = useMutation({
    mutationFn: async (action: "bookmark" | "unbookmark") => {
      if (!user) return;
      const method = action === "bookmark" ? "POST" : "DELETE";
      await apiRequest(method, `/api/annotations/${id}/bookmark`);
    },
    onSuccess: (_d, action) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks/ids", { userId: user?.id ?? "" }] });
      toast({ title: action === "bookmark" ? "Bookmarked" : "Bookmark removed" });
    },
    onError: () => {
      setOptimisticBookmark((p) => (p === null ? p : !p));
      toast({ title: "Couldn't update bookmark", variant: "destructive" });
    },
  });

  // Fire a single view increment per session per annotation.
  useEffect(() => {
    if (!id) return;
    const KEY = `viewed:${id}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(KEY)) return;
    fetch(`/api/annotations/${id}/view`, { method: "POST" }).catch(() => {});
    try {
      sessionStorage?.setItem(KEY, "1");
    } catch {}
  }, [id]);

  function handleShare() {
    const url = `${CANONICAL_ORIGIN}/a/${encodeURIComponent(id)}`;
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(url)
        .then(() =>
          toast({ title: "Link copied", description: url })
        )
        .catch(() =>
          toast({ title: "Couldn't copy", description: url, variant: "destructive" })
        );
    }
  }

  function handlePostOnX() {
    if (!data) return;
    const url = `${CANONICAL_ORIGIN}/a/${encodeURIComponent(id)}`;
    const text = `${data.sourceTitle ?? "Annotated clip"} — clipped on @annotated`;
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  }

  function handleBookmark() {
    if (!user) {
      toast({ title: "Sign in to bookmark", description: "Use X or Google to save clips." });
      return;
    }
    const next = !bookmarked;
    setOptimisticBookmark(next);
    bookmarkMutation.mutate(next ? "bookmark" : "unbookmark");
  }

  if (isLoading) {
    return (
      <AppLayout feedHeader>
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-10">Loading…</div>
      </AppLayout>
    );
  }
  if (!data) {
    return (
      <AppLayout feedHeader>
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6 py-10">
          <p className="text-muted-foreground">Annotation not found.</p>
        </div>
      </AppLayout>
    );
  }

  const a = data;
  const publishedDate = new Date(a.createdAt * 1000).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const clipLength =
    a.clipStartSec != null && a.clipEndSec != null
      ? formatClipLength(a.clipEndSec - a.clipStartSec)
      : null;

  return (
    <AppLayout feedHeader>
      <div
        className="mx-auto max-w-[1200px] px-4 sm:px-6 py-6 lg:py-8"
        data-testid={`page-annotation-${a.id}`}
      >
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5"
          data-testid="link-back"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 lg:gap-8">
          {/* ----------------- Main column ----------------- */}
          <article className="space-y-6 min-w-0">
            {/* Type chip + view count */}
            <div className="flex items-center gap-3 flex-wrap">
              <SourceBadge type={a.sourceType} />
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Eye className="w-3 h-3" />
                <span data-testid="text-detail-views">
                  {(a.viewCount ?? 0).toLocaleString()} views
                </span>
              </span>
            </div>

            {/* Title */}
            <h1
              className="text-3xl md:text-4xl leading-[1.15] font-semibold"
              style={{ fontFamily: "var(--font-sans)" }}
              data-testid="text-annotation-title"
            >
              {a.sourceTitle ?? "Untitled clip"}
            </h1>

            {/* Author/meta line */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap">
              <Avatar className="h-5 w-5">
                <AvatarImage src={a.user.avatarUrl ?? undefined} alt={a.user.displayName} />
                <AvatarFallback>{a.user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <Link
                href={`/u/${a.user.username}`}
                className="hover:text-foreground"
                data-testid="link-author-inline"
              >
                Annotated by {a.user.displayName}
              </Link>
              <span aria-hidden>·</span>
              <span>{publishedDate}</span>
              {clipLength && (
                <>
                  <span aria-hidden>·</span>
                  <span data-testid="text-clip-length">{clipLength}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>Public</span>
            </div>

            {/* Source excerpt / player card */}
            <Card
              className="overflow-hidden border-card-border bg-card p-5 space-y-4"
              data-testid="card-source-excerpt"
            >
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                {a.sourceType === "article"
                  ? "Source excerpt"
                  : a.sourceType === "youtube"
                  ? "Video clip"
                  : "Audio clip"}
              </div>

              <ClipPreview annotation={a} fullPlayer />

              <div className="flex items-center justify-between border-t border-card-border/60 pt-3 text-xs">
                <span className="text-muted-foreground">{hostname(a.sourceUrl)}</span>
                <a
                  href={a.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  data-testid="link-source-detail"
                >
                  {a.sourceType === "podcast"
                    ? "Listen to the full episode"
                    : a.sourceType === "youtube"
                    ? "Watch the full video"
                    : "Read the original"}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </Card>

            {/* Annotation / commentary card */}
            {(a.commentaryText || a.commentaryAudioUrl) && (
              <Card
                className="overflow-hidden border-card-border bg-card p-5 space-y-3"
                data-testid="card-commentary"
              >
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-2">
                  <Avatar className="h-4 w-4">
                    <AvatarImage src={a.user.avatarUrl ?? undefined} alt={a.user.displayName} />
                    <AvatarFallback>{a.user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  Annotation by {a.user.displayName}
                </div>
                {a.commentaryAudioUrl && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mic className="w-4 h-4 text-primary" />
                    <audio controls src={a.commentaryAudioUrl} className="h-8" />
                  </div>
                )}
                {a.commentaryText && (
                  <p
                    className="text-base leading-relaxed text-foreground/90"
                    data-testid="text-commentary"
                  >
                    {a.commentaryText}
                  </p>
                )}
              </Card>
            )}

            {/* Action row: Vote / Mark / Post on X / Share */}
            <div
              className="flex flex-wrap items-center gap-2 border-t border-b border-card-border/60 -mx-1 px-1 py-2"
              data-testid="row-actions"
            >
              <VoteButtons
                annotationId={a.id}
                size="md"
                initial={{
                  score: a.voteScore ?? 0,
                  upvotes: a.upvotes ?? 0,
                  downvotes: a.downvotes ?? 0,
                  viewerVote: a.viewerVote ?? null,
                }}
              />
              <span className="text-xs text-muted-foreground px-2">
                {a.commentCount} {a.commentCount === 1 ? "note" : "notes"}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBookmark}
                  data-testid="button-bookmark-detail"
                  aria-pressed={bookmarked}
                >
                  <Bookmark
                    className={`w-4 h-4 mr-1.5 ${bookmarked ? "fill-current text-primary" : ""}`}
                  />
                  {bookmarked ? "Marked" : "Mark"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handlePostOnX}
                  data-testid="button-post-x-detail"
                >
                  <SiX className="w-3.5 h-3.5 mr-1.5" />
                  Post
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleShare}
                  data-testid="button-share-detail"
                >
                  <Share2 className="w-4 h-4 mr-1.5" />
                  Share
                </Button>
                <DeleteAnnotationButton
                  annotationId={a.id}
                  ownerId={a.user.id}
                  variant="detail"
                  redirectTo={`/u/${a.user.username}`}
                />
              </div>
            </div>

            {/* Discussion */}
            <section className="space-y-4">
              <h2
                className="text-xl font-semibold"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Discussion ({a.commentCount})
              </h2>
              <CommentThread annotationId={a.id} />
            </section>

            {/* Trust & Safety / File a claim */}
            <Card
              className="border-card-border bg-card p-4 flex flex-wrap items-start gap-3"
              data-testid="card-trust-safety"
            >
              <div className="rounded-full bg-primary/10 text-primary p-2">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm">Trust &amp; Safety</div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We believe in informed conversation and accountability. If you
                  believe this clip exceeds fair use or infringes your rights,
                  file a claim and our team will review.{" "}
                  <a
                    href="/claims"
                    className="text-primary hover:underline"
                    data-testid="link-claim-learn"
                  >
                    Learn how claims work →
                  </a>
                </p>
              </div>
              <FileClaimButton
                annotationId={a.id}
                postTitle={a.sourceTitle}
                postSourceUrl={a.sourceUrl}
              />
            </Card>
          </article>

          {/* ----------------- Right rail ----------------- */}
          <aside className="space-y-4 lg:sticky lg:top-20 self-start" data-testid="rail-detail">
            {/* Annotated By */}
            <Card className="border-card-border bg-card p-4 space-y-3" data-testid="rail-annotated-by">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                Annotated by
              </div>
              <Link
                href={`/u/${a.user.username}`}
                className="flex items-center gap-3 hover-elevate rounded-md p-1 -m-1"
                data-testid="link-rail-author"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={a.user.avatarUrl ?? undefined} alt={a.user.displayName} />
                  <AvatarFallback>{a.user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{a.user.displayName}</div>
                  <div className="text-xs text-muted-foreground truncate">@{a.user.username}</div>
                </div>
              </Link>
              {a.user.bio && (
                <p className="text-xs text-muted-foreground leading-relaxed">{a.user.bio}</p>
              )}
              <Link
                href={`/u/${a.user.username}`}
                className="inline-block text-xs text-primary hover:underline pt-1"
                data-testid="link-rail-view-profile"
              >
                View profile →
              </Link>
            </Card>

            {/* About the source */}
            <Card className="border-card-border bg-card p-4 space-y-3" data-testid="rail-about-source">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                About the source
              </div>
              <SourceBadge type={a.sourceType} />
              <div className="text-xs text-muted-foreground">{hostname(a.sourceUrl)}</div>
              <dl className="text-xs grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="uppercase tracking-wider text-muted-foreground">Published</dt>
                <dd className="text-right">{publishedDate}</dd>
                {clipLength && (
                  <>
                    <dt className="uppercase tracking-wider text-muted-foreground">Clip length</dt>
                    <dd className="text-right">{clipLength}</dd>
                  </>
                )}
                {a.sourceAuthor && (
                  <>
                    <dt className="uppercase tracking-wider text-muted-foreground">Author</dt>
                    <dd className="text-right truncate">{a.sourceAuthor}</dd>
                  </>
                )}
              </dl>
              <a
                href={a.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-1"
                data-testid="link-rail-source"
              >
                {a.sourceType === "podcast"
                  ? "Listen to the full episode"
                  : a.sourceType === "youtube"
                  ? "Watch the full video"
                  : "Read the original"}
                <ExternalLink className="w-3 h-3" />
              </a>
            </Card>

            {/* Source credits — sits directly under "About the source" so the
                attribution is visible on every annotation, with a link back to
                the original work. */}
            <SourceCredit annotation={a} />

            {/* Transcript module — only for video/podcast. We do not fetch
                real transcripts; the panel exists with a polite empty state
                so the layout matches the reference. */}
            {(a.sourceType === "youtube" || a.sourceType === "podcast") && (
              <Card className="border-card-border bg-card p-4 space-y-2" data-testid="rail-transcript">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                  Transcript
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Open the original {a.sourceType === "youtube" ? "video" : "episode"} to view its full transcript.
                </p>
                <a
                  href={a.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  data-testid="link-rail-transcript"
                >
                  View on {hostname(a.sourceUrl)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}

function formatClipLength(seconds: number) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

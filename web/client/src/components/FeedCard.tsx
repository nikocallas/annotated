import { Link } from "wouter";
import type { AnnotationWithRelations } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { SourceBadge, formatRange, timeAgo, hostname } from "./SourceBadge";
import { ExternalLink, MessageCircle, Mic } from "lucide-react";
import { ClipPreview } from "./ClipPreview";

export function FeedCard({ annotation }: { annotation: AnnotationWithRelations }) {
  const a = annotation;
  return (
    <Card className="overflow-hidden border-card-border bg-card hover-elevate" data-testid={`card-annotation-${a.id}`}>
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
            <div className="ml-auto"><SourceBadge type={a.sourceType} /></div>
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
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="w-3.5 h-3.5" />
              {a.commentCount} {a.commentCount === 1 ? "comment" : "comments"}
            </span>
            {a.commentaryAudioUrl && (
              <span className="inline-flex items-center gap-1">
                <Mic className="w-3.5 h-3.5" />
                Audio commentary
              </span>
            )}
            <a
              href={a.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
              data-testid={`link-source-${a.id}`}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Source
            </a>
          </div>
        </div>
      </Link>
    </Card>
  );
}

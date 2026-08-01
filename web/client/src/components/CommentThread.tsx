import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { timeAgo } from "./SourceBadge";
import { Link } from "wouter";
import { Reply } from "lucide-react";
import type { Comment, CommentWithReplies, User } from "@shared/schema";

type CommentRow = Comment & { user: User };

export function CommentThread({ annotationId }: { annotationId: string }) {
  const { user } = useAuth();
  const [body, setBody] = useState("");
  const [replyOpenFor, setReplyOpenFor] = useState<string | null>(null);

  const queryKey = ["/api/annotations", annotationId, "comments"];
  const { data: comments = [], isLoading } = useQuery<CommentWithReplies[]>({
    queryKey,
  });

  const totalCount = comments.reduce((acc, c) => acc + 1 + (c.replies?.length ?? 0), 0);

  const postMutation = useMutation({
    mutationFn: async (input: { body: string; parentId?: string | null }) => {
      if (!user) throw new Error("Sign in to comment");
      const res = await apiRequest("POST", `/api/annotations/${annotationId}/comments`, {
        body: input.body,
        parentId: input.parentId ?? null,
      });
      return res.json();
    },
    onSuccess: (_data, vars) => {
      if (!vars.parentId) setBody("");
      setReplyOpenFor(null);
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["/api/annotations", annotationId] });
    },
  });

  return (
    <section className="space-y-5" aria-label="Comments">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {totalCount} {totalCount === 1 ? "comment" : "comments"}
      </h3>

      {user ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmed = body.trim();
            if (trimmed) postMutation.mutate({ body: trimmed });
          }}
          className="space-y-3"
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Reply as @${user.username}…`}
            rows={3}
            data-testid="input-comment-body"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!body.trim() || postMutation.isPending}
              size="sm"
              data-testid="button-post-comment"
            >
              {postMutation.isPending && !replyOpenFor ? "Posting…" : "Post comment"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline" data-testid="link-login-from-comments">
            Sign in
          </Link>{" "}
          to leave a comment.
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading comments…</div>
      ) : (
        <ul className="space-y-5">
          {comments.map((c) => (
            <li key={c.id} data-testid={`comment-${c.id}`}>
              <CommentNode comment={c} />
              {/* Reply trigger + form */}
              <div className="ml-11 mt-2">
                {user ? (
                  replyOpenFor === c.id ? (
                    <ReplyForm
                      placeholder={`Reply to @${c.user.username}…`}
                      pending={postMutation.isPending}
                      onCancel={() => setReplyOpenFor(null)}
                      onSubmit={(text) =>
                        postMutation.mutate({ body: text, parentId: c.id })
                      }
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReplyOpenFor(c.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      data-testid={`button-reply-${c.id}`}
                    >
                      <Reply className="w-3 h-3" />
                      Reply
                    </button>
                  )
                ) : (
                  <Link
                    href="/login"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    data-testid={`link-login-reply-${c.id}`}
                  >
                    <Reply className="w-3 h-3" />
                    Sign in to reply
                  </Link>
                )}
              </div>

              {/* Replies — single nesting level only, per design constraint. */}
              {c.replies && c.replies.length > 0 && (
                <ul
                  className="mt-3 ml-7 pl-4 border-l border-card-border/60 space-y-4"
                  data-testid={`replies-${c.id}`}
                >
                  {c.replies.map((r) => (
                    <li key={r.id} data-testid={`reply-${r.id}`}>
                      <CommentNode comment={r} compact />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {!comments.length && (
            <li className="text-sm text-muted-foreground">No comments yet. Be the first.</li>
          )}
        </ul>
      )}
    </section>
  );
}

function CommentNode({
  comment,
  compact = false,
}: {
  comment: CommentRow;
  compact?: boolean;
}) {
  const c = comment;
  return (
    <div className="flex gap-3">
      <Avatar className={`${compact ? "h-7 w-7" : "h-8 w-8"} mt-0.5 shrink-0`}>
        <AvatarImage src={c.user.avatarUrl ?? undefined} alt={c.user.displayName} />
        <AvatarFallback>{c.user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/u/${c.user.username}`} className="font-semibold hover:underline">
            {c.user.displayName}
          </Link>
          <span className="text-xs text-muted-foreground">@{c.user.username}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
        </div>
        <p className="text-sm text-foreground/90 leading-relaxed mt-0.5 whitespace-pre-wrap">
          {c.body}
        </p>
      </div>
    </div>
  );
}

function ReplyForm({
  placeholder,
  pending,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  pending: boolean;
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = text.trim();
        if (trimmed) onSubmit(trimmed);
      }}
      className="space-y-2"
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={2}
        autoFocus
        data-testid="input-reply-body"
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={!text.trim() || pending}>
          {pending ? "Posting…" : "Reply"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

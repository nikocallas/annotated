import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { timeAgo } from "./SourceBadge";
import { Link } from "wouter";
import type { Comment, User } from "@shared/schema";

type CommentRow = Comment & { user: User };

export function CommentThread({ annotationId }: { annotationId: string }) {
  const { user } = useAuth();
  const [body, setBody] = useState("");

  const queryKey = ["/api/annotations", annotationId, "comments"];
  const { data: comments = [], isLoading } = useQuery<CommentRow[]>({
    queryKey,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to comment");
      const res = await apiRequest("POST", `/api/annotations/${annotationId}/comments`, {
        userId: user.id,
        body,
      });
      return res.json();
    },
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <section className="space-y-5" aria-label="Comments">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {comments.length} {comments.length === 1 ? "comment" : "comments"}
      </h3>

      {user ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) mutation.mutate();
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
              disabled={!body.trim() || mutation.isPending}
              size="sm"
              data-testid="button-post-comment"
            >
              {mutation.isPending ? "Posting…" : "Post comment"}
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
        <ul className="space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-3" data-testid={`comment-${c.id}`}>
              <Avatar className="h-8 w-8 mt-0.5 shrink-0">
                <AvatarImage src={c.user.avatarUrl ?? undefined} alt={c.user.displayName} />
                <AvatarFallback>{c.user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm">
                  <Link href={`/u/${c.user.username}`} className="font-semibold hover:underline">
                    {c.user.displayName}
                  </Link>
                  <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
                </div>
                <p className="text-sm text-foreground/90 leading-relaxed mt-0.5">{c.body}</p>
              </div>
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

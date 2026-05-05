import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { ChevronUp, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { VoteValue } from "@shared/schema";

interface VoteSummary {
  score: number;
  upvotes: number;
  downvotes: number;
  viewerVote: VoteValue | null;
}

interface VoteButtonsProps {
  annotationId: string;
  initial: VoteSummary;
  layout?: "row" | "stack";
  size?: "sm" | "md";
  /** Stop click events from bubbling (for use inside a Link card). */
  stopPropagation?: boolean;
}

export function VoteButtons({
  annotationId,
  initial,
  layout = "row",
  size = "sm",
  stopPropagation = false,
}: VoteButtonsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [state, setState] = useState<VoteSummary>(initial);
  const [pending, setPending] = useState(false);

  const mutation = useMutation({
    mutationFn: async (next: VoteValue) => {
      const res = await apiRequest("POST", `/api/annotations/${annotationId}/vote`, {
        userId: user?.id,
        value: next,
      });
      return (await res.json()) as VoteSummary;
    },
    onSuccess: (data) => {
      setState(data);
      // Invalidate downstream queries so the feed/detail query refresh on next visit.
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/annotations", annotationId] });
    },
    onError: () => {
      toast({ title: "Couldn't record vote", variant: "destructive" });
    },
    onSettled: () => setPending(false),
  });

  const handle = (e: React.MouseEvent, value: VoteValue) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!user) {
      toast({ title: "Sign in to vote", description: "Use X or Google to vote on clips." });
      setLocation("/login");
      return;
    }
    if (pending) return;
    // Optimistic update — toggling the same direction clears, switching swaps.
    setState((prev) => {
      const wasSame = prev.viewerVote === value;
      const wasOther = prev.viewerVote != null && prev.viewerVote !== value;
      const nextViewer = wasSame ? null : value;
      const upvotes =
        prev.upvotes +
        (value === 1
          ? wasSame
            ? -1
            : 1
          : wasOther
            ? -1
            : 0);
      const downvotes =
        prev.downvotes +
        (value === -1
          ? wasSame
            ? -1
            : 1
          : wasOther
            ? -1
            : 0);
      return {
        upvotes,
        downvotes,
        score: upvotes - downvotes,
        viewerVote: nextViewer,
      };
    });
    setPending(true);
    mutation.mutate(value);
  };

  const isUp = state.viewerVote === 1;
  const isDown = state.viewerVote === -1;
  const iconSize = size === "md" ? "w-4 h-4" : "w-3.5 h-3.5";
  const padding = size === "md" ? "px-2.5 py-1.5" : "px-2 py-1.5";
  const rowClass =
    layout === "stack"
      ? "inline-flex flex-col items-center gap-0.5"
      : "inline-flex items-center gap-0.5";

  return (
    <div className={rowClass} data-testid={`vote-buttons-${annotationId}`}>
      <button
        type="button"
        onClick={(e) => handle(e, 1)}
        aria-label="Upvote"
        aria-pressed={isUp}
        disabled={pending}
        className={`inline-flex items-center gap-1 rounded-md hover-elevate text-xs ${padding} ${
          isUp ? "text-primary" : ""
        }`}
        data-testid={`button-upvote-${annotationId}`}
      >
        <ChevronUp className={`${iconSize} ${isUp ? "fill-current" : ""}`} />
        {layout === "stack" ? null : <span className="sr-only">Upvote</span>}
      </button>
      <span
        className={`text-xs font-semibold tabular-nums ${
          isUp ? "text-primary" : isDown ? "text-destructive" : "text-foreground"
        }`}
        aria-live="polite"
        data-testid={`text-vote-score-${annotationId}`}
      >
        {state.score}
      </span>
      <button
        type="button"
        onClick={(e) => handle(e, -1)}
        aria-label="Downvote"
        aria-pressed={isDown}
        disabled={pending}
        className={`inline-flex items-center gap-1 rounded-md hover-elevate text-xs ${padding} ${
          isDown ? "text-destructive" : ""
        }`}
        data-testid={`button-downvote-${annotationId}`}
      >
        <ChevronDown className={`${iconSize} ${isDown ? "fill-current" : ""}`} />
        {layout === "stack" ? null : <span className="sr-only">Downvote</span>}
      </button>
    </div>
  );
}

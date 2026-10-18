import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { ExternalLink, CheckCircle2, Puzzle } from "lucide-react";
import type { AnnotationRequestWithRelations } from "@shared/schema";
import { AppLayout } from "@/components/AppLayout";
import { RequestAnnotationButton } from "@/components/RequestAnnotationButton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { hostname, timeAgo } from "@/components/SourceBadge";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type View = "open" | "for-me" | "fulfilled";

const VIEWS: { key: View; label: string; requiresAuth?: boolean }[] = [
  { key: "open", label: "Open" },
  { key: "for-me", label: "Asked of me", requiresAuth: true },
  { key: "fulfilled", label: "Answered" },
];

export default function RequestsPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("open");
  const locked = view === "for-me" && !user;

  const { data, isLoading } = useQuery<AnnotationRequestWithRelations[]>({
    queryKey: ["/api/requests", { view, userId: user?.id ?? "" }],
    queryFn: async () => {
      const path =
        view === "fulfilled" ? "/api/requests?status=fulfilled" : view === "for-me" ? "/api/requests?for=me" : "/api/requests";
      const res = await apiFetch(path);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !locked,
  });

  return (
    <AppLayout feedHeader>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-8 space-y-6">
        <header className="space-y-3">
          <h1 className="text-3xl md:text-4xl font-bold tracking-[-0.025em] leading-tight">Requests</h1>
          <p className="text-muted-foreground max-w-2xl">
            Not sure a story holds up? Ask the community, or one person whose judgment you trust, to check it.
            Anyone with the extension answers by annotating the page, and the request is marked answered.
          </p>
          <RequestAnnotationButton variant="default" label="New request" />
        </header>

        <nav className="flex gap-1 border-b border-card-border" aria-label="Request views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setView(v.key)}
              aria-current={view === v.key ? "page" : undefined}
              className={`min-h-11 px-3 text-sm font-medium border-b-2 -mb-px ${
                view === v.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground"
              }`}
              data-testid={`tab-requests-${v.key}`}
            >
              {v.label}
            </button>
          ))}
        </nav>

        {locked ? (
          <Card className="border-card-border bg-card p-6 text-sm">
            <p className="text-muted-foreground mb-3">Sign in to see requests addressed to you.</p>
            <Link href="/login">
              <Button size="sm">Sign in</Button>
            </Link>
          </Card>
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full" />
            ))}
          </div>
        ) : !data || data.length === 0 ? (
          <Card className="border-card-border bg-card p-6 text-sm text-muted-foreground" data-testid="requests-empty">
            {view === "fulfilled"
              ? "No answered requests yet."
              : view === "for-me"
                ? "No one has asked you for an annotation yet."
                : "No open requests. Start one: paste a link and ask for a fact-check."}
          </Card>
        ) : (
          <ul className="space-y-3">
            {data.map((r) => (
              <li key={r.id}>
                <RequestCard request={r} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
}

function RequestCard({ request: r }: { request: AnnotationRequestWithRelations }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const close = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/requests/${r.id}/close`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({ title: "Request closed" });
    },
    onError: () => toast({ title: "Couldn't close the request", variant: "destructive" }),
  });
  const canAnswer = r.status === "open" && (!r.requestedUserId || r.requestedUserId === user?.id);

  return (
    <Card className="border-card-border bg-card p-4 space-y-3" data-testid={`card-request-${r.id}`}>
      <div className="flex items-center gap-2 text-sm">
        <Avatar className="h-7 w-7">
          <AvatarImage src={r.user.avatarUrl ?? undefined} alt={r.user.displayName} />
          <AvatarFallback>{r.user.displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="min-w-0">
          <Link href={`/u/${r.user.username}`} className="font-semibold hover:underline">
            {r.user.displayName}
          </Link>{" "}
          <span className="text-muted-foreground">
            asked{" "}
            {r.requestedUser ? (
              <Link href={`/u/${r.requestedUser.username}`} className="font-medium text-foreground hover:underline">
                @{r.requestedUser.username}
              </Link>
            ) : (
              "everyone"
            )}
            , {timeAgo(r.createdAt)}
          </span>
        </span>
        {r.status === "fulfilled" && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-[hsl(145_60%_28%)]">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden />
            Answered
          </span>
        )}
      </div>
      {r.note && <p className="text-base leading-relaxed">{r.note}</p>}
      <a
        href={r.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="source-card block p-3 hover-elevate"
      >
        <div className="text-[13px] text-muted-foreground font-semibold">
          {hostname(r.sourceUrl)}
        </div>
        <div className="text-sm font-semibold leading-snug flex items-center gap-1">
          {r.sourceTitle ?? r.sourceUrl}
          <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
        </div>
      </a>
      <div className="flex flex-wrap items-center gap-2">
        {r.fulfilledAnnotation && (
          <Link href={`/a/${r.fulfilledAnnotation.id}`}>
            <Button size="sm" variant="default" data-testid={`button-view-answer-${r.id}`}>
              Read the answer
            </Button>
          </Link>
        )}
        {canAnswer && (
          <Button asChild size="sm" variant="outline" data-testid={`button-answer-${r.id}`}>
            <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer">
              <Puzzle className="w-4 h-4 mr-1.5" aria-hidden />
              Answer with the extension
            </a>
          </Button>
        )}
        {r.status === "open" && user?.id === r.userId && (
          <Button size="sm" variant="ghost" onClick={() => close.mutate()} disabled={close.isPending}>
            Close request
          </Button>
        )}
      </div>
    </Card>
  );
}

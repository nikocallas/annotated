import { useState } from "react";
import { useLocation } from "wouter";
import { HandHelping } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.error === "string") return body.error;
    const fieldErrors = body?.error?.fieldErrors as Record<string, string[]> | undefined;
    const first = fieldErrors && Object.values(fieldErrors).flat()[0];
    if (first) return first;
  } catch {
    /* fall through */
  }
  return "Couldn't create the request. Try again.";
}

/**
 * "Put a bounty on a story": ask the community, or one named person, to
 * annotate or fact-check a page.
 */
export function RequestAnnotationButton({
  sourceUrl = "",
  sourceTitle = null,
  requestedUsername = "",
  variant = "outline",
  label = "Request an annotation",
  className,
}: {
  sourceUrl?: string;
  sourceTitle?: string | null;
  requestedUsername?: string;
  variant?: "outline" | "default" | "secondary" | "ghost";
  label?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(sourceUrl);
  const [who, setWho] = useState(requestedUsername);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (next && !user) {
      toast({ title: "Sign in to request an annotation", description: "Use X or Google to continue." });
      setLocation("/login");
      return;
    }
    if (next) {
      setUrl(sourceUrl);
      setWho(requestedUsername);
      setNote("");
    }
    setOpen(next);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUrl: url.trim(),
          sourceTitle: sourceUrl && url.trim() === sourceUrl ? sourceTitle : null,
          note: note.trim() || null,
          requestedUsername: who.trim() || null,
        }),
      });
      if (!res.ok) {
        toast({ title: "Request not sent", description: await readError(res), variant: "destructive" });
        return;
      }
      const created = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/requests"] });
      toast({
        title: "Request posted",
        description: created?.requestedUser
          ? `@${created.requestedUser.username} will see it in their requests.`
          : "Anyone on Annotated can answer it.",
      });
      setOpen(false);
      setLocation("/requests");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant} size="sm" className={className} data-testid="button-request-annotation">
          <HandHelping className="w-4 h-4 mr-1.5" aria-hidden />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Request an annotation</DialogTitle>
            <DialogDescription>
              Ask for a fact-check or the missing context on a page. Leave the name blank to ask everyone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="request-url">Page URL</Label>
            <Input
              id="request-url"
              type="url"
              inputMode="url"
              required
              placeholder="https://"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              data-testid="input-request-url"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="request-who">Ask someone specific (optional)</Label>
            <Input
              id="request-who"
              placeholder="@username"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              autoComplete="off"
              data-testid="input-request-who"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="request-note">What should they look at? (optional)</Label>
            <Textarea
              id="request-note"
              maxLength={1000}
              rows={3}
              placeholder="e.g. Is the claim in the third paragraph accurate?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="input-request-note"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting || !url.trim()} data-testid="button-submit-request">
              {submitting ? "Posting…" : "Post request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

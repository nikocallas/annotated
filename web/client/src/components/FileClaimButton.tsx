import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  CLAIM_REASON_CATEGORIES,
  CLAIM_REASON_LABELS,
  type ClaimReasonCategory,
} from "@shared/schema";

const SUPPORT_EMAIL = "support@annotatedextension.com";

/** Required by spec: every annotation page must show this prominently. */
export function FileClaimButton({
  annotationId,
  postTitle,
  postSourceUrl,
}: {
  annotationId: string;
  postTitle?: string | null;
  postSourceUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedClaimId, setSubmittedClaimId] = useState<string | null>(null);
  const [confirmationSent, setConfirmationSent] = useState<boolean | null>(null);
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [category, setCategory] = useState<ClaimReasonCategory | "">("");
  const [details, setDetails] = useState("");
  const [website, setWebsite] = useState("");
  const { toast } = useToast();

  function reset() {
    setSubmitting(false);
    setSubmittedClaimId(null);
    setConfirmationSent(null);
    setName("");
    setEmail("");
    setCategory("");
    setDetails("");
    setWebsite("");
  }

  function openDialog() {
    if (user) {
      setName(user.displayName || `@${user.username}`);
    }
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) {
      toast({
        title: "Pick a reason",
        description: "Choose the reason that best describes your claim.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest("POST", `/api/annotations/${annotationId}/claims`, {
        claimantName: name,
        claimantEmail: email,
        reasonCategory: category,
        details: details || null,
        website,
      });
      const data = (await res.json().catch(() => null)) as {
        claim?: { id: string };
        notifications?: { confirmationSent?: boolean };
      } | null;
      const id = data?.claim?.id ?? "received";
      setSubmittedClaimId(id);
      setConfirmationSent(!!data?.notifications?.confirmationSent);
      toast({
        title: "Claim received",
        description: data?.notifications?.confirmationSent
          ? `We emailed a confirmation to ${email || "you"}.`
          : `Your claim is saved. If email is delayed, contact ${SUPPORT_EMAIL}.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not submit claim";
      toast({ title: "Submission failed", description: message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={openDialog}
        className="border-destructive/40 text-destructive hover:bg-destructive/5"
        data-testid="button-file-claim"
      >
        <AlertTriangle className="w-4 h-4 mr-1.5" />
        File a claim
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-lg" data-testid="dialog-claim">
          {submittedClaimId ? (
            <>
              <DialogHeader>
                <div className="mx-auto rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-3 mb-2">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <DialogTitle className="text-center">Claim received</DialogTitle>
                <DialogDescription className="text-center">
                  {confirmationSent
                    ? `Thanks. Your claim is being reviewed and we've emailed a confirmation to ${email}.`
                    : "Thanks. Your claim is saved for review. Email delivery may be delayed."}
                </DialogDescription>
              </DialogHeader>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  The claim audit trail records notification delivery so the moderation team can
                  follow up if any message is delayed.
                </p>
                <p>
                  Any questions or concerns? Reach us at{" "}
                  <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => setOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <div className="mx-auto rounded-full bg-destructive/10 text-destructive p-3 mb-2">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <DialogTitle className="text-center">Dispute this content</DialogTitle>
                <DialogDescription className="text-center">
                  If you believe this clip infringes your copyright or exceeds fair use,
                  file a claim and our team will review.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="absolute -left-[10000px]" aria-hidden="true">
                  <Label htmlFor="claim-website">Website</Label>
                  <Input
                    id="claim-website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
                {postTitle ? (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground line-clamp-1">{postTitle}</div>
                    {postSourceUrl ? (
                      <div className="truncate">{postSourceUrl}</div>
                    ) : null}
                  </div>
                ) : null}
                <div className="grid gap-1.5">
                  <Label htmlFor="claim-name">Your full name</Label>
                  <Input
                    id="claim-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-claim-name"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="claim-email">Contact email</Label>
                  <Input
                    id="claim-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="input-claim-email"
                  />
                  <p className="text-xs text-muted-foreground">
                    We use this address for claim updates. A confirmation is sent when
                    email delivery is available.
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="claim-reason-category">Reason</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as ClaimReasonCategory)}
                  >
                    <SelectTrigger id="claim-reason-category" data-testid="select-claim-reason">
                      <SelectValue placeholder="Pick the reason that best matches" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLAIM_REASON_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CLAIM_REASON_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="claim-details">Anything else? (optional)</Label>
                  <Textarea
                    id="claim-details"
                    rows={4}
                    placeholder="Add context — links to your original work, what was copied, etc."
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    data-testid="input-claim-details"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Filing saves your claim immediately. Annotated also attempts a confirmation
                  and author notification, and records whether those messages were delivered.
                  Questions? Email{" "}
                  <a className="text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </p>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting || !category}
                    variant="destructive"
                    data-testid="button-submit-claim"
                  >
                    {submitting ? "Submitting…" : "Submit claim"}
                  </Button>
                </DialogFooter>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

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
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** Required by spec: every annotation page must show this prominently. */
export function FileClaimButton({ annotationId }: { annotationId: string }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiRequest("POST", `/api/annotations/${annotationId}/claims`, {
        claimantName: name,
        claimantEmail: email,
        reason,
      });
      toast({
        title: "Claim received",
        description:
          "Thanks. Our team will review and get back to you at the email provided. The annotation has been flagged.",
      });
      setOpen(false);
      setName("");
      setEmail("");
      setReason("");
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
        onClick={() => setOpen(true)}
        className="border-destructive/40 text-destructive hover:bg-destructive/5"
        data-testid="button-file-claim"
      >
        <AlertTriangle className="w-4 h-4 mr-1.5" />
        File a claim
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-claim">
          <DialogHeader>
            <div className="mx-auto rounded-full bg-destructive/10 text-destructive p-3 mb-2">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <DialogTitle className="text-center">Dispute this content</DialogTitle>
            <DialogDescription className="text-center">
              If you believe this clip infringes your copyright or exceeds fair use, file a claim
              and our team will review within 72 hours.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
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
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="claim-reason">Reason for claim</Label>
              <Textarea
                id="claim-reason"
                required
                rows={4}
                placeholder="Explain why this content infringes your rights, including any work it copies and how."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                data-testid="input-claim-reason"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting} variant="destructive" data-testid="button-submit-claim">
                {submitting ? "Submitting…" : "Submit claim"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

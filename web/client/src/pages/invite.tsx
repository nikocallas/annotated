import { useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/queryClient";
import { Link } from "wouter";
import { MessageSquare, Mail, Link as LinkIcon, Share2, Copy } from "lucide-react";

const LANDING_URL = "https://www.annotatedextension.com";
const INVITE_SUBJECT = "You should try Annotated";
const INVITE_BODY =
  `I've been using Annotated to clip and discuss the best moments from videos, articles, and podcasts. ` +
  `Thought you'd love it too — check it out: ${LANDING_URL}`;
const INVITE_SMS = `Hey — you'd love Annotated. Clip and discuss the best moments from videos, articles, and podcasts: ${LANDING_URL}`;
const TWEET_TEXT = `Spending way too much time on Annotated — clipping the best bits of articles, videos, and podcasts. Worth a look:`;

function buildSmsHref() {
  // iOS uses `&body=`, Android uses `?body=`. The hybrid `sms:?&body=` form works
  // on iOS (treats `?` as the separator) and Android (treats `?&` as a separator
  // followed by an empty arg, then body). Mobile-friendly fallback.
  return `sms:?&body=${encodeURIComponent(INVITE_SMS)}`;
}

function buildMailtoHref() {
  return `mailto:?subject=${encodeURIComponent(INVITE_SUBJECT)}&body=${encodeURIComponent(INVITE_BODY)}`;
}

function XMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function buildTweetHref() {
  return (
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(TWEET_TEXT)}` +
    `&url=${encodeURIComponent(LANDING_URL)}`
  );
}

function EmailInviteCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string[]>([]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const to = email.trim();
    if (!to) return;
    setSending(true);
    try {
      const res = await apiFetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: to, note: note.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSentTo((prev) => [to, ...prev]);
        setEmail("");
        toast({ title: "Invite sent", description: `We emailed ${to}.` });
        return;
      }
      if (body?.fallback === "mailto") {
        // Email delivery isn't configured: hand off to the user's mail app
        // with the same personal message, addressed to their friend.
        window.location.href =
          `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(body.subject ?? INVITE_SUBJECT)}` +
          `&body=${encodeURIComponent(body.body ?? INVITE_BODY)}`;
        setSentTo((prev) => [to, ...prev]);
        setEmail("");
        return;
      }
      toast({ title: "Invite not sent", description: body?.error ?? "Try again.", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }

  if (!user) {
    return (
      <Card className="border-card-border bg-card p-5 text-sm">
        <div className="font-semibold mb-1">Invite by email</div>
        <p className="text-muted-foreground mb-3">Sign in to send a personal invite from your account.</p>
        <Link href="/login">
          <Button size="sm" data-testid="button-invite-signin">Sign in</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="border-card-border bg-card p-5">
      <form onSubmit={send} className="space-y-3" data-testid="form-invite-email">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Invite by email</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Label htmlFor="invite-email" className="sr-only">Friend's email</Label>
            <Input
              id="invite-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="friend@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="input-invite-email"
            />
          </div>
          <Button type="submit" disabled={sending || !email.trim()} data-testid="button-invite-send">
            <Mail className="w-4 h-4" />
            {sending ? "Sending…" : "Send invite"}
          </Button>
        </div>
        <div>
          <Label htmlFor="invite-note" className="text-xs text-muted-foreground">Add a note (optional)</Label>
          <Textarea
            id="invite-note"
            rows={2}
            maxLength={500}
            placeholder="I think you'd have a great take on this."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            data-testid="input-invite-note"
          />
        </div>
        {sentTo.length > 0 && (
          <p className="text-xs text-muted-foreground" data-testid="text-invites-sent">
            Invited: {sentTo.join(", ")}
          </p>
        )}
      </form>
    </Card>
  );
}

export default function InvitePage() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(LANDING_URL);
      setCopied(true);
      toast({ title: "Link copied", description: LANDING_URL });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Couldn't copy",
        description: "Select and copy the link manually.",
        variant: "destructive",
      });
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: "Annotated",
          text: TWEET_TEXT,
          url: LANDING_URL,
        });
        return;
      } catch {
        // user dismissed or share API unavailable — fall through to copy
      }
    }
    await handleCopy();
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-6 py-12 space-y-10">
        <header className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-semibold mb-4">
            <Share2 className="w-3.5 h-3.5" />
            Invite friends
          </div>
          <h1
            className="text-4xl md:text-5xl mb-3 leading-[1.05]"
            style={{ fontFamily: "var(--font-sans)" }}
            data-testid="text-invite-title"
          >
            Love Annotated? Spread the word.
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Ideas multiply when they’re shared. Invite a friend by email, or send
            the link over text or social.
          </p>
        </header>

        <EmailInviteCard />

        <Card className="border-card-border bg-card p-5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Share link
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div
              className="flex-1 rounded-md border border-card-border bg-background px-3 py-2 text-sm font-mono break-all"
              data-testid="text-invite-link"
            >
              {LANDING_URL}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopy}
              className="shrink-0"
              data-testid="button-invite-copy"
            >
              {copied ? <LinkIcon className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </Card>

        <section className="grid sm:grid-cols-3 gap-4">
          <Button
            asChild
            variant="outline"
            className="h-auto py-5 flex-col gap-2"
            data-testid="button-invite-sms"
          >
            <a href={buildSmsHref()}>
              <MessageSquare className="w-5 h-5 text-primary" />
              <span className="font-semibold">Text / SMS</span>
              <span className="text-xs text-muted-foreground">Send via Messages</span>
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-auto py-5 flex-col gap-2"
            data-testid="button-invite-email"
          >
            <a href={buildMailtoHref()}>
              <Mail className="w-5 h-5 text-primary" />
              <span className="font-semibold">Email</span>
              <span className="text-xs text-muted-foreground">Open your mail app</span>
            </a>
          </Button>
          <Button
            asChild
            variant="outline"
            className="h-auto py-5 flex-col gap-2"
            data-testid="button-invite-twitter"
          >
            <a href={buildTweetHref()} target="_blank" rel="noopener noreferrer">
              <XMark className="w-5 h-5 text-primary" />
              <span className="font-semibold">Share on X</span>
              <span className="text-xs text-muted-foreground">Post to your followers</span>
            </a>
          </Button>
        </section>

        <div className="text-center">
          <Button
            type="button"
            size="lg"
            onClick={handleNativeShare}
            data-testid="button-invite-share"
          >
            <Share2 className="w-4 h-4" />
            Share Annotated
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

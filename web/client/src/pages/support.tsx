import { useState } from "react";
import { Logo } from "@/components/Logo";
import { DownloadExtensionButton } from "@/components/DownloadExtensionButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SiteNav } from "@/components/SiteNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, AlertCircle, LifeBuoy, User as UserIcon } from "lucide-react";

const MAX_NAME = 120;
const MAX_EMAIL = 200;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function SupportPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "submitting") return;

    if (!email.trim() || !message.trim()) {
      setState({ kind: "error", message: "Email and message are required." });
      return;
    }

    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        const msg =
          data.error ||
          (res.status === 503
            ? "Support is temporarily unavailable. Please try again later."
            : "Could not send your message. Please try again.");
        setState({ kind: "error", message: msg });
        return;
      }
      setState({ kind: "success" });
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch {
      setState({
        kind: "error",
        message: "Network error. Please check your connection and try again.",
      });
    }
  }

  const submitting = state.kind === "submitting";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-14 flex items-center gap-4 sm:gap-6">
          <Logo />
          <SiteNav />
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <DownloadExtensionButton size="sm" className="hidden md:inline-flex" />
            <a
              href="/login"
              className="md:hidden min-h-11 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-primary text-primary-foreground shadow-sm hover:opacity-95"
              data-testid="link-signin-header-mobile"
            >
              <UserIcon className="w-4 h-4" />
              Sign in
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
          <div className="flex items-center gap-3 mb-3">
            <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-primary/10 text-primary">
              <LifeBuoy className="w-5 h-5" aria-hidden="true" />
            </span>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Support
            </h1>
          </div>
          <p className="text-muted-foreground">
            Have a question, bug report, or feedback? Send us a note and we&rsquo;ll
            get back to you as soon as we can.
          </p>

          {state.kind === "success" ? (
            <div
              role="status"
              aria-live="polite"
              data-testid="support-success"
              className="mt-8 rounded-lg border border-border bg-card p-6 flex gap-3"
            >
              <CheckCircle2
                className="w-5 h-5 text-primary mt-0.5 shrink-0"
                aria-hidden="true"
              />
              <div className="space-y-1">
                <p className="font-medium">Message sent</p>
                <p className="text-sm text-muted-foreground">
                  Thanks &mdash; we&rsquo;ve received your message and will reply by
                  email. You can close this page or send another below.
                </p>
                <button
                  type="button"
                  onClick={() => setState({ kind: "idle" })}
                  className="text-sm text-primary hover:underline mt-2"
                >
                  Send another message
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              noValidate
              className="mt-8 space-y-5"
              data-testid="support-form"
            >
              {/* honeypot — visually hidden, ignored by humans, filled by bots */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: "-10000px",
                  top: "auto",
                  width: 1,
                  height: 1,
                  overflow: "hidden",
                }}
              >
                <label htmlFor="support-website">
                  Don&rsquo;t fill this out if you&rsquo;re human:
                </label>
                <input
                  id="support-website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="support-name">Name</Label>
                <Input
                  id="support-name"
                  type="text"
                  autoComplete="name"
                  maxLength={MAX_NAME}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  data-testid="input-support-name"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="support-email">
                  Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="support-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={MAX_EMAIL}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                  aria-invalid={state.kind === "error" && !email.trim()}
                  aria-describedby={state.kind === "error" && !email.trim() ? "support-error" : undefined}
                  data-testid="input-support-email"
                />
                <p className="text-xs text-muted-foreground">
                  We&rsquo;ll use this to reply to you.
                </p>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="support-subject">Subject</Label>
                <Input
                  id="support-subject"
                  type="text"
                  maxLength={MAX_SUBJECT}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={submitting}
                  placeholder="Optional"
                  data-testid="input-support-subject"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="support-message">
                  Message <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="support-message"
                  required
                  rows={7}
                  maxLength={MAX_MESSAGE}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={submitting}
                  aria-invalid={state.kind === "error" && !message.trim()}
                  aria-describedby={state.kind === "error" && !message.trim() ? "support-error" : undefined}
                  placeholder="Tell us what's on your mind. Include steps to reproduce if it's a bug."
                  data-testid="input-support-message"
                />
                <p className="text-xs text-muted-foreground">
                  {message.length}/{MAX_MESSAGE}
                </p>
              </div>

              {state.kind === "error" && (
                <div
                  id="support-error"
                  role="alert"
                  className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/5 text-destructive px-3 py-2 text-sm"
                  data-testid="support-error"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{state.message}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <Button
                  type="submit"
                  disabled={submitting}
                  data-testid="button-support-submit"
                >
                  {submitting ? "Sending…" : "Send message"}
                </Button>
              </div>
            </form>
          )}
        </section>
      </main>

      <footer className="border-t border-border mt-12">
        <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted-foreground flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
          <Logo />
          <DownloadExtensionButton size="sm" />
          <div className="flex gap-4 flex-wrap">
            <a href="/" className="inline-flex min-h-11 items-center hover:text-foreground">Home</a>
            <a href="/feed" className="inline-flex min-h-11 items-center hover:text-foreground">Feed</a>
            <a href="/demo" className="inline-flex min-h-11 items-center hover:text-foreground">Demo Video</a>
            <a href="/support" className="inline-flex min-h-11 items-center hover:text-foreground">Support</a>
            <a href="/privacy" className="inline-flex min-h-11 items-center hover:text-foreground">Privacy</a>
            <a href="/tos" className="inline-flex min-h-11 items-center hover:text-foreground">Terms</a>
          </div>
        </div>
        <div
          className="mx-auto max-w-3xl px-6 pb-6 text-xs text-muted-foreground"
          data-testid="text-footer-copyright"
        >
          © 2026 Annotated · Built by Niko Callas
        </div>
      </footer>
    </div>
  );
}

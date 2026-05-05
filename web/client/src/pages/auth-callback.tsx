import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/lib/supabase";

type ErrorKind = "x_no_email" | "generic";

interface AuthError {
  kind: ErrorKind;
  message: string;
}

// Supabase reports this when an OAuth provider (most often X/Twitter OAuth 2.0)
// completes the handshake but doesn't expose an email Supabase can use to
// create or match a user. We surface a tailored message in this case so users
// don't bounce off a raw provider error.
function classifyError(raw: string): AuthError {
  const lower = raw.toLowerCase();
  const isXEmail =
    lower.includes("error getting user email") ||
    lower.includes("user email from external provider") ||
    lower.includes("email not provided");
  if (isXEmail) {
    return {
      kind: "x_no_email",
      message: raw,
    };
  }
  return { kind: "generic", message: raw };
}

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"working" | "error">("working");
  const [error, setError] = useState<AuthError | null>(null);
  const [progress, setProgress] = useState<string>("Finishing sign-in...");

  useEffect(() => {
    (async () => {
      if (!supabase) {
        setStatus("error");
        setError({ kind: "generic", message: "Auth is not configured for this deployment." });
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const errParam = params.get("error_description") || params.get("error");
      if (errParam) {
        setStatus("error");
        setError(classifyError(errParam));
        return;
      }
      if (!code) {
        // No code present — Supabase may have already established the session
        // (e.g. user navigated back). Bounce to the feed.
        window.location.replace("/feed");
        return;
      }
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        setStatus("error");
        setError(classifyError(exchangeError.message));
        return;
      }
      // Session established. Send user to the feed.
      window.location.replace("/feed");
    })();
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-14 flex items-center">
          <Logo />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          {status === "working" ? (
            <>
              <h1
                className="text-2xl mb-2"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Signing you in
              </h1>
              <p className="text-sm text-muted-foreground">{progress}</p>
            </>
          ) : (
            <>
              <h1
                className="text-2xl mb-2"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Sign-in didn't complete
              </h1>
              {error?.kind === "x_no_email" ? (
                <div className="text-sm text-muted-foreground mb-6 space-y-3 text-left">
                  <p>
                    X (Twitter) doesn't share an email address with Annotated
                    over its OAuth 2.0 sign-in, so we can't finish creating
                    your account.
                  </p>
                  <p>
                    This is a limitation of X's OAuth — it isn't something
                    Annotated can override from the browser. The fastest fix is
                    to sign in with Google instead.
                  </p>
                  <p className="text-xs opacity-80">
                    Provider error: <code>{error.message}</code>
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mb-6">
                  {error?.message ?? "Something went wrong."}
                </p>
              )}
              <div className="flex items-center justify-center gap-4 text-sm">
                <a
                  href="/login"
                  className="underline hover:text-foreground"
                  data-testid="link-auth-callback-retry"
                >
                  {error?.kind === "x_no_email"
                    ? "Sign in with Google"
                    : "Try a different sign-in"}
                </a>
                <a href="/" className="underline hover:text-foreground">
                  Return to Annotated
                </a>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

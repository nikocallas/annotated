import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/lib/supabase";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

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

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage?: (
          extensionId: string,
          message: unknown,
          callback?: (resp: unknown) => void
        ) => void;
        lastError?: { message: string };
      };
    };
  }
}

// Returns the extensionId carried over from the sidepanel sign-in tab launcher.
// We rely on a query parameter (extensionId) supplied by the sidepanel rather
// than guessing — the same web page is opened in non-extension contexts and
// must not assume an ID. We persist the parameter through Supabase's OAuth
// hop using sessionStorage so it survives the redirect to the provider.
const EXT_FLOW_KEY = "annotated_extension_auth";

function readExtensionFlow(): { extensionId: string } | null {
  try {
    const raw = sessionStorage.getItem(EXT_FLOW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { extensionId?: string; ts?: number };
    if (!parsed.extensionId) return null;
    // Ignore very old entries (>10 min) so a stale value can't hijack a
    // future sign-in.
    if (parsed.ts && Date.now() - parsed.ts > 10 * 60 * 1000) {
      sessionStorage.removeItem(EXT_FLOW_KEY);
      return null;
    }
    return { extensionId: parsed.extensionId };
  } catch {
    return null;
  }
}

function clearExtensionFlow() {
  try { sessionStorage.removeItem(EXT_FLOW_KEY); } catch {}
}

function postUserToExtension(extensionId: string, user: User): Promise<boolean> {
  return new Promise((resolve) => {
    const c = window.chrome;
    if (!c?.runtime?.sendMessage) {
      resolve(false);
      return;
    }
    try {
      c.runtime.sendMessage(extensionId, { type: "ANNOTATED_AUTH_SUCCESS", user }, (resp) => {
        const err = c.runtime?.lastError;
        if (err) return resolve(false);
        resolve(!!(resp as { ok?: boolean } | undefined)?.ok);
      });
    } catch {
      resolve(false);
    }
  });
}

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"working" | "error" | "extension_done">("working");
  const [error, setError] = useState<AuthError | null>(null);
  const [progress, setProgress] = useState<string>("Finishing sign-in...");
  const [extensionHandoff, setExtensionHandoff] = useState<"pending" | "ok" | "manual">("pending");

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
      setProgress("Exchanging session…");
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        setStatus("error");
        setError(classifyError(exchangeError.message));
        return;
      }
      const accessToken = data.session?.access_token;

      const extFlow = readExtensionFlow();
      if (extFlow && accessToken) {
        // Mint the app-local user record server-side (same endpoint the SPA
        // uses) and hand it off to the extension via runtime.sendMessage.
        setProgress("Sending sign-in back to the extension…");
        try {
          const res = await apiRequest("POST", "/api/auth/supabase", { accessToken });
          if (res.ok) {
            const payload = (await res.json()) as { user: User };
            const sent = await postUserToExtension(extFlow.extensionId, payload.user);
            clearExtensionFlow();
            setExtensionHandoff(sent ? "ok" : "manual");
            setStatus("extension_done");
            // Auto-close after a beat if the handoff worked. Some browsers
            // disallow window.close() on tabs they didn't open; in that case
            // we leave the success page visible.
            if (sent) {
              setTimeout(() => {
                try { window.close(); } catch {}
              }, 800);
            }
            return;
          }
        } catch {
          // Fall through to the manual instruction state — user can still
          // close the tab and return to the side panel, where loadUser()
          // picks up the next time the panel mounts.
          clearExtensionFlow();
          setExtensionHandoff("manual");
          setStatus("extension_done");
          return;
        }
      }

      // Default (web app): send the user to the feed.
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
          {status === "working" && (
            <>
              <h1 className="text-2xl mb-2" style={{ fontFamily: "var(--font-sans)" }}>
                Signing you in
              </h1>
              <p className="text-sm text-muted-foreground">{progress}</p>
            </>
          )}
          {status === "extension_done" && (
            <>
              <h1
                className="text-2xl mb-2"
                style={{ fontFamily: "var(--font-sans)" }}
                data-testid="text-extension-signin-success"
              >
                You're signed in
              </h1>
              {extensionHandoff === "ok" ? (
                <p className="text-sm text-muted-foreground">
                  The Annotated extension just received your sign-in.
                  This tab will close automatically — if it doesn't, you can close it now.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  We couldn't reach the Annotated extension automatically.
                  Close this tab and reopen the side panel — your sign-in will be picked up.
                </p>
              )}
              <div className="mt-6 text-xs">
                <a href="/feed" className="underline hover:text-foreground">
                  Or continue to your feed →
                </a>
              </div>
            </>
          )}
          {status === "error" && (
            <>
              <h1 className="text-2xl mb-2" style={{ fontFamily: "var(--font-sans)" }}>
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

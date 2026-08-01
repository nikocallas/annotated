import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { apiRequest } from "@/lib/queryClient";
import {
  ANNOTATED_EXTENSION_ID,
  EXTENSION_AUTH_FLOW_KEY,
  parseStoredExtensionAuthFlow,
} from "@/lib/extension-auth";
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

// The side panel marks the OAuth tab before the provider redirect. The parsed
// flow is accepted only when it names Annotated's pinned public extension ID.
function readExtensionFlow(): { extensionId: typeof ANNOTATED_EXTENSION_ID } | null {
  try {
    const parsed = parseStoredExtensionAuthFlow(
      sessionStorage.getItem(EXTENSION_AUTH_FLOW_KEY),
    );
    if (!parsed) sessionStorage.removeItem(EXTENSION_AUTH_FLOW_KEY);
    return parsed ? { extensionId: parsed.extensionId } : null;
  } catch {
    return null;
  }
}

function clearExtensionFlow() {
  try { sessionStorage.removeItem(EXTENSION_AUTH_FLOW_KEY); } catch {}
}

interface ExtensionAuthHandoff {
  user: User;
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

function postUserToExtension(auth: ExtensionAuthHandoff): Promise<boolean> {
  return new Promise((resolve) => {
    const c = window.chrome;
    if (!c?.runtime?.sendMessage) {
      resolve(false);
      return;
    }
    try {
      c.runtime.sendMessage(ANNOTATED_EXTENSION_ID, { type: "ANNOTATED_AUTH_SUCCESS", auth }, (resp) => {
        const err = c.runtime?.lastError;
        if (err) return resolve(false);
        resolve(!!(resp as { ok?: boolean } | undefined)?.ok);
      });
    } catch {
      resolve(false);
    }
  });
}

interface PendingExtensionSession {
  extensionId: typeof ANNOTATED_EXTENSION_ID;
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
}

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"working" | "error" | "extension_done">("working");
  const [error, setError] = useState<AuthError | null>(null);
  const [progress, setProgress] = useState<string>("Finishing sign-in...");
  const [extensionHandoff, setExtensionHandoff] = useState<"pending" | "retrying" | "ok" | "manual">("pending");
  const pendingExtensionSession = useRef<PendingExtensionSession | null>(null);

  const attemptExtensionHandoff = useCallback(async () => {
    const pending = pendingExtensionSession.current;
    if (!pending || pending.extensionId !== ANNOTATED_EXTENSION_ID) return;
    setStatus("working");
    setProgress("Sending sign-in back to the extension…");
    setExtensionHandoff("retrying");
    try {
      const res = await apiRequest("POST", "/api/auth/supabase");
      const payload = (await res.json()) as { user: User };
      const sent = await postUserToExtension({
        user: payload.user,
        accessToken: pending.accessToken,
        refreshToken: pending.refreshToken,
        expiresAt: pending.expiresAt,
      });
      if (sent) {
        clearExtensionFlow();
        pendingExtensionSession.current = null;
        setExtensionHandoff("ok");
        setStatus("extension_done");
        setTimeout(() => {
          try { window.close(); } catch {}
        }, 800);
        return;
      }
    } catch {
      // Keep the bounded, pinned flow and session in memory so the user can
      // retry after installing/re-enabling the official extension.
    }
    setExtensionHandoff("manual");
    setStatus("extension_done");
  }, []);

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
      const extFlow = readExtensionFlow();
      let session;
      if (code) {
        setProgress("Exchanging session…");
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          setStatus("error");
          setError(classifyError(exchangeError.message));
          return;
        }
        session = data.session;
      } else {
        // A reload after a failed extension handoff no longer discards the
        // completed OAuth session. Reuse it while the pinned flow is fresh.
        const { data } = await supabase.auth.getSession();
        session = data.session;
      }

      if (extFlow && session?.access_token && session.refresh_token) {
        pendingExtensionSession.current = {
          extensionId: extFlow.extensionId,
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          expiresAt: session.expires_at ?? null,
        };
        await attemptExtensionHandoff();
        return;
      }
      if (extFlow && !session) {
        window.location.replace(
          `/login?extension=1&extensionId=${encodeURIComponent(ANNOTATED_EXTENSION_ID)}`,
        );
        return;
      }

      // Default (web app): send the user to the feed.
      window.location.replace("/feed");
    })();
  }, [attemptExtensionHandoff]);

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
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    We couldn't reach the official Annotated extension. Make sure
                    it is installed and enabled, then retry this secure handoff.
                  </p>
                  <Button
                    type="button"
                    onClick={() => void attemptExtensionHandoff()}
                    disabled={extensionHandoff === "retrying"}
                    data-testid="button-extension-handoff-retry"
                  >
                    {extensionHandoff === "retrying" ? "Retrying…" : "Retry extension handoff"}
                  </Button>
                </div>
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

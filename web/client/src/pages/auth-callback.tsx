import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"working" | "error">("working");
  const [message, setMessage] = useState<string>("Finishing sign-in...");

  useEffect(() => {
    (async () => {
      if (!supabase) {
        setStatus("error");
        setMessage("Auth is not configured for this deployment.");
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const error = params.get("error_description") || params.get("error");
      if (error) {
        setStatus("error");
        setMessage(error);
        return;
      }
      if (!code) {
        // No code present — Supabase may have already established the session
        // (e.g. user navigated back). Just bounce home.
        window.location.replace("/");
        return;
      }
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) {
        setStatus("error");
        setMessage(exchangeError.message);
        return;
      }
      // Session established. Send user back to the app root (hash-routed feed).
      window.location.replace("/");
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
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Signing you in
              </h1>
              <p className="text-sm text-muted-foreground">{message}</p>
            </>
          ) : (
            <>
              <h1
                className="text-2xl mb-2"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Sign-in didn't complete
              </h1>
              <p className="text-sm text-muted-foreground mb-6">{message}</p>
              <a
                href="/"
                className="text-sm underline hover:text-foreground"
              >
                Return to Annotated
              </a>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

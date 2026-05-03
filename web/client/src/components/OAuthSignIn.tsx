import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { supabaseConfigured } from "@/lib/supabase";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface OAuthSignInProps {
  title?: string;
  description?: string;
  compact?: boolean;
}

export function OAuthSignIn({
  title = "Sign in",
  description = "Annotated uses X or Google to sign you in. No email, no password.",
  compact = false,
}: OAuthSignInProps) {
  const { loginWithProvider } = useAuth();
  const [busy, setBusy] = useState<"x" | "google" | null>(null);
  const { toast } = useToast();

  async function handleLogin(provider: "x" | "google") {
    setBusy(provider);
    try {
      await loginWithProvider(provider);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign-in failed";
      toast({ title: "Sign-in failed", description: message, variant: "destructive" });
      setBusy(null);
    }
  }

  return (
    <div
      className={`rounded-lg border border-card-border bg-card ${compact ? "p-5" : "p-8"}`}
      data-testid="oauth-signin-section"
    >
      <h2
        className={compact ? "text-lg font-semibold mb-1" : "text-2xl mb-1"}
        style={compact ? undefined : { fontFamily: "var(--font-serif)" }}
        data-testid="text-oauth-title"
      >
        {title}
      </h2>
      <p className="text-sm text-muted-foreground mb-5">{description}</p>
      <div className={`grid ${compact ? "grid-cols-1 gap-2" : "gap-3"}`}>
        <Button
          onClick={() => handleLogin("x")}
          disabled={!!busy}
          className="w-full"
          size={compact ? "default" : "lg"}
          data-testid="button-feed-signin-x"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="currentColor"
            className="mr-2"
            aria-hidden
          >
            <path d="M18.244 2H21l-6.523 7.45L22 22h-6.828l-4.74-6.184L4.8 22H2.043l6.978-7.97L2 2h6.914l4.286 5.668L18.244 2zm-2.396 18.36h1.61L7.232 3.546H5.502L15.848 20.36z" />
          </svg>
          Continue with X
        </Button>
        <Button
          onClick={() => handleLogin("google")}
          disabled={!!busy}
          variant="outline"
          className="w-full"
          size={compact ? "default" : "lg"}
          data-testid="button-feed-signin-google"
        >
          <svg viewBox="0 0 48 48" width="16" height="16" className="mr-2" aria-hidden>
            <path
              fill="#FFC107"
              d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
            />
            <path
              fill="#FF3D00"
              d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
            />
            <path
              fill="#4CAF50"
              d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
            />
            <path
              fill="#1976D2"
              d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
            />
          </svg>
          Continue with Google
        </Button>
      </div>
      {!supabaseConfigured && (
        <p className="text-xs text-muted-foreground mt-4">
          Auth env vars aren't configured for this build, so the buttons sign you into a demo
          identity.
        </p>
      )}
    </div>
  );
}

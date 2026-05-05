import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = !!(url && key);

// Supabase requires a storage layer for PKCE auth. The deployed sandbox
// previously avoided localStorage entirely, but real OAuth needs it to verify
// the PKCE code_verifier on return from the provider. Using localStorage is
// the standard, browser-safe choice for SPA OAuth — tradeoff documented here:
// the auth tokens persist until explicit sign-out, which is the same surface
// area as any Supabase JS app.
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        flowType: "pkce",
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// Production hosts where the deployed app lives. If we're running on one of
// these, OAuth must come back to that exact origin — never localhost — even if
// the page was somehow loaded with a different effective origin (proxy, etc.).
const PRODUCTION_HOSTS = new Set([
  "annotatedextension.com",
  "www.annotatedextension.com",
]);
const CANONICAL_PRODUCTION_ORIGIN = "https://www.annotatedextension.com";

// Build the OAuth callback URL Supabase should redirect back to. We always
// prefer the current page's origin so local dev (localhost:5173, etc.) stays
// working. In production builds we additionally guard against the origin
// somehow resolving to localhost — that would dead-end users, since Supabase
// echoes whatever Site URL is configured if redirectTo isn't allow-listed.
export function getRedirectUrl(): string {
  const origin = window.location.origin;
  const host = window.location.hostname;

  if (PRODUCTION_HOSTS.has(host)) {
    return `${origin}/auth/callback`;
  }

  // If we somehow ended up on a localhost origin in a non-dev build, fall back
  // to the canonical production origin so users aren't dumped on a port that
  // isn't running. import.meta.env.DEV is true only for `vite dev`.
  const isDev = import.meta.env.DEV;
  if (!isDev && (host === "localhost" || host === "127.0.0.1")) {
    return `${CANONICAL_PRODUCTION_ORIGIN}/auth/callback`;
  }

  return `${origin}/auth/callback`;
}

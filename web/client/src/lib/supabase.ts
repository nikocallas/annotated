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

export function getRedirectUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

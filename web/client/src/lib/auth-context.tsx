import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { apiRequest } from "./queryClient";
import { supabase, supabaseConfigured, getRedirectUrl } from "./supabase";
import type { User } from "@shared/schema";

interface AuthValue {
  user: User | null;
  loading: boolean;
  loginWithProvider: (provider: "x" | "google") => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function exchangeSupabaseSession(): Promise<User | null> {
  const res = await apiRequest("POST", "/api/auth/supabase");
  if (!res.ok) return null;
  const data = (await res.json()) as { user: User };
  return data.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(supabaseConfigured);

  // Hydrate from any existing Supabase session on mount, and listen for changes
  // (e.g. token refresh, sign-out from another tab).
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      const token = data.session?.access_token;
      if (token) {
        const u = await exchangeSupabaseSession();
        if (!cancelled) setUser(u);
      }
      if (!cancelled) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        return;
      }
      const token = session?.access_token;
      if (!token) return;
      const u = await exchangeSupabaseSession();
      setUser(u);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loginWithProvider = useCallback(async (provider: "x" | "google") => {
    if (!supabase) {
      throw new Error("OAuth is not configured for this deployment");
    }
    // For X (OAuth 2.0) we request users.read so Supabase can read the user
    // profile. X/Twitter OAuth 2.0 does not expose email — that's why Supabase
    // returns "Error getting user email from external provider" if the X app
    // hasn't been set up to provide one. The auth-callback page surfaces a
    // helpful message when this happens.
    const scopes =
      provider === "x"
        ? "users.read tweet.read offline.access"
        : "openid email profile";
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getRedirectUrl(),
        scopes,
      },
    });
    if (error) throw error;
    // Browser is redirected away to the OAuth provider here; nothing else to do.
  }, []);

  const logout = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithProvider, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

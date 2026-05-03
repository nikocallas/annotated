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

async function exchangeSupabaseSession(accessToken: string): Promise<User | null> {
  const res = await apiRequest("POST", "/api/auth/supabase", { accessToken });
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
        const u = await exchangeSupabaseSession(token);
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
      const u = await exchangeSupabaseSession(token);
      setUser(u);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const loginWithProvider = useCallback(async (provider: "x" | "google") => {
    if (!supabase) {
      // Fallback: demo auth for local dev when Supabase env vars aren't set.
      const res = await apiRequest("POST", "/api/auth/demo", { provider });
      const data = (await res.json()) as { user: User };
      setUser(data.user);
      return;
    }
    const supabaseProvider = provider === "x" ? "twitter" : "google";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: supabaseProvider,
      options: { redirectTo: getRedirectUrl() },
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

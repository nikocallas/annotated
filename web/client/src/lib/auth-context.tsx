import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { apiRequest } from "./queryClient";
import type { User } from "@shared/schema";

interface AuthValue {
  user: User | null;
  loginWithProvider: (provider: "x" | "google") => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // In-memory only — sandboxed deploy disallows localStorage/cookies.
  const [user, setUser] = useState<User | null>(null);

  const loginWithProvider = useCallback(async (provider: "x" | "google") => {
    const res = await apiRequest("POST", "/api/auth/demo", { provider });
    const data = (await res.json()) as { user: User };
    setUser(data.user);
  }, []);

  const logout = useCallback(() => setUser(null), []);

  return (
    <AuthContext.Provider value={{ user, loginWithProvider, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

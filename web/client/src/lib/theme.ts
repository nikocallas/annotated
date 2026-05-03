import { useEffect, useState, useCallback } from "react";

export type Theme = "light" | "dark";
export type ThemePreference = Theme | "system";

const STORAGE_KEY = "annotated-theme";

function safeReadStored(): ThemePreference | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
    return null;
  } catch {
    return null;
  }
}

function safeWriteStored(value: ThemePreference) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage may be unavailable (e.g. in sandboxed iframes); ignore.
  }
}

function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(pref: ThemePreference): Theme {
  return pref === "system" ? systemTheme() : pref;
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

// Apply the saved preference (or system) before React mounts to avoid a flash
// of the wrong theme. Safe to call from a module-level import.
export function initThemeEarly() {
  if (typeof window === "undefined") return;
  const pref = safeReadStored() ?? "system";
  applyTheme(resolveTheme(pref));
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePreference>(() => safeReadStored() ?? "system");
  const [resolved, setResolved] = useState<Theme>(() => resolveTheme(safeReadStored() ?? "system"));

  useEffect(() => {
    const next = resolveTheme(pref);
    setResolved(next);
    applyTheme(next);
    safeWriteStored(pref);
  }, [pref]);

  // Track OS-level changes when the user has not pinned a preference.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (pref === "system") {
        const next = systemTheme();
        setResolved(next);
        applyTheme(next);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const toggle = useCallback(() => {
    // A click toggles between explicit light and dark. We intentionally drop
    // the "system" sentinel on first click so the user gets the theme they
    // just asked for; they can clear by calling setPref("system").
    setPref((current) => {
      const currentResolved = resolveTheme(current);
      return currentResolved === "dark" ? "light" : "dark";
    });
  }, []);

  return { theme: resolved, preference: pref, setPreference: setPref, toggle };
}

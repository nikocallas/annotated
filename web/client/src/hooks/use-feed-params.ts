import { useCallback, useSyncExternalStore } from "react";

/**
 * Feed filters (?type=, ?tag=, ?sort=, ?tab=) live in the real query string.
 * The app routes with wouter's hash location, whose navigate() writes any
 * "?…" part of a link to location.search and emits `hashchange`; this hook
 * subscribes to the same events so filter links and in-page controls agree.
 */
function subscribe(callback: () => void) {
  addEventListener("hashchange", callback);
  addEventListener("popstate", callback);
  return () => {
    removeEventListener("hashchange", callback);
    removeEventListener("popstate", callback);
  };
}

const getSearch = () => (typeof location === "undefined" ? "" : location.search);

export function useFeedParams() {
  const search = useSyncExternalStore(subscribe, getSearch, () => "");
  const params = new URLSearchParams(search);

  const update = useCallback(
    (changes: Record<string, string | null>, { replace = false }: { replace?: boolean } = {}) => {
      const url = new URL(location.href);
      for (const [key, value] of Object.entries(changes)) {
        if (value == null || value === "") url.searchParams.delete(key);
        else url.searchParams.set(key, value);
      }
      if (url.href === location.href) return;
      const oldURL = location.href;
      if (replace) history.replaceState(history.state, "", url.href);
      else history.pushState(history.state, "", url.href);
      dispatchEvent(new HashChangeEvent("hashchange", { oldURL, newURL: url.href }));
    },
    [],
  );

  return { params, update };
}

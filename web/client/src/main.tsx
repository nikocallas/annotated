import { createRoot } from "react-dom/client";
import App from "./App";
import LandingPage from "./pages/landing";
import PrivacyPage from "./pages/privacy";
import TermsPage from "./pages/tos";
import SupportPage from "./pages/support";
import ClaimsPage from "./pages/claims";
import DemoVideoPage from "./pages/demo-video";
import AuthCallbackPage from "./pages/auth-callback";
import { initThemeEarly } from "./lib/theme";
import "./index.css";

// Apply the saved/system theme before render so the page doesn't flash the
// wrong palette while React mounts.
initThemeEarly();

// The main app uses hash routing (it can be served from a sandboxed iframe
// without a backend rewrite). Several pages — landing, privacy, terms, and
// the OAuth callback — are reachable via path-based URLs. For those we
// render the page component directly instead of mounting the hash app.
const path = window.location.pathname;
const root = createRoot(document.getElementById("root")!);

// Path prefixes that should mount the React app (hash router) instead of the
// landing page. Vercel rewrites unknown paths to index.html, so e.g. /feed,
// /following, /a/123 all land here.
const APP_PATH_PREFIXES = ["/feed", "/following", "/login", "/install", "/u/", "/a/"];
const isAppPath = APP_PATH_PREFIXES.some(
  (p) => path === p || path === `${p}/` || path.startsWith(`${p}/`) || (p.endsWith("/") && path.startsWith(p))
);

if (path === "/privacy" || path === "/privacy/") {
  document.title = "Privacy Policy — Annotated";
  root.render(<PrivacyPage />);
} else if (path === "/tos" || path === "/tos/" || path === "/terms" || path === "/terms/") {
  document.title = "Terms of Service — Annotated";
  root.render(<TermsPage />);
} else if (path === "/support" || path === "/support/") {
  document.title = "Support — Annotated";
  root.render(<SupportPage />);
} else if (
  path === "/claims" ||
  path === "/claims/" ||
  path === "/claims/how-it-works" ||
  path === "/claims/how-it-works/"
) {
  document.title = "How claims work — Annotated";
  root.render(<ClaimsPage />);
} else if (
  path === "/demo" ||
  path === "/demo/" ||
  path === "/demo-video" ||
  path === "/demo-video/"
) {
  document.title = "Product Demo — Annotated";
  root.render(<DemoVideoPage />);
} else if (path === "/auth/callback" || path === "/auth/callback/") {
  document.title = "Signing in — Annotated";
  root.render(<AuthCallbackPage />);
} else if (isAppPath) {
  // Translate path-based app URLs (e.g. /feed, /following, /u/jcal) into the
  // hash route the app uses internally, then mount the app. We keep the
  // original path in the URL bar so /feed stays visible to the user.
  let hashTarget = path;
  if (path === "/feed" || path === "/feed/") hashTarget = "/";
  if (!window.location.hash) {
    window.history.replaceState(null, "", `${path}${window.location.search}#${hashTarget}`);
  }
  root.render(<App />);
} else if ((path === "/" || path === "") && !window.location.hash) {
  // Bare / → landing page. The app feed is at /feed (path) or /#/ (hash).
  document.title = "Annotated — Clip the exact moment. Add the missing context.";
  root.render(<LandingPage />);
} else {
  if (!window.location.hash) {
    window.location.hash = "#/";
  }
  root.render(<App />);
}

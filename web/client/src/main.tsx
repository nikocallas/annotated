import { createRoot } from "react-dom/client";
import App from "./App";
import PrivacyPage from "./pages/privacy";
import TermsPage from "./pages/tos";
import AuthCallbackPage from "./pages/auth-callback";
import "./index.css";

// The main app uses hash routing (it can be served from a sandboxed iframe
// without a backend rewrite). A few pages — privacy, terms, and the OAuth
// callback — need to be reachable directly via path-based URLs (e.g.
// https://annotatedextension.com/privacy). For those we render the page
// component directly instead of mounting the hash-routed app.
const path = window.location.pathname;
const root = createRoot(document.getElementById("root")!);

if (path === "/privacy" || path === "/privacy/") {
  document.title = "Privacy Policy — Annotated";
  root.render(<PrivacyPage />);
} else if (path === "/tos" || path === "/tos/" || path === "/terms" || path === "/terms/") {
  document.title = "Terms of Service — Annotated";
  root.render(<TermsPage />);
} else if (path === "/auth/callback" || path === "/auth/callback/") {
  document.title = "Signing in — Annotated";
  root.render(<AuthCallbackPage />);
} else {
  if (!window.location.hash) {
    window.location.hash = "#/";
  }
  root.render(<App />);
}

// Email delivery via Resend's REST API. Used by /api/support and the
// File-a-Claim flow. When RESEND_API_KEY is unset every send is a no-op that
// returns { ok: false, reason: "not_configured" }; callers decide whether
// that's a hard error (support form) or soft warning (claim flow continues
// regardless so the claim is still persisted).

const RESEND_API = "https://api.resend.com/emails";

export const SUPPORT_EMAIL = "support@annotatedextension.com";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  reason?: "not_configured" | "delivery_failed";
  status?: number;
  detail?: string;
}

function fromAddress() {
  // Production should set SUPPORT_FROM_EMAIL to a verified-domain sender like
  // "Annotated <support@annotatedextension.com>". The Resend sandbox sender
  // is a safe default for staging.
  return process.env.SUPPORT_FROM_EMAIL || "Annotated <onboarding@resend.dev>";
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, reason: "not_configured" };

  const to = Array.isArray(input.to) ? input.to : [input.to];
  if (to.length === 0) return { ok: false, reason: "delivery_failed", detail: "no recipient" };

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(),
        to,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[email] resend error", res.status, detail);
      return { ok: false, reason: "delivery_failed", status: res.status, detail };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] resend network error", err);
    return {
      ok: false,
      reason: "delivery_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function emailLayout(bodyHtml: string) {
  return `
<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#fafaf7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:#171513; line-height:1.5;">
    <div style="max-width:560px; margin:0 auto; padding:24px;">
      <div style="font-weight:700; letter-spacing:-0.02em; font-size:18px; color:#171513; margin-bottom:18px;">Annotated</div>
      <div style="background:#ffffff; border:1px solid #e3dccd; border-radius:12px; padding:24px;">
        ${bodyHtml}
      </div>
      <p style="font-size:12px; color:#6b6457; margin-top:18px; text-align:center;">
        Questions? Reach us at
        <a href="mailto:${SUPPORT_EMAIL}" style="color:#1f5f4a;">${SUPPORT_EMAIL}</a>.
        ·
        <a href="https://annotatedextension.com" style="color:#6b6457;">annotatedextension.com</a>
      </p>
    </div>
  </body>
</html>`.trim();
}

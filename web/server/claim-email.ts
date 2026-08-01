// Build + send the two notification emails for a filed claim:
//   1. Filer confirmation – "we received your claim and are reviewing it"
//   2. Post owner notice  – "someone filed a claim on your post"
// Both messages direct any questions to support@annotatedextension.com.
// The internal copy (CC to SUPPORT_TO_EMAIL) is sent when configured so the
// support team has visibility without depending on a separate ticket system.

import { createClient } from "@supabase/supabase-js";
import { sendEmail, escapeHtml, emailLayout, SUPPORT_EMAIL } from "./email";
import {
  CLAIM_REASON_LABELS,
  type Annotation,
  type Claim,
  type ClaimReasonCategory,
  type User,
} from "@shared/schema";

const SITE_URL = "https://annotatedextension.com";

function annotationLink(ann: Pick<Annotation, "id">) {
  return `${SITE_URL}/a/${encodeURIComponent(ann.id)}`;
}

function profileLink(user: Pick<User, "username">) {
  return `${SITE_URL}/u/${encodeURIComponent(user.username)}`;
}

function reasonLabel(category: string | null | undefined) {
  if (!category) return "Copyright / fair use concern";
  return (
    CLAIM_REASON_LABELS[category as ClaimReasonCategory] ??
    "Copyright / fair use concern"
  );
}

interface ResolvedPosterContact {
  email: string | null;
  source: "supabase_admin" | "missing_credentials" | "not_found" | "lookup_failed";
}

// Look up the post owner's email via Supabase admin. The poster's email
// isn't stored in our users table (auth is OAuth-only), but Supabase Auth
// keeps it on the auth.users record keyed by the same `auth_id`. Requires
// SUPABASE_SERVICE_ROLE_KEY to be set; without it, we skip the poster email.
export async function resolvePosterContact(
  poster: Pick<User, "authId" | "authProvider">,
): Promise<ResolvedPosterContact> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return { email: null, source: "missing_credentials" };
  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.auth.admin.getUserById(poster.authId);
    if (error || !data?.user) return { email: null, source: "not_found" };
    return { email: data.user.email ?? null, source: "supabase_admin" };
  } catch (err) {
    console.warn("[claim-email] poster lookup failed", err);
    return { email: null, source: "lookup_failed" };
  }
}

interface ClaimEmailContext {
  claim: Claim;
  annotation: Annotation;
  poster: User;
}

export function buildFilerEmail({ claim, annotation }: ClaimEmailContext) {
  const subject = `We received your claim — Annotated`;
  const reason = reasonLabel(claim.reasonCategory);
  const link = annotationLink(annotation);
  const sourceTitle = annotation.sourceTitle || annotation.sourceUrl;

  const text = [
    `Hi ${claim.claimantName || "there"},`,
    ``,
    `Thanks for filing a claim with Annotated. Your claim has been received and is now being reviewed.`,
    ``,
    `Reference details:`,
    `  • Claim ID: ${claim.id}`,
    `  • Filed at: ${new Date(claim.createdAt).toUTCString()}`,
    `  • Reason: ${reason}`,
    `  • Post: ${sourceTitle}`,
    `  • Source URL: ${annotation.sourceUrl}`,
    `  • Annotation page: ${link}`,
    ``,
    `What happens next: our team reviews each claim and will follow up at this email address. Most reviews complete within 72 hours.`,
    ``,
    `Questions or anything else to add? Reply to this email or write to ${SUPPORT_EMAIL}.`,
    ``,
    `— Annotated`,
  ].join("\n");

  const html = emailLayout(`
    <h2 style="margin:0 0 12px; font-size:20px; letter-spacing:-0.015em;">Claim received</h2>
    <p style="margin:0 0 12px;">Hi ${escapeHtml(claim.claimantName || "there")},</p>
    <p style="margin:0 0 12px;">
      Thanks for filing a claim with Annotated. Your claim has been received and is now being reviewed.
    </p>
    <table role="presentation" style="border-collapse:collapse; width:100%; margin:14px 0; font-size:14px;">
      <tr><td style="padding:6px 0; color:#6b6457; width:120px;">Claim ID</td><td style="padding:6px 0; font-family: ui-monospace, Menlo, monospace; font-size:12px;">${escapeHtml(claim.id)}</td></tr>
      <tr><td style="padding:6px 0; color:#6b6457;">Filed at</td><td style="padding:6px 0;">${escapeHtml(new Date(claim.createdAt).toUTCString())}</td></tr>
      <tr><td style="padding:6px 0; color:#6b6457;">Reason</td><td style="padding:6px 0;">${escapeHtml(reason)}</td></tr>
      <tr><td style="padding:6px 0; color:#6b6457;">Post</td><td style="padding:6px 0;">${escapeHtml(sourceTitle)}</td></tr>
      <tr><td style="padding:6px 0; color:#6b6457;">Source URL</td><td style="padding:6px 0; word-break:break-all;"><a href="${escapeHtml(annotation.sourceUrl)}" style="color:#1f5f4a;">${escapeHtml(annotation.sourceUrl)}</a></td></tr>
    </table>
    <p style="margin:0 0 12px;">
      <a href="${escapeHtml(link)}" style="display:inline-block; background:#171513; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none; font-weight:500;">View the annotation</a>
    </p>
    <p style="margin:14px 0 0; color:#6b6457; font-size:14px;">
      Our team reviews each claim and will follow up at this email address. Most reviews complete within 72 hours.
    </p>
    <p style="margin:14px 0 0; color:#6b6457; font-size:14px;">
      Questions or anything else to add? Reply to this email or write to
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#1f5f4a;">${SUPPORT_EMAIL}</a>.
    </p>
  `);

  return { subject, text, html };
}

export function buildPosterEmail({ claim, annotation, poster }: ClaimEmailContext) {
  const subject = `A claim was filed on your Annotated post`;
  const reason = reasonLabel(claim.reasonCategory);
  const annLink = annotationLink(annotation);
  const profileUrl = profileLink(poster);
  const sourceTitle = annotation.sourceTitle || annotation.sourceUrl;

  const text = [
    `Hi ${poster.displayName || poster.username},`,
    ``,
    `A copyright / fair-use claim has been filed on one of your annotations on Annotated. We are not making any judgement about the claim — we are notifying you so you can review your post and respond if you'd like.`,
    ``,
    `Post details:`,
    `  • Title: ${sourceTitle}`,
    `  • Source URL: ${annotation.sourceUrl}`,
    `  • Annotation page: ${annLink}`,
    `  • Reason given: ${reason}`,
    ...(claim.details ? [`  • Additional context: ${claim.details}`] : []),
    `  • Claim filed: ${new Date(claim.createdAt).toUTCString()}`,
    ``,
    `What you can do:`,
    `  1. Open the annotation and review the clip and commentary.`,
    `  2. If you'd like to take it down, sign in and remove the post from your profile (${profileUrl}).`,
    `  3. If you believe the claim is unfounded, you can ignore it; our team also reviews claims independently.`,
    ``,
    `Questions or want to share your side? Reply to this email or write to ${SUPPORT_EMAIL}.`,
    ``,
    `— Annotated`,
  ].join("\n");

  const html = emailLayout(`
    <h2 style="margin:0 0 12px; font-size:20px; letter-spacing:-0.015em;">A claim was filed on your post</h2>
    <p style="margin:0 0 12px;">Hi ${escapeHtml(poster.displayName || poster.username)},</p>
    <p style="margin:0 0 12px;">
      A copyright / fair-use claim has been filed on one of your annotations. We are <em>not</em> making
      any judgement about the claim — we are notifying you so you can review your post and respond
      if you'd like.
    </p>
    <table role="presentation" style="border-collapse:collapse; width:100%; margin:14px 0; font-size:14px;">
      <tr><td style="padding:6px 0; color:#6b6457; width:140px;">Post</td><td style="padding:6px 0;">${escapeHtml(sourceTitle)}</td></tr>
      <tr><td style="padding:6px 0; color:#6b6457;">Source URL</td><td style="padding:6px 0; word-break:break-all;"><a href="${escapeHtml(annotation.sourceUrl)}" style="color:#1f5f4a;">${escapeHtml(annotation.sourceUrl)}</a></td></tr>
      <tr><td style="padding:6px 0; color:#6b6457;">Reason given</td><td style="padding:6px 0;">${escapeHtml(reason)}</td></tr>
      ${
        claim.details
          ? `<tr><td style="padding:6px 0; color:#6b6457; vertical-align:top;">Additional context</td><td style="padding:6px 0; white-space:pre-wrap;">${escapeHtml(claim.details)}</td></tr>`
          : ""
      }
      <tr><td style="padding:6px 0; color:#6b6457;">Filed</td><td style="padding:6px 0;">${escapeHtml(new Date(claim.createdAt).toUTCString())}</td></tr>
    </table>
    <p style="margin:0 0 12px;">
      <a href="${escapeHtml(annLink)}" style="display:inline-block; background:#171513; color:#fff; padding:10px 16px; border-radius:8px; text-decoration:none; font-weight:500; margin-right:8px;">Review your annotation</a>
      <a href="${escapeHtml(profileUrl)}" style="display:inline-block; background:#fff; border:1px solid #e3dccd; color:#171513; padding:10px 16px; border-radius:8px; text-decoration:none; font-weight:500;">Open your profile</a>
    </p>
    <ul style="margin:14px 0 0; padding-left:18px; color:#6b6457; font-size:14px;">
      <li>If you'd like to take it down, you can remove the post from your profile.</li>
      <li>If you believe the claim is unfounded, you can ignore it; our team also reviews claims independently.</li>
    </ul>
    <p style="margin:14px 0 0; color:#6b6457; font-size:14px;">
      Questions or want to share your side? Reply to this email or write to
      <a href="mailto:${SUPPORT_EMAIL}" style="color:#1f5f4a;">${SUPPORT_EMAIL}</a>.
    </p>
  `);

  return { subject, text, html };
}

export function buildSupportEmail({ claim, annotation, poster }: ClaimEmailContext) {
  const subject = `[Annotated] New claim on @${poster.username}'s post`;
  const reason = reasonLabel(claim.reasonCategory);
  const annLink = annotationLink(annotation);

  const text = [
    `New claim filed on Annotated.`,
    ``,
    `Claim ID: ${claim.id}`,
    `Filed at: ${new Date(claim.createdAt).toUTCString()}`,
    ``,
    `Filer:`,
    `  Name: ${claim.claimantName}`,
    `  Email: ${claim.claimantEmail}`,
    `  Signed-in user id: ${claim.claimantUserId ?? "(anonymous)"}`,
    ``,
    `Post:`,
    `  Title: ${annotation.sourceTitle || annotation.sourceUrl}`,
    `  Source: ${annotation.sourceUrl}`,
    `  Annotation: ${annLink}`,
    `  Author: @${poster.username} (${poster.displayName})`,
    ``,
    `Reason: ${reason}`,
    claim.details ? `Details: ${claim.details}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = emailLayout(`
    <h2 style="margin:0 0 12px; font-size:18px;">New claim filed</h2>
    <pre style="white-space:pre-wrap; font-family: ui-monospace, Menlo, monospace; font-size:12px; background:#faf7ef; padding:12px; border-radius:8px; border:1px solid #e3dccd;">${escapeHtml(text)}</pre>
    <p style="margin:12px 0 0;"><a href="${escapeHtml(annLink)}" style="color:#1f5f4a;">Open the annotation</a></p>
  `);

  return { subject, text, html };
}

export interface ClaimEmailDispatchSummary {
  filer: { sent: boolean; reason?: string };
  poster: { sent: boolean; reason?: string };
  support: { sent: boolean; reason?: string };
}

export async function dispatchClaimEmails(ctx: ClaimEmailContext): Promise<ClaimEmailDispatchSummary> {
  const filerMsg = buildFilerEmail(ctx);
  const filerResult = await sendEmail({
    to: ctx.claim.claimantEmail,
    subject: filerMsg.subject,
    text: filerMsg.text,
    html: filerMsg.html,
    replyTo: SUPPORT_EMAIL,
  });

  const poster = await resolvePosterContact(ctx.poster);
  let posterResult: { ok: boolean; reason?: string } = { ok: false, reason: "no_email" };
  if (poster.email) {
    const posterMsg = buildPosterEmail(ctx);
    const r = await sendEmail({
      to: poster.email,
      subject: posterMsg.subject,
      text: posterMsg.text,
      html: posterMsg.html,
      replyTo: SUPPORT_EMAIL,
    });
    posterResult = { ok: r.ok, reason: r.reason };
  } else {
    posterResult = { ok: false, reason: poster.source };
  }

  // Internal heads-up to support — only when explicitly configured.
  const supportTo = process.env.SUPPORT_TO_EMAIL || SUPPORT_EMAIL;
  const supportMsg = buildSupportEmail(ctx);
  const supportResult = await sendEmail({
    to: supportTo,
    subject: supportMsg.subject,
    text: supportMsg.text,
    html: supportMsg.html,
    replyTo: ctx.claim.claimantEmail,
  });

  return {
    filer: { sent: filerResult.ok, reason: filerResult.reason },
    poster: { sent: posterResult.ok, reason: posterResult.reason },
    support: { sent: supportResult.ok, reason: supportResult.reason },
  };
}

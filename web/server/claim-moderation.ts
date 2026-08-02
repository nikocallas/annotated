import { createClient } from "@supabase/supabase-js";
import type { ClaimEmailDispatchSummary } from "./claim-email";
import type { Claim, User } from "@shared/schema";

export type ModerationStatus = "reviewing" | "resolved" | "rejected";

export interface ClaimModerationService {
  isModerator(user: User): boolean;
  recordNotifications(claimId: string, summary: ClaimEmailDispatchSummary): Promise<void>;
  listClaims(limit: number): Promise<unknown[]>;
  moderate(claimId: string, status: ModerationStatus, note: string, actor: User): Promise<Claim>;
}

export class ClaimModerationError extends Error {
  constructor(
    readonly statusCode: 400 | 403 | 404 | 503,
    message: string,
  ) {
    super(message);
    this.name = "ClaimModerationError";
  }
}

function moderatorIds(): Set<string> {
  return new Set(
    (process.env.MODERATOR_AUTH_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ClaimModerationError(503, "Claim moderation is not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function createClaimModerationService(): ClaimModerationService {
  return {
    isModerator(user) {
      return moderatorIds().has(user.authId);
    },
    async recordNotifications(claimId, summary) {
      const { error } = await adminClient().from("claim_events").insert({
        claim_id: claimId,
        event_type: "notifications_dispatched",
        metadata: summary,
      });
      if (error) throw new ClaimModerationError(503, "Unable to record claim notifications");
    },
    async listClaims(limit) {
      const client = adminClient();
      const { data: claims, error } = await client
        .from("claims")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(Math.min(200, Math.max(1, limit)));
      if (error) throw new ClaimModerationError(503, "Unable to load claims");
      const ids = (claims ?? []).map((claim: { id: string }) => claim.id);
      if (!ids.length) return [];
      const { data: events, error: eventError } = await client
        .from("claim_events")
        .select("*")
        .in("claim_id", ids)
        .order("created_at", { ascending: true });
      if (eventError) throw new ClaimModerationError(503, "Unable to load claim audit events");
      return (claims ?? []).map((claim: { id: string }) => ({
        ...claim,
        events: (events ?? []).filter((event: { claim_id: string }) => event.claim_id === claim.id),
      }));
    },
    async moderate(claimId, status, note, actor) {
      const { data, error } = await adminClient().rpc("moderate_claim", {
        target_claim_id: claimId,
        next_status: status,
        moderator_user_id: actor.id,
        moderation_note: note,
      });
      if (error) {
        if (/not found/i.test(error.message)) throw new ClaimModerationError(404, "Claim not found");
        throw new ClaimModerationError(503, "Unable to update claim");
      }
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new ClaimModerationError(404, "Claim not found");
      return {
        id: row.id,
        annotationId: row.annotation_id,
        claimantUserId: row.claimant_user_id,
        claimantName: row.claimant_name,
        claimantEmail: row.claimant_email,
        reasonCategory: row.reason_category,
        reason: row.reason,
        details: row.details,
        status: row.status,
        createdAt: Number(row.created_at),
      } as Claim;
    },
  };
}

export const claimModerationService = createClaimModerationService();

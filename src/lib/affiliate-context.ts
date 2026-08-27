import { getAdminClient } from "@/lib/admin-auth";
import { loadCommissionRateSchedule, type RateSubject } from "@/lib/affiliate-program";

// Resolved affiliate identity for a creator, used by the creator-facing
// affiliate endpoints. Mirrors how /api/admin/payments/calculate decides
// affiliate commission: enabled via the partner has_affiliate flag OR an active
// legacy (GoAffPro) row, with the rate/code sourced from the legacy row when
// present (e.g. 25%) else the partner rate (e.g. 10%).
export interface AffiliateContext {
  creatorId: string | null;
  influencerId: string | null;
  legacyAffiliateId: string | null;
  enabled: boolean;
  rate: number; // percent, in force for the CURRENT month
  /** Who the rate belongs to, so callers can resolve other months. */
  subject: RateSubject | null;
  /** The un-scheduled column value, used as the fallback for older months. */
  scalarRate: number;
  code: string | null;
  source: "legacy" | "partner" | null;
}

export async function resolveAffiliateContext(opts: {
  userId: string;
  creatorId?: string | null;
  isAdmin: boolean;
}): Promise<AffiliateContext | null> {
  const db = getAdminClient();

  // Admin viewing a specific creator may pass creator_id; creators resolve to
  // their own record by user_id.
  let creator: any = null;
  if (opts.creatorId && opts.isAdmin) {
    const { data } = await (db.from("creators") as any)
      .select("id, affiliate_code, commission_rate, invite_id")
      .eq("id", opts.creatorId)
      .single();
    creator = data;
  } else {
    const { data } = await (db.from("creators") as any)
      .select("id, affiliate_code, commission_rate, invite_id")
      .eq("user_id", opts.userId)
      .single();
    creator = data;
  }
  if (!creator) return null;

  let invite: any = null;
  if (creator.invite_id) {
    const { data } = await (db.from("creator_invites") as any)
      .select("has_affiliate, ad_spend_percentage, influencer_id")
      .eq("id", creator.invite_id)
      .single();
    invite = data;
  }

  // Active legacy row — by influencer_id first, then discount code. Never select
  // payment_* columns.
  let legacy: any = null;
  if (invite?.influencer_id) {
    const { data } = await (db.from("legacy_affiliates") as any)
      .select("id, discount_code, commission_rate")
      .eq("influencer_id", invite.influencer_id)
      .eq("status", "active")
      .maybeSingle();
    legacy = data || null;
  }
  if (!legacy && creator.affiliate_code) {
    const { data } = await (db.from("legacy_affiliates") as any)
      .select("id, discount_code, commission_rate")
      .ilike("discount_code", creator.affiliate_code)
      .eq("status", "active")
      .maybeSingle();
    legacy = data || null;
  }

  const enabled = !!invite?.has_affiliate || !!legacy;
  const scalarRate = legacy
    ? (legacy.commission_rate || 25)
    : (creator.commission_rate || invite?.ad_spend_percentage || 10);
  const code = legacy?.discount_code || creator.affiliate_code || null;
  const source = legacy ? "legacy" : (invite?.has_affiliate ? "partner" : null);

  const subject: RateSubject | null = legacy
    ? { legacyAffiliateId: legacy.id }
    : (creator.id ? { creatorId: creator.id } : null);

  // The scalar column is not the rate — it is only the rate until a scheduled
  // one supersedes it. Reading it directly would show a partner 25% on their
  // dashboard while payments ran at 10%.
  let rate = scalarRate;
  if (subject) {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    try {
      const schedule = await loadCommissionRateSchedule(db);
      rate = schedule.rateForMonth(subject, month, scalarRate);
    } catch {
      // Fall back to the scalar rather than failing the dashboard outright.
    }
  }

  return {
    creatorId: creator.id,
    influencerId: invite?.influencer_id || null,
    legacyAffiliateId: legacy?.id || null,
    enabled,
    rate,
    subject,
    scalarRate,
    code,
    source,
  };
}

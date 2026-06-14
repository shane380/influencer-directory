import { getAdminClient } from "@/lib/admin-auth";

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
  rate: number; // percent, e.g. 25
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
  const rate = legacy
    ? (legacy.commission_rate || 25)
    : (creator.commission_rate || invite?.ad_spend_percentage || 10);
  const code = legacy?.discount_code || creator.affiliate_code || null;
  const source = legacy ? "legacy" : (invite?.has_affiliate ? "partner" : null);

  return {
    creatorId: creator.id,
    influencerId: invite?.influencer_id || null,
    legacyAffiliateId: legacy?.id || null,
    enabled,
    rate,
    code,
    source,
  };
}

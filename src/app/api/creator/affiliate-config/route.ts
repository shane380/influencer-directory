import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/admin-auth";

// GET /api/creator/affiliate-config[?creator_id=...]
// Resolves a creator's affiliate status server-side. legacy_affiliates is
// service-role-only (RLS), so the browser client cannot read it — this route
// performs the lookup and returns just what the dashboard needs.
//
// Affiliate status mirrors /api/admin/payments/calculate: enabled when the
// partner invite has_affiliate flag is set OR an active legacy_affiliates row
// exists (matched by influencer_id, then discount_code). The commission rate +
// code are sourced from the legacy row when present (e.g. 25%), else the partner
// rate (e.g. 10%).
export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Mirror the dashboard's access rule: non-creator roles may view any creator
  // by id; creators only see their own record.
  const isAdmin = user.user_metadata?.role !== "creator";
  const urlCreatorId = request.nextUrl.searchParams.get("creator_id");

  const db = getAdminClient();

  let creator: any = null;
  if (urlCreatorId && isAdmin) {
    const { data } = await (db.from("creators") as any)
      .select("id, affiliate_code, commission_rate, invite_id")
      .eq("id", urlCreatorId)
      .single();
    creator = data;
  } else {
    const { data } = await (db.from("creators") as any)
      .select("id, affiliate_code, commission_rate, invite_id")
      .eq("user_id", user.id)
      .single();
    creator = data;
  }

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  let invite: any = null;
  if (creator.invite_id) {
    const { data } = await (db.from("creator_invites") as any)
      .select("has_affiliate, ad_spend_percentage, influencer_id")
      .eq("id", creator.invite_id)
      .single();
    invite = data;
  }

  // Look up an active legacy (GoAffPro) affiliate row — by influencer_id first,
  // then by discount code. Select only non-sensitive fields (never payment_*).
  let legacy: any = null;
  if (invite?.influencer_id) {
    const { data } = await (db.from("legacy_affiliates") as any)
      .select("discount_code, commission_rate")
      .eq("influencer_id", invite.influencer_id)
      .eq("status", "active")
      .maybeSingle();
    legacy = data || null;
  }
  if (!legacy && creator.affiliate_code) {
    const { data } = await (db.from("legacy_affiliates") as any)
      .select("discount_code, commission_rate")
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

  return NextResponse.json({ enabled, rate, code, source });
}

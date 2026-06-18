import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/admin-auth";
import { resolveAffiliateContext } from "@/lib/affiliate-context";

// GET /api/creator/payout-history[?creator_id=...]
// Payments the creator has ACTUALLY received, from the creator_payouts ledger
// (real transfers recorded by an admin). Deliberately does NOT show a balance —
// the earned side is still being trued up, so we only surface confirmed payments
// to avoid showing a creator a disputable number.
export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const isAdmin = user.user_metadata?.role !== "creator";
  const creatorId = request.nextUrl.searchParams.get("creator_id");

  const ctx = await resolveAffiliateContext({ userId: user.id, creatorId, isAdmin });
  if (!ctx || (!ctx.influencerId && !ctx.legacyAffiliateId)) {
    return NextResponse.json({ payments: [], totalPaid: 0 });
  }

  const db = getAdminClient();

  // Legacy payouts are keyed by legacy_affiliate_id, partner payouts by
  // influencer_id — match on either identity.
  const orFilters: string[] = [];
  if (ctx.influencerId) orFilters.push(`influencer_id.eq.${ctx.influencerId}`);
  if (ctx.legacyAffiliateId) orFilters.push(`legacy_affiliate_id.eq.${ctx.legacyAffiliateId}`);

  const { data: rows } = await (db.from("creator_payouts") as any)
    .select("amount, sent_at, method")
    .or(orFilters.join(","))
    .eq("is_test", false) // creators only ever see real payments
    .order("sent_at", { ascending: false });

  const payments = (rows || []).map((r: any) => ({
    amount: Number(r.amount) || 0,
    sent_at: r.sent_at,
    method: r.method || null,
  }));
  const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0);

  return NextResponse.json({
    payments,
    totalPaid: Math.round(totalPaid * 100) / 100,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/admin-auth";
import { resolveAffiliateContext } from "@/lib/affiliate-context";

// GET /api/creator/payout-history[?creator_id=...]
// Payment-centric history for the creator dashboard Account Info tab: what this
// creator has actually been PAID, plus anything currently owed but unpaid.
// Distinct from /affiliate-data (which is revenue-centric).
//
// Reads creator_payments across ALL payment types. Partner rows (ad spend,
// retainer, affiliate, paid collab) are keyed by influencer_id; legacy GoAffPro
// rows are keyed by legacy_affiliate_id — so we match on either identity.
export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const isAdmin = user.user_metadata?.role !== "creator";
  const creatorId = request.nextUrl.searchParams.get("creator_id");

  // Resolve identity (influencer_id + legacy_affiliate_id) regardless of whether
  // affiliate is "enabled" — ad-spend/retainer-only creators still have payouts.
  const ctx = await resolveAffiliateContext({ userId: user.id, creatorId, isAdmin });
  if (!ctx || (!ctx.influencerId && !ctx.legacyAffiliateId)) {
    return NextResponse.json({ paid: [], outstanding: [], totalPaid: 0 });
  }

  const db = getAdminClient();

  // Match rows by either identity. Legacy rows have a null influencer_id, so an
  // OR across both columns is required to capture the full picture.
  const orFilters: string[] = [];
  if (ctx.influencerId) orFilters.push(`influencer_id.eq.${ctx.influencerId}`);
  if (ctx.legacyAffiliateId) orFilters.push(`legacy_affiliate_id.eq.${ctx.legacyAffiliateId}`);

  const { data: rows } = await (db.from("creator_payments") as any)
    .select("month, payment_type, amount_owed, amount_paid, status, paid_at, payment_method")
    .or(orFilters.join(","))
    .order("month", { ascending: false });

  const paid: any[] = [];
  const outstanding: any[] = [];
  let totalPaid = 0;

  for (const r of rows || []) {
    if (r.status === "paid") {
      const amount = Number(r.amount_paid != null ? r.amount_paid : r.amount_owed) || 0;
      totalPaid += amount;
      paid.push({
        month: r.month,
        payment_type: r.payment_type,
        amount,
        paid_at: r.paid_at || null,
        payment_method: r.payment_method || null,
      });
    } else if (r.status !== "skipped") {
      // pending / approved — owed but not yet paid
      const owed = Number(r.amount_owed) || 0;
      if (owed > 0) {
        outstanding.push({
          month: r.month,
          payment_type: r.payment_type,
          amount: owed,
          status: r.status,
        });
      }
    }
  }

  return NextResponse.json({
    paid,
    outstanding,
    totalPaid: Math.round(totalPaid * 100) / 100,
  });
}

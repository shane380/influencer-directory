import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";

// GET /api/admin/payments/history?influencer_id=xxx  (or ?legacy_affiliate_id=xxx)
// All-time payout summary for one creator/legacy affiliate, grouped by month —
// powers the per-creator history modal on the payments page. Partner rows are
// keyed by influencer_id; legacy GoAffPro rows by legacy_affiliate_id.
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const influencerId = request.nextUrl.searchParams.get("influencer_id");
  const legacyAffiliateId = request.nextUrl.searchParams.get("legacy_affiliate_id");
  if (!influencerId && !legacyAffiliateId) {
    return NextResponse.json({ error: "influencer_id or legacy_affiliate_id required" }, { status: 400 });
  }

  const supabase = getAdminClient();

  let query = (supabase.from("creator_payments") as any)
    .select("month, payment_type, amount_owed, amount_paid, status, paid_at")
    .order("month", { ascending: false });
  if (influencerId) query = query.eq("influencer_id", influencerId);
  else query = query.eq("legacy_affiliate_id", legacyAffiliateId);

  const { data: rows } = await query;

  // Group by month: sum owed, sum paid, roll up statuses. The month's badge is
  // driven by the COMMISSION rows only — a still-pending refund clawback (a
  // negative credit) should not make an otherwise-paid month read "Pending". The
  // clawback is surfaced separately as `adjustment`.
  const byMonth: Record<string, {
    month: string;
    owed: number;
    paid: number;
    adjustment: number; // pending refund clawbacks (negative)
    types: string[];
    commissionStatuses: string[];
    paid_at: string | null;
  }> = {};

  for (const r of rows || []) {
    const m = r.month;
    if (!byMonth[m]) {
      byMonth[m] = { month: m, owed: 0, paid: 0, adjustment: 0, types: [], commissionStatuses: [], paid_at: null };
    }
    const g = byMonth[m];
    const isAdjustment = r.payment_type === "refund_adjustment";
    if (r.status !== "skipped") g.owed += Number(r.amount_owed || 0);
    if (r.status === "paid") g.paid += Number(r.amount_paid != null ? r.amount_paid : r.amount_owed || 0);
    if (isAdjustment && r.status === "pending") g.adjustment += Number(r.amount_owed || 0);
    if (!g.types.includes(r.payment_type)) g.types.push(r.payment_type);
    if (!isAdjustment && !g.commissionStatuses.includes(r.status)) g.commissionStatuses.push(r.status);
    if (r.paid_at && (!g.paid_at || r.paid_at > g.paid_at)) g.paid_at = r.paid_at;
  }

  const months = Object.values(byMonth).map((g) => {
    const s = g.commissionStatuses;
    return {
      month: g.month,
      owed: Math.round(g.owed * 100) / 100,
      paid: Math.round(g.paid * 100) / 100,
      adjustment: Math.round(g.adjustment * 100) / 100,
      types: g.types,
      paid_at: g.paid_at,
      // Badge from commission rows; paid if every commission row is paid/skipped.
      status: s.length === 0
        ? "pending"
        : s.every((x) => x === "paid" || x === "skipped")
        ? "paid"
        : s.includes("pending")
        ? "pending"
        : s.includes("approved")
        ? "approved"
        : s[0],
    };
  });

  const totalPaid = Math.round(months.reduce((s, m) => s + m.paid, 0) * 100) / 100;
  const totalOwed = Math.round(months.reduce((s, m) => s + m.owed, 0) * 100) / 100;

  return NextResponse.json({ months, totalPaid, totalOwed, totalOutstanding: Math.round((totalOwed - totalPaid) * 100) / 100 });
}

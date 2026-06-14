import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/admin-auth";
import { resolveAffiliateContext } from "@/lib/affiliate-context";
import { calculateAffiliateCommission } from "@/lib/affiliate";

export const maxDuration = 60;

// GET /api/creator/affiliate-data[?creator_id=...]
// Affiliate sales for the creator dashboard, hybrid for speed + accuracy:
//   - current month: one live Shopify scan (net-exact + per-order detail)
//   - prior 3 months: net-exact from creator_payments.calculation_details
//     (already computed by the payment cron), falling back to the gross-only
//     creator_code_revenue_daily aggregate when a month has no payment row.
export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const isAdmin = user.user_metadata?.role !== "creator";
  const creatorId = request.nextUrl.searchParams.get("creator_id");

  const ctx = await resolveAffiliateContext({ userId: user.id, creatorId, isAdmin });
  if (!ctx || !ctx.enabled || !ctx.code) {
    return NextResponse.json({ summary: null, orders: [], history: [] });
  }

  const rateDec = (ctx.rate || 10) / 100;
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Current month — net-exact from Shopify (same path the payment calc uses).
  let summary = {
    order_count: 0,
    total_gross: 0,
    total_refunds: 0,
    total_net: 0,
    commission_rate: rateDec,
    commission_owed: 0,
  };
  let orders: any[] = [];
  try {
    const res = await calculateAffiliateCommission(ctx.code, currentMonth, rateDec);
    summary = res.summary;
    orders = res.orders;
  } catch {
    // Leave zeros on failure; the dashboard still renders the section shell.
  }

  // Prior 3 months.
  const months: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  const db = getAdminClient();

  // Net-exact history from already-computed payment rows. Key/type depend on
  // whether this is a legacy or partner affiliate.
  const paidByMonth = new Map<string, any>();
  let paymentsQuery = (db.from("creator_payments") as any)
    .select("month, status, amount_owed, calculation_details")
    .in("month", months);
  if (ctx.legacyAffiliateId) {
    paymentsQuery = paymentsQuery
      .eq("legacy_affiliate_id", ctx.legacyAffiliateId)
      .eq("payment_type", "legacy_affiliate_commission");
  } else if (ctx.influencerId) {
    paymentsQuery = paymentsQuery
      .eq("influencer_id", ctx.influencerId)
      .eq("payment_type", "affiliate_commission");
  } else {
    paymentsQuery = null;
  }
  if (paymentsQuery) {
    const { data: pays } = await paymentsQuery;
    for (const p of pays || []) {
      // If a month somehow has more than one row, prefer a paid one.
      const prev = paidByMonth.get(p.month);
      if (!prev || (p.status === "paid" && prev.status !== "paid")) {
        paidByMonth.set(p.month, p);
      }
    }
  }

  // Gross fallback for months with no payment row.
  const oldestStart = `${months[months.length - 1]}-01`;
  const grossByMonth = new Map<string, { gross: number; orders: number }>();
  const { data: daily } = await (db.from("creator_code_revenue_daily") as any)
    .select("date, gross_amount, order_count")
    .ilike("affiliate_code", ctx.code)
    .gte("date", oldestStart);
  for (const row of daily || []) {
    const m = String(row.date).slice(0, 7);
    const acc = grossByMonth.get(m) || { gross: 0, orders: 0 };
    acc.gross += Number(row.gross_amount || 0);
    acc.orders += Number(row.order_count || 0);
    grossByMonth.set(m, acc);
  }

  const history = months.map((m) => {
    const pay = paidByMonth.get(m);
    if (pay) {
      const cd = pay.calculation_details || {};
      const gross = Number(cd.total_gross || 0);
      const net = Number(cd.total_net != null ? cd.total_net : gross);
      const owed = Number(cd.commission_owed != null ? cd.commission_owed : (pay.amount_owed || 0));
      return {
        month: m,
        net_exact: true,
        summary: {
          order_count: Number(cd.order_count || 0),
          total_gross: Math.round(gross * 100) / 100,
          total_net: Math.round(net * 100) / 100,
          commission_rate: rateDec,
          commission_owed: Math.round(owed * 100) / 100,
        },
      };
    }
    // Fallback: gross-based estimate from the daily aggregate.
    const acc = grossByMonth.get(m) || { gross: 0, orders: 0 };
    const gross = Math.round(acc.gross * 100) / 100;
    return {
      month: m,
      net_exact: false,
      summary: {
        order_count: acc.orders,
        total_gross: gross,
        total_net: gross,
        commission_rate: rateDec,
        commission_owed: Math.round(gross * rateDec * 100) / 100,
      },
    };
  });

  return NextResponse.json({ summary, orders, history });
}

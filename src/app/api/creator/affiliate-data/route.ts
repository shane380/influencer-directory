import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/admin-auth";
import { calculateAffiliateCommission } from "@/lib/affiliate";

export const maxDuration = 60;

// GET /api/creator/affiliate-data?code=X&rate=R
// Affiliate sales for the creator dashboard, hybrid for speed:
//   - current month: one live Shopify scan (net-exact + per-order detail)
//   - prior 3 months (history): from creator_code_revenue_daily (instant;
//     gross-based estimate — that table has no refunds/net or order detail)
// This avoids the old behaviour of scanning Shopify for 4 separate months.
export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get("code");
  const rateParam = request.nextUrl.searchParams.get("rate");
  if (!code) {
    return NextResponse.json({ error: "code required" }, { status: 400 });
  }
  const ratePct = rateParam ? parseFloat(rateParam) : 10;
  const rateDec = ratePct / 100;

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
    const res = await calculateAffiliateCommission(code, currentMonth, rateDec);
    summary = res.summary;
    orders = res.orders;
  } catch {
    // Leave zeros on failure; the dashboard still renders the section shell.
  }

  // Prior 3 months — from the pre-aggregated daily table (fast).
  const months: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const oldestStart = `${months[months.length - 1]}-01`;

  const db = getAdminClient();
  const { data: daily } = await (db.from("creator_code_revenue_daily") as any)
    .select("date, gross_amount, order_count")
    .ilike("affiliate_code", code)
    .gte("date", oldestStart);

  const byMonth = new Map<string, { gross: number; orders: number }>();
  for (const row of daily || []) {
    const m = String(row.date).slice(0, 7);
    const acc = byMonth.get(m) || { gross: 0, orders: 0 };
    acc.gross += Number(row.gross_amount || 0);
    acc.orders += Number(row.order_count || 0);
    byMonth.set(m, acc);
  }

  const history = months.map((m) => {
    const acc = byMonth.get(m) || { gross: 0, orders: 0 };
    const gross = Math.round(acc.gross * 100) / 100;
    return {
      month: m,
      summary: {
        order_count: acc.orders,
        total_gross: gross,
        // Aggregate table is gross-only (no refunds); net == gross estimate.
        total_net: gross,
        commission_rate: rateDec,
        commission_owed: Math.round(gross * rateDec * 100) / 100,
      },
    };
  });

  return NextResponse.json({ summary, orders, history });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { resolveWindow, previousWindow, buildDayList, buildMonthList, granularityFor } from "@/lib/partnerships/window";
import { fetchAllRows } from "@/lib/partnerships/paginate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function pct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const { start, end } = resolveWindow(params.get("start"), params.get("end"));
  const { prevStart, prevEnd } = previousWindow(start, end);
  const granularity = granularityFor(start, end);

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Every affiliate code — partner codes (creators) AND legacy/standalone
  // affiliate codes (legacy_affiliates), so totals reflect ALL affiliate revenue.
  const [{ data: creators }, { data: legacy }] = await Promise.all([
    (db.from("creators") as any).select("affiliate_code").not("affiliate_code", "is", null),
    (db.from("legacy_affiliates") as any)
      .select("discount_code")
      .eq("status", "active")
      .not("discount_code", "is", null),
  ]);
  const activeCodes = Array.from(
    new Set(
      [
        ...(creators || []).map((c: any) => String(c.affiliate_code || "").toUpperCase()),
        ...(legacy || []).map((l: any) => String(l.discount_code || "").toUpperCase()),
      ].filter(Boolean),
    ),
  );

  const emptyTotals = {
    revenue: 0, orders: 0, aov: 0,
    active_partners_with_sales: 0,
    growth_pct_vs_previous_period: null as number | null,
  };
  if (activeCodes.length === 0) {
    return NextResponse.json({ window: { start, end }, granularity, series: [], totals: emptyTotals });
  }

  // Daily revenue rows across current + previous window.
  const rows = await fetchAllRows((from, to) =>
    (db.from("creator_code_revenue_daily") as any)
      .select("affiliate_code, date, gross_amount, order_count")
      .in("affiliate_code", activeCodes)
      .gte("date", prevStart)
      .lte("date", end)
      .order("id", { ascending: true })
      .range(from, to),
  );

  type Row = { affiliate_code: string; date: string; gross_amount: number; order_count: number };
  const data: Row[] = ((rows as any[]) || []).map((r) => ({
    affiliate_code: String(r.affiliate_code).toUpperCase(),
    date: String(r.date).slice(0, 10),
    gross_amount: Number(r.gross_amount || 0),
    order_count: Number(r.order_count || 0),
  }));

  // Buckets for the series (daily or monthly depending on window length).
  const byDay = new Map<string, { revenue: number; orders: number }>();
  const byMonth = new Map<string, { revenue: number; orders: number }>();
  for (const r of data) {
    if (r.date < start || r.date > end) continue;
    const day = byDay.get(r.date) || { revenue: 0, orders: 0 };
    day.revenue += r.gross_amount;
    day.orders += r.order_count;
    byDay.set(r.date, day);
    const mk = r.date.slice(0, 7);
    const mo = byMonth.get(mk) || { revenue: 0, orders: 0 };
    mo.revenue += r.gross_amount;
    mo.orders += r.order_count;
    byMonth.set(mk, mo);
  }

  let series: Array<{ date: string; revenue: number; orders: number }>;
  if (granularity === "daily") {
    series = buildDayList(start, end).map((d) => {
      const v = byDay.get(d) || { revenue: 0, orders: 0 };
      return { date: d, revenue: Math.round(v.revenue * 100) / 100, orders: v.orders };
    });
  } else {
    series = buildMonthList(start, end).map((m) => {
      const v = byMonth.get(m) || { revenue: 0, orders: 0 };
      return { date: `${m}-01`, revenue: Math.round(v.revenue * 100) / 100, orders: v.orders };
    });
  }

  // Totals for current window + previous window (for growth).
  let curRevenue = 0, curOrders = 0, prevRevenue = 0;
  const codesWithSales = new Set<string>();
  for (const r of data) {
    if (r.date >= start && r.date <= end) {
      curRevenue += r.gross_amount;
      curOrders += r.order_count;
      if (r.order_count > 0) codesWithSales.add(r.affiliate_code);
    } else if (r.date >= prevStart && r.date <= prevEnd) {
      prevRevenue += r.gross_amount;
    }
  }

  return NextResponse.json({
    window: { start, end },
    granularity,
    series,
    totals: {
      revenue: Math.round(curRevenue * 100) / 100,
      orders: curOrders,
      aov: curOrders > 0 ? Math.round((curRevenue / curOrders) * 100) / 100 : 0,
      active_partners_with_sales: codesWithSales.size,
      growth_pct_vs_previous_period: pct(curRevenue, prevRevenue),
    },
  });
}

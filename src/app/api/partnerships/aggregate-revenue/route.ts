import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Range = "30d" | "90d" | "6m" | "12m";

function rangeLengthDays(r: Range): number {
  switch (r) {
    case "30d": return 30;
    case "90d": return 90;
    case "6m": return 180;
    case "12m": return 365;
  }
}

function dayOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

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

  const rangeParam = (request.nextUrl.searchParams.get("range") || "90d") as Range;
  if (!["30d", "90d", "6m", "12m"].includes(rangeParam)) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayDay = dayOnly(today);

  const lengthDays = rangeLengthDays(rangeParam);
  const rangeStart = new Date(today);
  rangeStart.setUTCDate(rangeStart.getUTCDate() - (lengthDays - 1));
  const rangeStartDay = dayOnly(rangeStart);

  const prevStart = new Date(rangeStart);
  prevStart.setUTCDate(prevStart.getUTCDate() - lengthDays);
  const prevStartDay = dayOnly(prevStart);

  const prevEnd = new Date(rangeStart);
  prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);
  const prevEndDay = dayOnly(prevEnd);

  // Current calendar month + previous calendar month boundaries
  const currentMonthStart = startOfMonth(today);
  const previousMonthStart = startOfMonth(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)),
  );
  const currentMonthStartDay = dayOnly(currentMonthStart);
  const previousMonthStartDay = dayOnly(previousMonthStart);

  // Same day-of-month into the previous month, for apples-to-apples MoM growth.
  // e.g. if today is May 24, compare May 1-24 vs April 1-24.
  const previousMonthMatchEnd = new Date(previousMonthStart);
  previousMonthMatchEnd.setUTCDate(today.getUTCDate());
  const monthDayOffset = today.getUTCDate();
  const previousMonthMatchEndDay = dayOnly(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, monthDayOffset)),
  );

  // Query window — wide enough to cover range + previous period + previous calendar month.
  const queryStartDay = [prevStartDay, previousMonthStartDay].sort()[0];

  // 1. Every affiliate code — partner codes (creators) AND legacy/standalone
  // affiliate codes (legacy_affiliates), so the totals reflect ALL affiliate
  // revenue regardless of partnership type.
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
  if (activeCodes.length === 0) {
    return NextResponse.json({
      range: rangeParam,
      series: [],
      totals: { revenue: 0, orders: 0, growth_pct_vs_previous_period: null },
      current_month: {
        revenue: 0, orders: 0, growth_pct_vs_last_month: null,
        aov: 0, active_partners_with_sales: 0,
      },
    });
  }

  // 2. Daily revenue rows for the full query window
  const { data: rows } = await (db.from("creator_code_revenue_daily") as any)
    .select("affiliate_code, date, gross_amount, order_count")
    .in("affiliate_code", activeCodes)
    .gte("date", queryStartDay)
    .lte("date", todayDay);

  type Row = { affiliate_code: string; date: string; gross_amount: number; order_count: number };
  const data: Row[] = (rows as any[] || []).map((r) => ({
    affiliate_code: String(r.affiliate_code),
    date: String(r.date).slice(0, 10),
    gross_amount: Number(r.gross_amount || 0),
    order_count: Number(r.order_count || 0),
  }));

  // 3. Build daily totals + monthly totals
  const byDay = new Map<string, { revenue: number; orders: number }>();
  const byMonth = new Map<string, { revenue: number; orders: number }>();
  for (const r of data) {
    const monthKey = r.date.slice(0, 7); // YYYY-MM
    const day = byDay.get(r.date) || { revenue: 0, orders: 0 };
    day.revenue += r.gross_amount;
    day.orders += r.order_count;
    byDay.set(r.date, day);
    const mo = byMonth.get(monthKey) || { revenue: 0, orders: 0 };
    mo.revenue += r.gross_amount;
    mo.orders += r.order_count;
    byMonth.set(monthKey, mo);
  }

  // 4. Series — daily for 30d/90d, monthly for 6m/12m
  let series: Array<{ date: string; revenue: number; orders: number }> = [];
  if (rangeParam === "30d" || rangeParam === "90d") {
    const days: string[] = [];
    const cur = new Date(rangeStart);
    while (cur <= today) {
      days.push(dayOnly(cur));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    series = days.map((d) => {
      const v = byDay.get(d) || { revenue: 0, orders: 0 };
      return {
        date: d,
        revenue: Math.round(v.revenue * 100) / 100,
        orders: v.orders,
      };
    });
  } else {
    // monthly buckets walking back from current month
    const monthCount = rangeParam === "6m" ? 6 : 12;
    const months: string[] = [];
    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
      months.push(dayOnly(d).slice(0, 7));
    }
    series = months.map((m) => {
      const v = byMonth.get(m) || { revenue: 0, orders: 0 };
      return {
        date: `${m}-01`,
        revenue: Math.round(v.revenue * 100) / 100,
        orders: v.orders,
      };
    });
  }

  // 5. Totals for current range + previous range
  let rangeRevenue = 0, rangeOrders = 0;
  let prevRevenue = 0, prevOrders = 0;
  for (const r of data) {
    if (r.date >= rangeStartDay && r.date <= todayDay) {
      rangeRevenue += r.gross_amount;
      rangeOrders += r.order_count;
    } else if (r.date >= prevStartDay && r.date <= prevEndDay) {
      prevRevenue += r.gross_amount;
      prevOrders += r.order_count;
    }
  }

  // 6. Current calendar month + previous calendar month (apples-to-apples through same DoM)
  let cmRevenue = 0, cmOrders = 0;
  let pmRevenue = 0, pmOrders = 0;
  const codesWithSalesThisMonth = new Set<string>();
  for (const r of data) {
    if (r.date >= currentMonthStartDay && r.date <= todayDay) {
      cmRevenue += r.gross_amount;
      cmOrders += r.order_count;
      if (r.order_count > 0) codesWithSalesThisMonth.add(r.affiliate_code);
    } else if (r.date >= previousMonthStartDay && r.date <= previousMonthMatchEndDay) {
      pmRevenue += r.gross_amount;
      pmOrders += r.order_count;
    }
  }

  return NextResponse.json({
    range: rangeParam,
    window: { start: rangeStartDay, end: todayDay },
    series,
    totals: {
      revenue: Math.round(rangeRevenue * 100) / 100,
      orders: rangeOrders,
      growth_pct_vs_previous_period: pct(rangeRevenue, prevRevenue),
    },
    current_month: {
      revenue: Math.round(cmRevenue * 100) / 100,
      orders: cmOrders,
      growth_pct_vs_last_month: pct(cmRevenue, pmRevenue),
      aov: cmOrders > 0 ? Math.round((cmRevenue / cmOrders) * 100) / 100 : 0,
      active_partners_with_sales: codesWithSalesThisMonth.size,
    },
  });
}

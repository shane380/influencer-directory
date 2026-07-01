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

  // Daily spend + purchase_value across current + previous window. Numerator and
  // denominator (ROAS) share the same daily table — no jsonb-blob mixing.
  const dailyRows = await fetchAllRows((from, to) =>
    (db.from("creator_ad_performance_daily") as any)
      .select("date, spend, purchase_value")
      .gte("date", prevStart)
      .lte("date", end)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const byDay = new Map<string, { spend: number; purchase_value: number }>();
  let curSpend = 0, curPurchaseValue = 0, prevSpend = 0;
  for (const row of (dailyRows as any[]) || []) {
    const d = String(row.date).slice(0, 10);
    const spend = Number(row.spend || 0);
    const pv = Number(row.purchase_value || 0);
    if (d >= start && d <= end) {
      curSpend += spend;
      curPurchaseValue += pv;
      const acc = byDay.get(d) || { spend: 0, purchase_value: 0 };
      acc.spend += spend;
      acc.purchase_value += pv;
      byDay.set(d, acc);
    } else if (d >= prevStart && d <= prevEnd) {
      prevSpend += spend;
    }
  }

  const byMonth = new Map<string, { spend: number; purchase_value: number }>();
  if (granularity === "monthly") {
    for (const [d, v] of byDay) {
      const mk = d.slice(0, 7);
      const mo = byMonth.get(mk) || { spend: 0, purchase_value: 0 };
      mo.spend += v.spend;
      mo.purchase_value += v.purchase_value;
      byMonth.set(mk, mo);
    }
  }

  let series: Array<{ date: string; spend: number; purchase_value: number }>;
  if (granularity === "daily") {
    series = buildDayList(start, end).map((d) => {
      const v = byDay.get(d) || { spend: 0, purchase_value: 0 };
      return { date: d, spend: Math.round(v.spend * 100) / 100, purchase_value: Math.round(v.purchase_value * 100) / 100 };
    });
  } else {
    series = buildMonthList(start, end).map((m) => {
      const v = byMonth.get(m) || { spend: 0, purchase_value: 0 };
      return { date: `${m}-01`, spend: Math.round(v.spend * 100) / 100, purchase_value: Math.round(v.purchase_value * 100) / 100 };
    });
  }

  const roas = curSpend > 0 ? Math.round((curPurchaseValue / curSpend) * 100) / 100 : null;

  // Ads live + whitelisted-partners are a live snapshot (not windowed) — count
  // ACTIVE ads across every creator's ads array on creator_ad_performance.
  const { data: perfRows } = await (db.from("creator_ad_performance") as any)
    .select("instagram_handle, ads");

  let adsLive = 0;
  let whitelistedPartnersCount = 0;
  for (const row of (perfRows as any[]) || []) {
    const ads = Array.isArray(row.ads) ? row.ads : [];
    const activeCount = ads.filter((a: any) => a?.effective_status === "ACTIVE").length;
    if (activeCount > 0) {
      adsLive += activeCount;
      whitelistedPartnersCount += 1;
    }
  }

  return NextResponse.json({
    window: { start, end },
    granularity,
    series,
    totals: {
      spend: Math.round(curSpend * 100) / 100,
      purchase_value: Math.round(curPurchaseValue * 100) / 100,
      roas,
      ads_live: adsLive,
      whitelisted_partners_count: whitelistedPartnersCount,
      growth_pct_vs_previous_period: pct(curSpend, prevSpend),
    },
  });
}

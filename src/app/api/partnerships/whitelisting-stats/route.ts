import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function dayOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export async function GET(_request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayDay = dayOnly(today);

  // Current calendar month range + apples-to-apples previous-month window (same DoM)
  const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const previousMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const previousMonthMatchEnd = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth() - 1,
    today.getUTCDate(),
  ));

  const currentMonthStartDay = dayOnly(currentMonthStart);
  const previousMonthStartDay = dayOnly(previousMonthStart);
  const previousMonthMatchEndDay = dayOnly(previousMonthMatchEnd);

  // Single query covering both windows — sum + roas come from the same daily table
  // so numerator and denominator share the same provenance (no jsonb-blob mixing).
  const { data: dailyRows } = await (db.from("creator_ad_performance_daily") as any)
    .select("date, spend, purchase_value")
    .gte("date", previousMonthStartDay)
    .lte("date", todayDay);

  let cmSpend = 0, cmPurchaseValue = 0;
  let pmSpend = 0;
  for (const row of (dailyRows as any[]) || []) {
    const d = String(row.date).slice(0, 10);
    const spend = Number(row.spend || 0);
    const pv = Number(row.purchase_value || 0);
    if (d >= currentMonthStartDay && d <= todayDay) {
      cmSpend += spend;
      cmPurchaseValue += pv;
    } else if (d >= previousMonthStartDay && d <= previousMonthMatchEndDay) {
      pmSpend += spend;
    }
  }

  const roas = cmSpend > 0 ? Math.round((cmPurchaseValue / cmSpend) * 100) / 100 : null;

  // Ads live + whitelisted_partners_count from the jsonb cache on creator_ad_performance.
  // Per spec: count ads where effective_status === 'ACTIVE' across every creator's ads
  // array, and count creators with at least one ACTIVE ad.
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
    ad_spend_mtd: Math.round(cmSpend * 100) / 100,
    ad_spend_growth_pct: pct(cmSpend, pmSpend),
    roas,
    ads_live: adsLive,
    whitelisted_partners_count: whitelistedPartnersCount,
    window: {
      current_month: { start: currentMonthStartDay, end: todayDay },
      previous_month_match: { start: previousMonthStartDay, end: previousMonthMatchEndDay },
    },
  });
}

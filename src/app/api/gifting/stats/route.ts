import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Range = "6m" | "12m";

function dayOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

// Gifting overview: counts of gift orders (is_gift = true) per month, plus the
// current-month total and month-over-month growth (apples-to-apples DoM window).
export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rangeParam = (request.nextUrl.searchParams.get("range") || "6m") as Range;
  if (!["6m", "12m"].includes(rangeParam)) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayDay = dayOnly(today);

  const monthCount = rangeParam === "6m" ? 6 : 12;

  // Earliest month bucket we need (1st of the month, monthCount-1 months back).
  const earliestMonthStart = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - (monthCount - 1), 1),
  );
  const earliestMonthStartDay = dayOnly(earliestMonthStart);

  // Previous calendar month boundaries for MoM growth (same day-of-month window).
  const currentMonthStartDay = dayOnly(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
  );
  const previousMonthStartDay = dayOnly(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)),
  );
  const previousMonthMatchEndDay = dayOnly(
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, today.getUTCDate())),
  );

  // Pull gift orders from the earliest month we chart through today.
  const { data: rows } = await (db.from("gift_orders") as any)
    .select("order_date")
    .eq("is_gift", true)
    .gte("order_date", earliestMonthStartDay)
    .lte("order_date", `${todayDay}T23:59:59.999Z`);

  const byMonth = new Map<string, number>();
  let giftsThisMonth = 0;
  let giftsPrevMonthMatch = 0;
  for (const r of (rows as any[]) || []) {
    const day = String(r.order_date).slice(0, 10);
    const monthKey = day.slice(0, 7); // YYYY-MM
    byMonth.set(monthKey, (byMonth.get(monthKey) || 0) + 1);
    if (day >= currentMonthStartDay && day <= todayDay) {
      giftsThisMonth++;
    } else if (day >= previousMonthStartDay && day <= previousMonthMatchEndDay) {
      giftsPrevMonthMatch++;
    }
  }

  // Tags = content posted (any medium) on a campaign influencer, attributed to
  // the campaign's start month. Aggregated across all mediums and campaigns.
  const { data: campaignRows } = await (db.from("campaigns") as any)
    .select("id, start_date")
    .gte("start_date", earliestMonthStartDay)
    .lte("start_date", `${todayDay}T23:59:59.999Z`);

  const campaignMonth = new Map<string, string>(); // campaign_id -> YYYY-MM
  const campaignIds: string[] = [];
  for (const c of (campaignRows as any[]) || []) {
    if (!c.start_date) continue;
    campaignMonth.set(c.id, String(c.start_date).slice(0, 7));
    campaignIds.push(c.id);
  }

  const currentMonthKey = currentMonthStartDay.slice(0, 7);
  const tagsByMonth = new Map<string, number>();
  let tagsThisMonth = 0;
  if (campaignIds.length > 0) {
    const { data: ciRows } = await (db.from("campaign_influencers") as any)
      .select("campaign_id, content_posted")
      .in("campaign_id", campaignIds)
      .neq("content_posted", "none");
    for (const ci of (ciRows as any[]) || []) {
      const m = campaignMonth.get(ci.campaign_id);
      if (!m) continue;
      tagsByMonth.set(m, (tagsByMonth.get(m) || 0) + 1);
      if (m === currentMonthKey) tagsThisMonth++;
    }
  }

  // Build the monthly series walking back from the current month.
  const months: string[] = [];
  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    months.push(dayOnly(d).slice(0, 7));
  }
  const series = months.map((m) => ({
    date: `${m}-01`,
    gifts: byMonth.get(m) || 0,
    tags: tagsByMonth.get(m) || 0,
  }));

  return NextResponse.json({
    range: rangeParam,
    series,
    gifts_this_month: giftsThisMonth,
    growth_pct_vs_last_month: pct(giftsThisMonth, giftsPrevMonthMatch),
    tags_this_month: tagsThisMonth,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type Period = "30d" | "90d" | "all";

function startDateFor(period: Period, allTimeFloor: Date): Date {
  if (period === "all") return allTimeFloor;
  const days = period === "30d" ? 30 : 90;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

function eachDay(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(from);
  while (cur <= to) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id: creatorId } = await params;
  const period = (request.nextUrl.searchParams.get("period") || "30d") as Period;
  if (!["30d", "90d", "all"].includes(period)) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Look up the creator -> invite -> influencer chain
  const { data: creator } = await (db.from("creators") as any)
    .select("id, affiliate_code, commission_rate, invite_id, onboarded_at")
    .eq("id", creatorId)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  let influencerHandle: string | null = null;
  let influencerId: string | null = null;
  if (creator.invite_id) {
    const { data: inv } = await (db.from("creator_invites") as any)
      .select("influencer_id")
      .eq("id", creator.invite_id)
      .single();
    if (inv?.influencer_id) {
      influencerId = inv.influencer_id;
      const { data: inf } = await db
        .from("influencers")
        .select("instagram_handle")
        .eq("id", inv.influencer_id)
        .single();
      influencerHandle = (inf as any)?.instagram_handle ?? null;
    }
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // Floor for "all time" = onboarding date, or 1 year ago as a reasonable bound
  // (creators predate signup, so this is just to cap query work)
  const partnershipFloor = creator.onboarded_at
    ? new Date(creator.onboarded_at)
    : new Date(today.getTime() - 365 * 86400000);
  const startDate = startDateFor(period, partnershipFloor);
  const startIso = startDate.toISOString();
  const startDay = startDate.toISOString().slice(0, 10);
  const todayIso = today.toISOString();
  const todayDay = today.toISOString().slice(0, 10);

  // ── Approved submissions in window (for scatter dots) ──
  const { data: approvedSubsRaw } = await (db.from("creator_content_submissions") as any)
    .select("id, files, reviewed_at, status")
    .eq("creator_id", creatorId)
    .eq("status", "approved")
    .gte("reviewed_at", startIso);

  const approvedSubmissions = (approvedSubsRaw || [])
    .filter((s: any) => s.reviewed_at)
    .map((s: any) => ({
      approved_at: s.reviewed_at,
      file_count: Array.isArray(s.files) ? s.files.length : 0,
    }));

  // ── Per-day ad spend from creator_ad_performance_daily ──
  // Sum across all ads for each date in window.
  const dailySpendByDate: Record<string, number> = {};
  if (influencerHandle) {
    const { data: dailyRows } = await (db.from("creator_ad_performance_daily") as any)
      .select("date, spend")
      .eq("instagram_handle", influencerHandle)
      .gte("date", startDay)
      .lte("date", todayDay);
    for (const row of (dailyRows as any[]) || []) {
      const d = String(row.date).slice(0, 10);
      dailySpendByDate[d] = (dailySpendByDate[d] || 0) + Number(row.spend || 0);
    }
  }

  // ── Per-day ads-live count from creator_ads_live_daily ──
  const adsLiveByDate: Record<string, number> = {};
  if (influencerHandle) {
    const { data: liveRows } = await (db.from("creator_ads_live_daily") as any)
      .select("date, count")
      .eq("instagram_handle", influencerHandle)
      .gte("date", startDay)
      .lte("date", todayDay);
    for (const row of (liveRows as any[]) || []) {
      adsLiveByDate[String(row.date).slice(0, 10)] = Number(row.count || 0);
    }
  }

  // ── Code revenue daily (from cached creator_code_revenue_daily) ──
  // Cache is refreshed daily by /api/cron/sync-code-revenue. No live Shopify
  // calls from this endpoint.
  const dailyRevenue: Record<string, number> = {};
  let codeOrderCount = 0;
  let codeRevenueTotal = 0;
  if (creator.affiliate_code) {
    const { data: revRows } = await (db.from("creator_code_revenue_daily") as any)
      .select("date, gross_amount, order_count")
      .eq("affiliate_code", creator.affiliate_code.toUpperCase())
      .gte("date", startDay)
      .lte("date", todayDay);
    for (const row of (revRows as any[]) || []) {
      const d = String(row.date).slice(0, 10);
      const gross = Number(row.gross_amount || 0);
      dailyRevenue[d] = (dailyRevenue[d] || 0) + gross;
      codeOrderCount += Number(row.order_count || 0);
      codeRevenueTotal += gross;
    }
  }

  const days = eachDay(startDate, today);
  const daily = days.map((day) => ({
    date: day,
    spend: Math.round((dailySpendByDate[day] || 0) * 100) / 100,
    revenue: Math.round((dailyRevenue[day] || 0) * 100) / 100,
    adsLive: adsLiveByDate[day] ?? null,
  }));

  const spendTotal = Object.values(dailySpendByDate).reduce((s, v) => s + v, 0);

  return NextResponse.json({
    period,
    range: { start: startIso, end: todayIso },
    daily,
    approvedSubmissions,
    spendTotal: Math.round(spendTotal * 100) / 100,
    codeRevenueTotal: Math.round(codeRevenueTotal * 100) / 100,
    codeOrderCount,
    adsLiveDataPoints: Object.keys(adsLiveByDate).length,
    notes: {
      influencerId,
      influencerHandle,
    },
  });
}

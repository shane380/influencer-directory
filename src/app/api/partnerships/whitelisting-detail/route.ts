import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { resolveWindow, buildDayList, buildMonthList, granularityFor } from "@/lib/partnerships/window";
import { loadProfiles, resolveCreatorIds } from "@/lib/partnerships/lookup";
import { fetchAllRows } from "@/lib/partnerships/paginate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Per-creator whitelisting detail for the "View more" page: a spend line per
// creator plus a table of ads-live, approved submissions, last submission, and
// windowed spend / outbound CTR / conversion value / ROAS. All from data already
// synced by the nightly Meta sync — no new Meta API calls.
export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const { start, end } = resolveWindow(params.get("start"), params.get("end"));
  const granularity = granularityFor(start, end);
  const buckets = granularity === "daily" ? buildDayList(start, end) : buildMonthList(start, end).map((m) => `${m}-01`);
  const bucketOf = (d: string) => (granularity === "daily" ? d : `${d.slice(0, 7)}-01`);

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  type Agg = {
    influencer_id: string | null;
    handle: string | null;
    spend: number;
    impressions: number;
    clicks: number;
    purchase_value: number;
    series: Map<string, number>;
  };
  const byKey = new Map<string, Agg>();
  const keyFor = (influencerId: string | null, handle: string | null) =>
    influencerId ? `inf:${influencerId}` : handle ? `h:${handle}` : null;
  const ensure = (influencerId: string | null, handle: string | null): Agg | null => {
    const key = keyFor(influencerId, handle);
    if (!key) return null;
    let agg = byKey.get(key);
    if (!agg) {
      agg = { influencer_id: influencerId, handle, spend: 0, impressions: 0, clicks: 0, purchase_value: 0, series: new Map() };
      byKey.set(key, agg);
    }
    return agg;
  };

  // 1. Daily ad rows in the window → per-creator totals + spend series.
  const rows = await fetchAllRows((from, to) =>
    (db.from("creator_ad_performance_daily") as any)
      .select("influencer_id, instagram_handle, date, spend, impressions, outbound_clicks, purchase_value")
      .gte("date", start)
      .lte("date", end)
      .order("id", { ascending: true })
      .range(from, to),
  );
  for (const row of (rows as any[]) || []) {
    const agg = ensure((row.influencer_id as string | null) || null, (row.instagram_handle as string | null) || null);
    if (!agg) continue;
    const spend = Number(row.spend || 0);
    const b = bucketOf(String(row.date).slice(0, 10));
    agg.spend += spend;
    agg.impressions += Number(row.impressions || 0);
    agg.clicks += Number(row.outbound_clicks || 0);
    agg.purchase_value += Number(row.purchase_value || 0);
    agg.series.set(b, (agg.series.get(b) || 0) + spend);
  }

  // 2. Ads live (live snapshot) — also pulls in creators with live ads but no
  //    spend in this window so they still appear in the table.
  const { data: perfRows } = await (db.from("creator_ad_performance") as any)
    .select("influencer_id, instagram_handle, ads");
  const adsLiveByKey = new Map<string, number>();
  for (const row of (perfRows as any[]) || []) {
    const ads = Array.isArray(row.ads) ? row.ads : [];
    const activeCount = ads.filter((a: any) => a?.effective_status === "ACTIVE").length;
    if (activeCount === 0) continue;
    const key = keyFor((row.influencer_id as string | null) || null, (row.instagram_handle as string | null) || null);
    if (!key) continue;
    adsLiveByKey.set(key, activeCount);
    ensure((row.influencer_id as string | null) || null, (row.instagram_handle as string | null) || null);
  }

  const entries = Array.from(byKey.entries());
  const influencerIds = Array.from(new Set(entries.map(([, a]) => a.influencer_id).filter(Boolean) as string[]));

  // 3. Approved-submission count + last submission date, keyed by influencer_id.
  const approvedByInfluencer = new Map<string, number>();
  const lastSubmissionByInfluencer = new Map<string, string>();
  if (influencerIds.length > 0) {
    const { data: subs } = await (db.from("creator_content_submissions") as any)
      .select("influencer_id, status, submitted_at")
      .in("influencer_id", influencerIds);
    for (const s of (subs as any[]) || []) {
      const infId = s.influencer_id ? String(s.influencer_id) : null;
      if (!infId) continue;
      if (s.status === "approved") approvedByInfluencer.set(infId, (approvedByInfluencer.get(infId) || 0) + 1);
      const at = s.submitted_at ? String(s.submitted_at) : null;
      if (at) {
        const prev = lastSubmissionByInfluencer.get(infId);
        if (!prev || at > prev) lastSubmissionByInfluencer.set(infId, at);
      }
    }
  }

  const [profiles, creatorByInfluencer] = await Promise.all([
    loadProfiles(db, influencerIds),
    resolveCreatorIds(db, influencerIds),
  ]);

  const creators = entries
    .map(([key, a]) => {
      const adsLive = adsLiveByKey.get(key) || 0;
      const inf = a.influencer_id ? profiles.get(a.influencer_id) : null;
      const seriesObj: Record<string, number> = {};
      for (const b of buckets) seriesObj[b] = Math.round((a.series.get(b) || 0) * 100) / 100;
      return {
        id: key,
        influencer_id: a.influencer_id,
        creator_id: a.influencer_id ? creatorByInfluencer.get(a.influencer_id) ?? null : null,
        name: inf?.name || a.handle || null,
        handle: inf?.handle || a.handle || null,
        photo: inf?.photo || null,
        spend: Math.round(a.spend * 100) / 100,
        outbound_ctr: a.impressions > 0 ? Math.round((a.clicks / a.impressions) * 10000) / 100 : 0,
        purchase_value: Math.round(a.purchase_value * 100) / 100,
        roas: a.spend > 0 ? Math.round((a.purchase_value / a.spend) * 100) / 100 : null,
        ads_live: adsLive,
        approved_submissions: a.influencer_id ? approvedByInfluencer.get(a.influencer_id) || 0 : 0,
        last_submission_at: a.influencer_id ? lastSubmissionByInfluencer.get(a.influencer_id) ?? null : null,
        series: seriesObj,
      };
    })
    .filter((c) => c.spend > 0 || c.ads_live > 0)
    .sort((a, b) => b.spend - a.spend);

  return NextResponse.json({ window: { start, end }, granularity, dates: buckets, creators });
}

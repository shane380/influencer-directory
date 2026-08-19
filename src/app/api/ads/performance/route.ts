import { NextRequest, NextResponse } from "next/server";
import { getAdsUser } from "@/lib/ads-guard";
import { getAdminClient } from "@/lib/admin-auth";
import { resolveWindow, previousWindow } from "@/lib/partnerships/window";
import { fetchAllRows } from "@/lib/partnerships/paginate";

export const maxDuration = 30;

// GET /api/ads/performance?start=YYYY-MM-DD&end=YYYY-MM-DD
//
// Everything the Ad Performance page needs, for the selected range AND the
// equivalent preceding range, in one payload — and with ZERO Meta API calls.
// The nightly sync already stored per-ad-per-day rows, so arbitrary ranges and
// period-over-period comparison are just SQL. Hitting Meta per page view would
// reintroduce exactly the rate limiting the sync refactor removed.
//
// The page sorts, filters, scopes and paginates this client-side: even a wide
// range is only a few hundred ads, so re-fetching per interaction would be
// slower and buy nothing.

type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  /**
   * False once any contributing ad-day had an unknown purchase count. Rows
   * backfilled from creator_ad_performance_daily carry NULL because that table
   * only ever stored purchase VALUE, never a count — so summing them would
   * understate the total and make CPA and AOV quietly wrong.
   */
  purchasesKnown: boolean;
  revenue: number;
};

function emptyTotals(): Totals {
  return { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchasesKnown: true, revenue: 0 };
}

/**
 * Derived metrics. Every rate is computed from SUMMED numerators and
 * denominators rather than by averaging per-day rates — an average-of-rates
 * silently weights a $2 day the same as a $2,000 one.
 */
function metrics(t: Totals) {
  return {
    spend: Math.round(t.spend * 100) / 100,
    impressions: t.impressions,
    clicks: t.clicks,
    // Null rather than a partial sum when any contributing day is unknown.
    purchases: t.purchasesKnown ? t.purchases : null,
    revenue: Math.round(t.revenue * 100) / 100,
    // Spend, impressions, clicks and revenue ARE complete in backfilled rows, so
    // ROAS and CTR stay trustworthy even where purchase counts are missing.
    roas: t.spend > 0 ? Math.round((t.revenue / t.spend) * 100) / 100 : null,
    ctr: t.impressions > 0 ? Math.round((t.clicks / t.impressions) * 10000) / 100 : null,
    cpa: t.purchasesKnown && t.purchases > 0 ? Math.round((t.spend / t.purchases) * 100) / 100 : null,
    aov: t.purchasesKnown && t.purchases > 0 ? Math.round((t.revenue / t.purchases) * 100) / 100 : null,
  };
}

export async function GET(request: NextRequest) {
  const user = await getAdsUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const { start, end } = resolveWindow(params.get("start"), params.get("end"));
  const { prevStart, prevEnd } = previousWindow(start, end);

  const db = getAdminClient();

  // How far back the fact table actually goes. The comparison window is
  // meaningless if it predates this — the page would be dividing a full period
  // by a partial one and reporting the shortfall as growth. Surfaced so the UI
  // can suppress deltas rather than fabricate them.
  const { data: earliestRow } = await (db.from("meta_ad_daily") as any)
    .select("date")
    .order("date", { ascending: true })
    .limit(1)
    .maybeSingle();
  const dataSince: string | null = earliestRow?.date ? String(earliestRow.date).slice(0, 10) : null;
  const comparisonComplete = !!dataSince && dataSince <= prevStart;

  // One scan covering both windows. meta_ad_daily has no surrogate id, so the
  // stable sort fetchAllRows needs is the composite key itself.
  const rows = await fetchAllRows((from, to) =>
    (db.from("meta_ad_daily") as any)
      .select("ad_id, date, spend, impressions, outbound_clicks, purchases, purchase_value")
      .gte("date", prevStart)
      .lte("date", end)
      .order("ad_id", { ascending: true })
      .order("date", { ascending: true })
      .range(from, to),
  );

  const current = new Map<string, Totals>();
  const previous = new Map<string, Totals>();
  // Purchase-count coverage for the selected range, measured by SPEND rather
  // than row count. All-or-nothing suppression is too brittle: a single stray
  // unknown ad-day would blank Purchases, CPA and AOV for a window that is
  // otherwise 99.9% covered, which is far less useful than a total understated
  // by a rounding error.
  let spendWithKnownPurchases = 0;
  let spendWithUnknownPurchases = 0;

  for (const r of (rows as any[]) || []) {
    const day = String(r.date).slice(0, 10);
    // A row can only belong to one window; previousWindow() ends the day before
    // `start`, so the two never overlap.
    const bucket = day >= start && day <= end ? current : day >= prevStart && day <= prevEnd ? previous : null;
    if (!bucket) continue;

    if (bucket === current) {
      const spend = Number(r.spend || 0);
      if (r.purchases === null || r.purchases === undefined) spendWithUnknownPurchases += spend;
      else spendWithKnownPurchases += spend;
    }

    const adId = String(r.ad_id);
    const t = bucket.get(adId) || emptyTotals();
    t.spend += Number(r.spend || 0);
    t.impressions += Number(r.impressions || 0);
    t.clicks += Number(r.outbound_clicks || 0);
    if (r.purchases === null || r.purchases === undefined) {
      t.purchasesKnown = false;
    } else {
      t.purchases += Number(r.purchases);
    }
    t.revenue += Number(r.purchase_value || 0);
    bucket.set(adId, t);
  }

  // Only ads that actually delivered in one of the two windows are worth
  // returning — the account holds thousands of dormant ads.
  const adIds = Array.from(new Set([...current.keys(), ...previous.keys()]));
  if (adIds.length === 0) {
    return NextResponse.json({
      range: { start, end },
      previous: { start: prevStart, end: prevEnd },
      data_since: dataSince,
      comparison_complete: comparisonComplete,
      purchases_complete: true,
      purchases_unknown_share: 0,
      ads: [],
      campaigns: [],
      creators: [],
    });
  }

  // Dimension lookup, chunked: a very wide range can exceed PostgREST's URL
  // limits with a single `in` list.
  const dims = new Map<string, any>();
  const CHUNK = 300;
  for (let i = 0; i < adIds.length; i += CHUNK) {
    const { data } = await (db.from("meta_ads") as any)
      .select(
        "ad_id, ad_name, campaign_name, adset_name, created_time, format, hook_line, " +
        "thumbnail_url, mux_playback_id, carousel_urls, partnership, instagram_handle, effective_status",
      )
      .in("ad_id", adIds.slice(i, i + CHUNK));
    for (const d of (data as any[]) || []) dims.set(String(d.ad_id), d);
  }

  const rangeSpend = spendWithKnownPurchases + spendWithUnknownPurchases;
  const unknownShare = rangeSpend > 0 ? spendWithUnknownPurchases / rangeSpend : 0;
  // Below 1% the totals are materially right and worth showing; above it the
  // shortfall is big enough to mislead.
  const purchasesComplete = unknownShare < 0.01;

  const endMs = new Date(`${end}T00:00:00Z`).getTime();

  const ads = adIds.map((adId) => {
    const dim = dims.get(adId) || {};
    const cur = current.get(adId);
    const prev = previous.get(adId);

    const createdTime = dim.created_time || null;
    const daysLive = createdTime
      ? Math.max(0, Math.floor((endMs - new Date(createdTime).getTime()) / 86400000))
      : null;

    return {
      ad_id: adId,
      name: dim.ad_name || null,
      campaign: dim.campaign_name || null,
      adset: dim.adset_name || null,
      status: dim.effective_status || null,
      format: dim.format || null,
      hook: dim.hook_line || null,
      thumbnail_url: dim.thumbnail_url || null,
      // Presence of playable media, so the page can show a play affordance
      // without resolving the player until the ad is actually clicked.
      has_video: !!dim.mux_playback_id,
      has_carousel: Array.isArray(dim.carousel_urls) && dim.carousel_urls.length > 0,
      partnership: !!dim.partnership,
      handle: dim.instagram_handle || null,
      created_time: createdTime,
      days_live: daysLive,
      ...metrics(cur || emptyTotals()),
      // NULL, not zeroes. An ad with no prior-period row must render "New"
      // rather than a fabricated -100%; zero-filling here would make that
      // distinction impossible downstream.
      prev: prev ? metrics(prev) : null,
      // Whether the ad delivered in THIS window. Needed because an ad can be
      // present solely because it ran in the previous one.
      in_range: !!cur,
    };
  });

  const campaigns = Array.from(
    new Set(ads.map((a) => a.campaign).filter(Boolean) as string[]),
  ).sort();
  const creators = Array.from(
    new Set(ads.filter((a) => a.partnership).map((a) => a.handle).filter(Boolean) as string[]),
  ).sort();

  return NextResponse.json({
    range: { start, end },
    previous: { start: prevStart, end: prevEnd },
    data_since: dataSince,
    comparison_complete: comparisonComplete,
    purchases_complete: purchasesComplete,
    // Exact share so the page can distinguish "complete" from "close enough".
    purchases_unknown_share: Math.round(unknownShare * 10000) / 10000,
    ads,
    campaigns,
    creators,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/admin-auth";
import { resolveAffiliateContext } from "@/lib/affiliate-context";
import { resolveWindow } from "@/lib/partnerships/window";
import { loadProfiles } from "@/lib/partnerships/lookup";
import { fetchAllRows } from "@/lib/partnerships/paginate";

export const maxDuration = 30;

// GET /api/creator/top-ads?start&end[&limit][&creator_id]
//
// The community "what's working" grid for whitelisters, plus the viewer's own
// ads with the same metrics, in one daily-table scan. Privacy is enforced HERE:
// other creators' cards carry only the three rates and a spend TIER — never
// dollar spend, impressions, or raw counts. The viewer's own cards get full
// numbers. Requires an ad-spend deal (has_ad_spend) on the viewer's invite.

const MAX_WINDOW_DAYS = 92;

type AdAgg = {
  ad_id: string;
  handle: string | null;
  influencer_id: string | null;
  spend: number;
  impressions: number;
  outbound_clicks: number;
  video_3s_views: number;
  video_thruplays: number;
};

function rate1(numer: number, denom: number): number | null {
  if (denom <= 0) return null;
  return Math.round((numer / denom) * 1000) / 10;
}

function spendTier(windowSpend: number): "strong" | "scaling" | "testing" {
  if (windowSpend > 2000) return "strong";
  if (windowSpend > 500) return "scaling";
  return "testing";
}

function metricsFor(a: AdAgg) {
  return {
    ctr: rate1(a.outbound_clicks, a.impressions),
    hook_rate: rate1(a.video_3s_views, a.impressions),
    hold_rate: rate1(a.video_thruplays, a.video_3s_views),
  };
}

export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const isAdmin = user.user_metadata?.role !== "creator";
  const params = request.nextUrl.searchParams;
  const limit = Math.max(1, Math.min(parseInt(params.get("limit") || "12", 10), 24));
  const creatorIdParam = params.get("creator_id");

  const ctx = await resolveAffiliateContext({ userId: user.id, creatorId: creatorIdParam, isAdmin });
  if (!ctx) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const db = getAdminClient();

  let hasAdSpend = false;
  if (ctx.creatorId) {
    const { data: creator } = await (db.from("creators") as any)
      .select("invite_id")
      .eq("id", ctx.creatorId)
      .single();
    if (creator?.invite_id) {
      const { data: inv } = await (db.from("creator_invites") as any)
        .select("has_ad_spend")
        .eq("id", creator.invite_id)
        .single();
      hasAdSpend = !!inv?.has_ad_spend;
    }
  }
  if (!hasAdSpend) {
    return NextResponse.json({ error: "not_entitled" }, { status: 403 });
  }

  let { start, end } = resolveWindow(params.get("start"), params.get("end"));
  {
    const s = new Date(`${start}T00:00:00Z`);
    const e = new Date(`${end}T00:00:00Z`);
    const span = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    if (span > MAX_WINDOW_DAYS) {
      const clamped = new Date(e);
      clamped.setUTCDate(e.getUTCDate() - (MAX_WINDOW_DAYS - 1));
      start = clamped.toISOString().slice(0, 10);
    }
  }
  // Viewer's handle (for own-ads matching when daily rows are unlinked).
  let viewerHandle: string | null = null;
  if (ctx.influencerId) {
    const { data: inf } = await (db.from("influencers") as any)
      .select("instagram_handle")
      .eq("id", ctx.influencerId)
      .single();
    viewerHandle = inf?.instagram_handle || null;
  }

  // One scan of the daily table for the window, aggregated per ad.
  const rows = await fetchAllRows((from, to) =>
    (db.from("creator_ad_performance_daily") as any)
      .select("instagram_handle, influencer_id, ad_id, spend, impressions, outbound_clicks, video_3s_views, video_thruplays")
      .gte("date", start)
      .lte("date", end)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const byAd = new Map<string, AdAgg>();
  for (const row of (rows as any[]) || []) {
    const adId = row.ad_id ? String(row.ad_id) : null;
    if (!adId) continue;
    const agg = byAd.get(adId) || {
      ad_id: adId,
      handle: row.instagram_handle || null,
      influencer_id: row.influencer_id || null,
      spend: 0,
      impressions: 0,
      outbound_clicks: 0,
      video_3s_views: 0,
      video_thruplays: 0,
    };
    agg.spend += Number(row.spend || 0);
    agg.impressions += Number(row.impressions || 0);
    agg.outbound_clicks += Number(row.outbound_clicks || 0);
    agg.video_3s_views += Number(row.video_3s_views || 0);
    agg.video_thruplays += Number(row.video_thruplays || 0);
    byAd.set(adId, agg);
  }

  const isViewerAd = (a: { influencer_id: string | null; handle: string | null }) =>
    (!!ctx.influencerId && a.influencer_id === ctx.influencerId) ||
    (!!viewerHandle && a.handle === viewerHandle);

  // Gallery metadata (name/status/preview) for every handle in play + the viewer.
  const ranked = Array.from(byAd.values()).sort((a, b) => b.spend - a.spend);
  const handles = new Set<string>();
  for (const a of ranked) if (a.handle) handles.add(a.handle);
  if (viewerHandle) handles.add(viewerHandle);

  type GalleryAd = {
    id: string;
    name: string | null;
    effective_status: string | null;
    thumbnailUrl: string | null;
    mux_playback_id: string | null;
    previewHtml: string | null;
    carousel_urls: string[] | null;
  };
  const galleryByAdId = new Map<string, GalleryAd>();
  const viewerGallery: GalleryAd[] = [];
  if (handles.size > 0) {
    const { data: galleries } = await (db.from("creator_ad_performance") as any)
      .select("instagram_handle, influencer_id, ads")
      .in("instagram_handle", Array.from(handles));
    for (const g of (galleries as any[]) || []) {
      for (const ad of (g.ads as any[]) || []) {
        if (!ad?.id) continue;
        const entry: GalleryAd = {
          id: String(ad.id),
          name: ad.name || null,
          effective_status: ad.effective_status || ad.status || null,
          thumbnailUrl: ad.thumbnailUrl || null,
          mux_playback_id: ad.mux_playback_id || null,
          previewHtml: ad.previewHtml || null,
          carousel_urls: Array.isArray(ad.carousel_urls) && ad.carousel_urls.length > 0 ? ad.carousel_urls : null,
        };
        galleryByAdId.set(entry.id, entry);
        if (isViewerAd({ influencer_id: g.influencer_id || null, handle: g.instagram_handle || null })) {
          viewerGallery.push(entry);
        }
      }
    }
  }

  // Walk down the spend ranking, keeping only ads we can actually render
  // (deleted/never-galleried ads make ugly cards).
  const topAggs: AdAgg[] = [];
  for (const a of ranked) {
    if (a.spend <= 0) break;
    if (!galleryByAdId.has(a.ad_id)) continue;
    topAggs.push(a);
    if (topAggs.length >= limit) break;
  }

  const influencerIds = Array.from(
    new Set(topAggs.map((a) => a.influencer_id).filter(Boolean) as string[]),
  );
  const profiles = await loadProfiles(db, influencerIds);

  const top_ads = topAggs.map((a) => {
    const gallery = galleryByAdId.get(a.ad_id)!;
    const inf = a.influencer_id ? profiles.get(a.influencer_id) : null;
    const mine = isViewerAd(a);
    const card: any = {
      ad_id: a.ad_id,
      name: gallery.name,
      creator: {
        name: inf?.name || null,
        handle: inf?.handle || a.handle || null,
        photo: inf?.photo || null,
      },
      mux_playback_id: gallery.mux_playback_id,
      previewHtml: gallery.previewHtml,
      carousel_urls: gallery.carousel_urls,
      thumbnail_url: gallery.thumbnailUrl,
      status: gallery.effective_status,
      metrics: metricsFor(a),
      spend_tier: spendTier(a.spend),
      is_viewer: mine,
    };
    if (mine) card.spend = Math.round(a.spend * 100) / 100;
    return card;
  });

  // The viewer's own ads: everything with spend in the window, plus still-ACTIVE
  // galleried ads that haven't spent yet (so "live ads" never vanish).
  const ownAggs = ranked.filter(isViewerAd);
  const ownAggIds = new Set(ownAggs.map((a) => a.ad_id));
  const own_ads = [
    ...ownAggs.map((a) => {
      const gallery = galleryByAdId.get(a.ad_id);
      return {
        ad_id: a.ad_id,
        name: gallery?.name || null,
        mux_playback_id: gallery?.mux_playback_id || null,
        previewHtml: gallery?.previewHtml || null,
        carousel_urls: gallery?.carousel_urls || null,
        thumbnail_url: gallery?.thumbnailUrl || null,
        status: gallery?.effective_status || null,
        metrics: {
          ...metricsFor(a),
          spend: Math.round(a.spend * 100) / 100,
          impressions: a.impressions,
        },
        spend_tier: spendTier(a.spend),
      };
    }),
    ...viewerGallery
      .filter((g) => g.effective_status === "ACTIVE" && !ownAggIds.has(g.id))
      .map((g) => ({
        ad_id: g.id,
        name: g.name,
        mux_playback_id: g.mux_playback_id,
        previewHtml: g.previewHtml,
        carousel_urls: g.carousel_urls,
        thumbnail_url: g.thumbnailUrl,
        status: g.effective_status,
        metrics: { ctr: null, hook_rate: null, hold_rate: null, spend: 0, impressions: 0 },
        spend_tier: "testing" as const,
      })),
  ];

  // Benchmarks for the coaching row: viewer's window totals vs the top-ads pool,
  // both computed from summed numerators/denominators (weighted, not avg-of-rates).
  const sumAggs = (list: AdAgg[]): AdAgg => {
    const s: AdAgg = { ad_id: "", handle: null, influencer_id: null, spend: 0, impressions: 0, outbound_clicks: 0, video_3s_views: 0, video_thruplays: 0 };
    for (const a of list) {
      s.spend += a.spend;
      s.impressions += a.impressions;
      s.outbound_clicks += a.outbound_clicks;
      s.video_3s_views += a.video_3s_views;
      s.video_thruplays += a.video_thruplays;
    }
    return s;
  };
  const benchmarks = {
    viewer: metricsFor(sumAggs(ownAggs)),
    top_ads_avg: metricsFor(sumAggs(topAggs)),
  };

  return NextResponse.json({
    window: { start, end },
    top_ads,
    own_ads,
    benchmarks,
  });
}

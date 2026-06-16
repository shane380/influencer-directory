import { createClient } from "@supabase/supabase-js";
import { r2Client, R2_BUCKET, getPublicUrl } from "./r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import mux from "./mux";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const META_API_VERSION = "v19.0";
const MAX_CALLS_PER_HOUR = 400;

// In-memory call counter for a single invocation
let callCount = 0;
let callCountResetAt = Date.now() + 3600_000;

function checkRateLimit() {
  if (Date.now() > callCountResetAt) {
    callCount = 0;
    callCountResetAt = Date.now() + 3600_000;
  }
  if (callCount >= MAX_CALLS_PER_HOUR) {
    throw new Error("Rate limit reached: exceeded 200 Meta API calls this hour");
  }
}

async function metaFetch(url: string, retries = 3): Promise<any> {
  checkRateLimit();
  callCount++;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url);

    if (res.status === 429 && attempt < retries) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.warn(`[meta-sync] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    const data = await res.json();

    if (data.error?.code === 4 && attempt < retries) {
      // Meta "too many calls" error code
      const delay = Math.pow(2, attempt) * 1000;
      console.warn(`[meta-sync] Meta error code 4, retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    return data;
  }
}

/**
 * Download an image from a URL and upload it to R2.
 * Returns the public R2 URL, or null if anything fails.
 */
async function mirrorImageToR2(
  imageUrl: string,
  r2Key: string
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: r2Key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    return getPublicUrl(r2Key);
  } catch (err) {
    console.warn(`[meta-sync] Failed to mirror image to R2 (${r2Key}):`, err);
    return null;
  }
}

/**
 * Pick the best available image URL from a Meta ad creative.
 * Priority: video cover > full-res static > thumbnail fallback.
 */
function getBestImageUrl(ad: any): string | null {
  return (
    ad.creative?.object_story_spec?.video_data?.image_url ||
    ad.creative?.image_url ||
    ad.creative?.thumbnail_url ||
    null
  );
}

interface AdResult {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  adset_name: string | null;
  spend: string;
  impressions: string;
  outbound_clicks: number;
  outbound_clicks_ctr: number;
  purchase_value: number;
  purchase_roas: number | null;
  thumbnailUrl: string | null;
  video_id: string | null;
  mux_playback_id: string | null;
}

interface DailyAdRow {
  ad_id: string;
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  outbound_clicks: number;
  purchase_value: number;
  purchase_roas: number | null;
}

interface SyncResult {
  ads: AdResult[];
  // Lifetime totals come from a single account-level summary call (no per-ad
  // expansion). null means that call failed and the caller should preserve the
  // previously-stored totals. monthly / MTD are NOT here — the caller derives them
  // from the full daily table after the fresh daily rows are upserted.
  totals: { spend: number; impressions: number; purchase_value: number } | null;
  daily: DailyAdRow[];
  adsLiveCount: number;
  // Set when the ads-list/gallery request failed but the lighter daily insights
  // call still succeeded. A partial sync: payment-critical daily data is fresh,
  // but the ad gallery could not be refreshed.
  adsListError: string | null;
}

// Meta returns action_values / outbound_clicks / purchase_roas as arrays of
// {action_type, value}. These helpers extract the numeric we care about.
function sumActionValue(arr: any[] | undefined, actionType?: string): number {
  if (!Array.isArray(arr)) return 0;
  let total = 0;
  for (const row of arr) {
    if (!row) continue;
    if (actionType && row.action_type !== actionType) continue;
    total += parseFloat(row.value || "0");
  }
  return total;
}

function pickActionValue(arr: any[] | undefined, actionType: string): number | null {
  if (!Array.isArray(arr)) return null;
  for (const row of arr) {
    if (row?.action_type === actionType) {
      const v = parseFloat(row.value || "0");
      return isFinite(v) ? v : null;
    }
  }
  return null;
}

async function fetchAdsForHandle(
  handle: string,
  accessToken: string,
  actId: string,
  influencerId: string | null
): Promise<SyncResult> {
  const filtering = JSON.stringify([
    { field: "name", operator: "CONTAIN", value: handle },
  ]);

  // Creative/status only — NO per-ad insights expansion. The lifetime per-ad
  // insights (insights.date_preset(maximum)) was the heavy part that tripped Meta's
  // "reduce the amount of data" limit on large accounts. Per-ad spend/impressions/
  // ROAS/CTR are now rebuilt from the stored daily table by the caller.
  // adset{id,name} — including `id` alongside `name` avoids Meta's URL parser
  // mistaking single-subfield `adset{name}` for brace value-substitution syntax.
  const fields =
    `name,status,effective_status,adset{id,name},` +
    `creative{thumbnail_url,image_url,object_story_spec{video_data{image_url,video_id}},asset_feed_spec{videos{video_id}}}`;
  // Page through the ads list in SMALL pages, following paging.next. Even without
  // the per-ad insights, creative-field expansion across many ads still trips Meta's
  // "reduce the amount of data" limit in one large page (a heavy creator fails at
  // limit=10 but succeeds at limit=5), and the old call never paginated (silently
  // capped at the first 50 ads). Small pages return the full gallery reliably.
  const PAGE_SIZE = 5;
  let listUrl: string | null =
    `https://graph.facebook.com/${META_API_VERSION}/${actId}/ads?` +
    `fields=${fields}` +
    `&filtering=${encodeURIComponent(filtering)}` +
    `&limit=${PAGE_SIZE}` +
    `&access_token=${accessToken}`;

  // Resilient path preserved: if any page fails, record the error, discard partial
  // pages, and continue — the caller keeps the previous gallery while monthly/daily
  // payment data still refreshes from the separate daily call.
  let adsListError: string | null = null;
  let rawAds: any[] = [];
  while (listUrl) {
    const listData = await metaFetch(listUrl);
    if (listData.error) {
      adsListError = `Meta API error: ${listData.error.message}`;
      console.error(
        `[meta-sync] Ads-list call failed for ${handle} — gallery will be preserved, monthly data still refreshes: ${adsListError}`
      );
      rawAds = [];
      break;
    }
    rawAds.push(...(listData.data || []));
    listUrl = listData.paging?.next || null;
  }

  // The daily-insights window only needs to cover what Meta can still restate
  // (~28 days of attribution) plus a buffer — older days are already permanently
  // stored in creator_ad_performance_daily and never change. 35 days covers the
  // restatement horizon and the whole current month at month-end payment time.
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 35);
  const since = `${windowStart.getFullYear()}-${pad(windowStart.getMonth() + 1)}-${pad(windowStart.getDate())}`;
  const until = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  // Per-day, per-ad rows that we'll persist to creator_ad_performance_daily.
  // Keyed by `${ad_id}:${date}` for in-memory dedupe across pagination. Monthly /
  // MTD totals are NOT computed here anymore — the caller derives them from the
  // full daily table after these rows are upserted, so correctness no longer
  // depends on how wide a window we pull.
  const dailyMap = new Map<string, DailyAdRow>();

  // Account-level daily insights, filtered to this handle's ads. Paginated.
  try {
    const insightsFiltering = JSON.stringify([
      { field: "ad.name", operator: "CONTAIN", value: handle },
    ]);
    const dailyFields =
      "ad_id,spend,impressions,outbound_clicks,action_values,purchase_roas";
    const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
    let insightsPageUrl: string | null =
      `https://graph.facebook.com/${META_API_VERSION}/${actId}/insights?` +
      `fields=${dailyFields}` +
      `&level=ad` +
      `&time_increment=1` +
      `&time_range=${timeRange}` +
      `&filtering=${encodeURIComponent(insightsFiltering)}` +
      `&limit=500` +
      `&access_token=${accessToken}`;

    while (insightsPageUrl) {
      const insightsData = await metaFetch(insightsPageUrl);
      if (insightsData.error) {
        throw new Error(`Meta insights error: ${insightsData.error.message}`);
      }
      for (const row of insightsData.data || []) {
        const dateStr = row.date_start?.substring(0, 10);
        const spend = parseFloat(row.spend || "0");
        const impressions = parseInt(row.impressions || "0");
        const outboundClicks = sumActionValue(row.outbound_clicks);
        const purchaseValue = sumActionValue(row.action_values, "purchase");
        const purchaseRoas = pickActionValue(row.purchase_roas, "purchase");

        if (dateStr && row.ad_id) {
          dailyMap.set(`${row.ad_id}:${dateStr}`, {
            ad_id: String(row.ad_id),
            date: dateStr,
            spend,
            impressions,
            outbound_clicks: Math.round(outboundClicks),
            purchase_value: Math.round(purchaseValue * 100) / 100,
            purchase_roas: purchaseRoas,
          });
        }
      }

      // Handle pagination
      insightsPageUrl = insightsData.paging?.next || null;
    }
  } catch (err) {
    console.error(`[meta-sync] Account-level insights failed for ${handle}:`, err);
  }

  // Build ads array — download thumbnails to R2
  const r2Enabled = !!(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME);
  const creatorFolder = influencerId || handle;

  const ads: AdResult[] = [];

  for (const ad of rawAds) {
    let displayName = ad.name || "";
    displayName = displayName
      .replace(new RegExp(`@?${handle}\\s*\\/\\/\\s*`, "i"), "")
      .trim();

    // Get best available image and mirror to R2
    const metaImageUrl = getBestImageUrl(ad);
    let thumbnailUrl = metaImageUrl;

    if (r2Enabled && metaImageUrl) {
      const r2Key = `ads/${creatorFolder}/${ad.id}/thumbnail.jpg`;
      const r2Url = await mirrorImageToR2(metaImageUrl, r2Key);
      if (r2Url) {
        thumbnailUrl = r2Url;
      }
    }

    // Extract video_id from creative (standard or dynamic creative format)
    const videoId =
      ad.creative?.object_story_spec?.video_data?.video_id ||
      ad.creative?.asset_feed_spec?.videos?.[0]?.video_id ||
      null;

    // For video ads, use Meta's public video picture URL (no API call needed)
    if (videoId) {
      const metaVideoThumb = `https://graph.facebook.com/${videoId}/picture`;
      if (r2Enabled) {
        const r2Key = `ads/${creatorFolder}/${ad.id}/video-thumb.jpg`;
        const r2Url = await mirrorImageToR2(metaVideoThumb, r2Key);
        if (r2Url) thumbnailUrl = r2Url;
      } else {
        thumbnailUrl = metaVideoThumb;
      }
    }

    ads.push({
      id: String(ad.id),
      name: displayName,
      status: ad.status,
      effective_status: ad.effective_status || ad.status,
      adset_name: ad.adset?.name || null,
      // Metrics are placeholders here — enriched from the daily table in syncCreator.
      spend: "0.00",
      impressions: "0",
      outbound_clicks: 0,
      outbound_clicks_ctr: 0,
      purchase_value: 0,
      purchase_roas: null,
      thumbnailUrl,
      video_id: videoId ? String(videoId) : null,
      mux_playback_id: null, // will be filled in by processVideoUploads
    });
  }

  const adsLiveCount = ads.filter((a) => a.effective_status === "ACTIVE").length;

  // Lifetime totals: a single account-level summary (one row, no per-ad or daily
  // expansion), so it stays tiny and can't trip Meta's "reduce the amount of data"
  // limit the way the per-ad lifetime insights expansion does. Independent of the
  // ads-list call, so totals refresh even when the gallery call fails.
  let totals: { spend: number; impressions: number; purchase_value: number } | null = null;
  try {
    const totalsFiltering = JSON.stringify([
      { field: "ad.name", operator: "CONTAIN", value: handle },
    ]);
    const totalsUrl =
      `https://graph.facebook.com/${META_API_VERSION}/${actId}/insights?` +
      `fields=spend,impressions,action_values` +
      `&level=account` +
      `&date_preset=maximum` +
      `&filtering=${encodeURIComponent(totalsFiltering)}` +
      `&access_token=${accessToken}`;
    const totalsData = await metaFetch(totalsUrl);
    if (totalsData.error) {
      console.warn(`[meta-sync] Lifetime totals call failed for ${handle}: ${totalsData.error.message}`);
    } else {
      const row = totalsData.data?.[0];
      // No row = no matching ad spend for this handle → genuine zeros (not a failure).
      totals = {
        spend: parseFloat(row?.spend || "0"),
        impressions: parseInt(row?.impressions || "0"),
        purchase_value: Math.round(sumActionValue(row?.action_values, "purchase") * 100) / 100,
      };
    }
  } catch (err) {
    console.warn(`[meta-sync] Lifetime totals call threw for ${handle}:`, err);
  }

  return {
    ads,
    totals,
    daily: Array.from(dailyMap.values()),
    adsLiveCount,
    adsListError,
  };
}

/**
 * For each ad with a video_id but no mux_playback_id, fetch the video
 * source from Meta, upload to Mux, and store the playback ID.
 * Preserves existing mux_playback_ids from previous syncs.
 */
async function processVideoUploads(
  ads: AdResult[],
  existingAds: AdResult[] | null,
  accessToken: string
): Promise<void> {
  // Build a map of existing mux_playback_ids by video_id
  const existingMap = new Map<string, string>();
  if (existingAds) {
    for (const ad of existingAds) {
      if (ad.video_id && ad.mux_playback_id) {
        existingMap.set(ad.video_id, ad.mux_playback_id);
      }
    }
  }

  for (const ad of ads) {
    if (!ad.video_id) continue;

    // Check if we already have a playback ID for this video
    const existing = existingMap.get(ad.video_id);
    if (existing) {
      ad.mux_playback_id = existing;
      continue;
    }

    // Only download videos for active ads
    if (ad.effective_status !== "ACTIVE") continue;

    // Fetch video source URL from Meta
    try {
      const sourceUrl = `https://graph.facebook.com/${META_API_VERSION}/${ad.video_id}?fields=source&access_token=${accessToken}`;
      const sourceData = await metaFetch(sourceUrl);

      if (!sourceData?.source) {
        console.warn(`[meta-sync] No source URL for video ${ad.video_id}`);
        continue;
      }

      // Upload to Mux directly from the Meta CDN URL
      const asset = await mux.video.assets.create({
        inputs: [{ url: sourceData.source }],
        playback_policies: ["public"],
        mp4_support: "capped-1080p",
      });

      const playbackId = asset.playback_ids?.[0]?.id || null;
      if (playbackId) {
        ad.mux_playback_id = playbackId;
        console.log(`[meta-sync] Uploaded video ${ad.video_id} to Mux: ${playbackId}`);
      }
    } catch (err) {
      console.error(`[meta-sync] Failed to process video ${ad.video_id}:`, err);
      // Continue — don't block the rest of the sync
    }
  }
}

export function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

interface PerAdAgg {
  spend: number;
  impressions: number;
  purchase_value: number;
  outbound_clicks: number;
}

/**
 * Derive monthly totals + MTD/last-MTD AND per-ad lifetime-since-tracking
 * aggregates from the stored daily table (the source-of-truth), independent of how
 * wide a window we pulled from Meta. Pages through all rows so a creator with >1000
 * daily rows isn't silently truncated.
 */
async function deriveMonthlyFromDaily(
  db: any,
  handle: string,
  now: Date
): Promise<{
  monthly: { month: string; spend: number; impressions: number }[];
  mtd: { spend: number; impressions: number };
  lastMtd: { spend: number; impressions: number };
  perAd: Map<string, PerAdAgg>;
}> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const mo = now.getMonth();
  const todayDay = now.getDate();
  const currentMonthStart = `${y}-${pad(mo + 1)}-01`;
  const currentEnd = `${y}-${pad(mo + 1)}-${pad(todayDay)}`;
  const lastMonthDate = new Date(y, mo - 1, 1);
  const lmY = lastMonthDate.getFullYear();
  const lmMo = lastMonthDate.getMonth();
  const lastMonthStart = `${lmY}-${pad(lmMo + 1)}-01`;
  const lastMonthLastDay = new Date(y, mo, 0).getDate();
  const lastCompareDay = Math.min(todayDay, lastMonthLastDay);
  const lastMonthEnd = `${lmY}-${pad(lmMo + 1)}-${pad(lastCompareDay)}`;

  const byMonth: Record<string, { spend: number; impressions: number }> = {};
  const mtd = { spend: 0, impressions: 0 };
  const lastMtd = { spend: 0, impressions: 0 };
  const perAd = new Map<string, PerAdAgg>();

  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await (db.from("creator_ad_performance_daily") as any)
      .select("date, spend, impressions, ad_id, purchase_value, outbound_clicks")
      .eq("instagram_handle", handle)
      .order("date", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.warn(`[meta-sync] daily read-back failed for ${handle}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      const date = typeof r.date === "string" ? r.date.slice(0, 10) : String(r.date).slice(0, 10);
      const mk = date.slice(0, 7);
      const spend = Number(r.spend || 0);
      const impressions = Number(r.impressions || 0);
      if (!byMonth[mk]) byMonth[mk] = { spend: 0, impressions: 0 };
      byMonth[mk].spend += spend;
      byMonth[mk].impressions += impressions;
      if (date >= currentMonthStart && date <= currentEnd) {
        mtd.spend += spend;
        mtd.impressions += impressions;
      }
      if (date >= lastMonthStart && date <= lastMonthEnd) {
        lastMtd.spend += spend;
        lastMtd.impressions += impressions;
      }
      const adId = r.ad_id ? String(r.ad_id) : null;
      if (adId) {
        let a = perAd.get(adId);
        if (!a) { a = { spend: 0, impressions: 0, purchase_value: 0, outbound_clicks: 0 }; perAd.set(adId, a); }
        a.spend += spend;
        a.impressions += impressions;
        a.purchase_value += Number(r.purchase_value || 0);
        a.outbound_clicks += Number(r.outbound_clicks || 0);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  const monthly = Object.entries(byMonth)
    .map(([month, v]) => ({ month, spend: Math.round(v.spend * 100) / 100, impressions: v.impressions }))
    .sort((a, b) => b.month.localeCompare(a.month));
  mtd.spend = Math.round(mtd.spend * 100) / 100;
  lastMtd.spend = Math.round(lastMtd.spend * 100) / 100;
  return { monthly, mtd, lastMtd, perAd };
}

export async function syncCreator(
  handle: string,
  influencerId: string | null,
  supabase?: any
): Promise<{ success: boolean; error?: string }> {
  const db = supabase || getServiceClient();
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!accessToken || !adAccountId) {
    return { success: false, error: "Meta API not configured" };
  }

  const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  try {
    const result = await fetchAdsForHandle(handle, accessToken, actId, influencerId);

    // Fetch existing row to preserve mux_playback_ids, historical monthly data,
    // and (on a partial sync) the previous gallery + lifetime totals.
    const { data: existingRow } = await (db.from("creator_ad_performance") as any)
      .select("ads, monthly, totals")
      .eq("instagram_handle", handle)
      .single();

    // Process video uploads to Mux (skips ads that already have playback IDs).
    // No-op when the gallery call failed (result.ads is empty).
    await processVideoUploads(result.ads, existingRow?.ads || null, accessToken);

    // Persist the freshly-fetched per-day, per-ad rows FIRST, so the monthly/MTD
    // derivation below reads them back as part of the full daily history. Upsert is
    // keyed on (instagram_handle, ad_id, date) so re-syncs overwrite without dupes,
    // and a narrower window never deletes older stored days.
    if (result.daily.length > 0) {
      const dailyRows = result.daily.map((d) => ({
        instagram_handle: handle,
        influencer_id: influencerId,
        ad_id: d.ad_id,
        date: d.date,
        spend: d.spend,
        impressions: d.impressions,
        outbound_clicks: d.outbound_clicks,
        purchase_value: d.purchase_value,
        purchase_roas: d.purchase_roas,
      }));
      const CHUNK = 500;
      for (let i = 0; i < dailyRows.length; i += CHUNK) {
        const { error: dailyErr } = await (db.from("creator_ad_performance_daily") as any).upsert(
          dailyRows.slice(i, i + CHUNK),
          { onConflict: "instagram_handle,ad_id,date" }
        );
        if (dailyErr) {
          console.warn(`[meta-sync] daily upsert failed for ${handle}:`, dailyErr.message);
          break;
        }
      }
    }

    // Derive monthly / MTD (+ per-ad aggregates) from the full daily table (the
    // source-of-truth), so the numbers payments read no longer depend on how wide a
    // window we pulled.
    const now = new Date();
    const derived = await deriveMonthlyFromDaily(db, handle, now);

    // Enrich the gallery's per-ad metrics from the daily table. The ads-list call no
    // longer returns insights, so spend/impressions/purchase_value/CTR come from our
    // stored per-day rows (lifetime-since-tracking). No-op when the gallery call
    // failed (result.ads is empty). Ads with no daily rows yet stay at $0.
    for (const ad of result.ads) {
      const agg = derived.perAd.get(ad.id);
      if (!agg) continue;
      ad.spend = agg.spend.toFixed(2);
      ad.impressions = String(agg.impressions);
      ad.outbound_clicks = Math.round(agg.outbound_clicks);
      ad.outbound_clicks_ctr = agg.impressions > 0
        ? Math.round((agg.outbound_clicks / agg.impressions) * 100 * 100) / 100
        : 0;
      ad.purchase_value = Math.round(agg.purchase_value * 100) / 100;
      ad.purchase_roas = null; // dashboards compute ROAS as purchase_value / spend
    }

    // Refresh ONLY the months inside the fresh daily window from the daily table.
    // Older months are preserved exactly as already stored: the daily table can be
    // incomplete at its far edge (so re-deriving would understate them), and past
    // payouts were locked against the stored values — we do not restate settled
    // history here. (Note: stored historical months predating the daily table may be
    // understated by an older sync bug; correcting that is a separate, deliberate
    // backfill, not part of this path.)
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - 35);
    const windowStartMonth = `${windowStart.getFullYear()}-${String(windowStart.getMonth() + 1).padStart(2, "0")}`;
    const existingMonthly = (existingRow?.monthly || []) as { month: string; spend: number; impressions: number }[];
    const mergedByMonth = new Map(existingMonthly.map((m) => [m.month, m]));
    for (const m of derived.monthly) {
      if (m.month >= windowStartMonth) mergedByMonth.set(m.month, m);
    }
    const mergedMonthly = Array.from(mergedByMonth.values())
      .sort((a, b) => b.month.localeCompare(a.month));

    // On a partial sync (gallery call failed) keep the previous gallery rather than
    // wiping it. Lifetime totals have their own independent account-level source, so
    // use the fresh value when available and fall back to the stored one only if that
    // call failed (result.totals === null).
    const galleryFailed = !!result.adsListError;
    const adsToWrite = galleryFailed ? (existingRow?.ads ?? []) : result.ads;
    const totalsToWrite = result.totals ?? existingRow?.totals ?? { spend: 0, impressions: 0, purchase_value: 0 };

    await (db.from("creator_ad_performance") as any).upsert(
      {
        instagram_handle: handle,
        influencer_id: influencerId,
        ads: adsToWrite,
        totals: totalsToWrite,
        monthly: mergedMonthly,
        mtd: derived.mtd,
        last_mtd: derived.lastMtd,
        // Record the gallery failure so admins know the gallery is stale, even
        // though monthly/totals refreshed successfully. null on a clean sync.
        sync_error: result.adsListError,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "instagram_handle" }
    );

    // Write today's ads-live snapshot. Historical days can't be backfilled,
    // so the chart series will be empty until enough days accumulate.
    const todayIso = new Date().toISOString().slice(0, 10);
    const { error: liveErr } = await (db.from("creator_ads_live_daily") as any).upsert(
      {
        instagram_handle: handle,
        influencer_id: influencerId,
        date: todayIso,
        count: result.adsLiveCount,
      },
      { onConflict: "instagram_handle,date" }
    );
    if (liveErr) {
      console.warn(`[meta-sync] ads-live upsert failed for ${handle}:`, liveErr.message);
    }

    if (result.adsListError) {
      console.warn(`[meta-sync] Partial sync ${handle}: gallery preserved (list call failed), ${result.daily.length} daily rows refreshed, ${mergedMonthly.length} months`);
    } else {
      const totalSpend = totalsToWrite?.spend ?? 0;
      console.log(`[meta-sync] Synced ${handle}: ${result.ads.length} ads, ${result.daily.length} daily rows, $${totalSpend.toFixed(2)} total spend`);
    }
    return { success: true };
  } catch (err: any) {
    const errorMsg = err.message || "Unknown error";
    console.error(`[meta-sync] Failed to sync ${handle}:`, errorMsg);

    // Store the error so we know what went wrong
    await (db.from("creator_ad_performance") as any).upsert(
      {
        instagram_handle: handle,
        influencer_id: influencerId,
        sync_error: errorMsg,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "instagram_handle" }
    );

    return { success: false, error: errorMsg };
  }
}

export async function syncAllCreators(
  supabase?: any
): Promise<{
  synced: number;
  failed: number;
  stoppedEarly: boolean;
  errors: string[];
}> {
  const db = supabase || getServiceClient();

  // Get all influencers with instagram handles that have ad spend deals
  const { data: invites } = await (db.from("creator_invites") as any)
    .select("influencer_id, influencer:influencers!creator_invites_influencer_id_fkey(id, instagram_handle)")
    .eq("has_ad_spend", true);

  const creators: { handle: string; influencerId: string }[] = [];
  for (const inv of invites || []) {
    const inf = inv.influencer as any;
    if (inf?.instagram_handle) {
      creators.push({ handle: inf.instagram_handle, influencerId: inf.id });
    }
  }

  console.log(`[meta-sync] Starting sync for ${creators.length} creators`);

  let synced = 0;
  let failed = 0;
  let stoppedEarly = false;
  const errors: string[] = [];

  for (const creator of creators) {
    try {
      const result = await syncCreator(creator.handle, creator.influencerId, db);
      if (result.success) {
        synced++;
      } else {
        failed++;
        errors.push(`${creator.handle}: ${result.error}`);
      }
    } catch (err: any) {
      if (err.message?.includes("Rate limit reached")) {
        stoppedEarly = true;
        console.warn(`[meta-sync] Stopped early: rate limit reached after ${synced} creators`);
        break;
      }
      failed++;
      errors.push(`${creator.handle}: ${err.message}`);
    }
  }

  // Save sync status to app_settings
  const syncStatus = {
    last_synced_at: new Date().toISOString(),
    creators_synced: synced,
    creators_failed: failed,
    stopped_early: stoppedEarly,
    total_creators: creators.length,
  };

  await (db.from("app_settings") as any).upsert(
    {
      key: "meta_sync_status",
      value: JSON.stringify(syncStatus),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  console.log(`[meta-sync] Complete: ${synced} synced, ${failed} failed, stoppedEarly=${stoppedEarly}`);

  return { synced, failed, stoppedEarly, errors };
}

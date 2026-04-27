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
  totals: { spend: number; impressions: number };
  monthly: { month: string; spend: number; impressions: number }[];
  mtd: { spend: number; impressions: number };
  lastMtd: { spend: number; impressions: number };
  daily: DailyAdRow[];
  adsLiveCount: number;
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

  const insightsFields =
    "spend,impressions,outbound_clicks,outbound_clicks_ctr,action_values,purchase_roas";
  // adset{id,name} — including `id` alongside `name` avoids Meta's URL parser
  // mistaking single-subfield `adset{name}` for brace value-substitution syntax.
  const fields =
    `name,status,effective_status,adset{id,name},` +
    `creative{thumbnail_url,image_url,object_story_spec{video_data{image_url,video_id}},asset_feed_spec{videos{video_id}}},` +
    `insights.date_preset(maximum){${insightsFields}}`;
  const listUrl =
    `https://graph.facebook.com/${META_API_VERSION}/${actId}/ads?` +
    `fields=${fields}` +
    `&filtering=${encodeURIComponent(filtering)}` +
    `&limit=50` +
    `&access_token=${accessToken}`;

  const listData = await metaFetch(listUrl);

  if (listData.error) {
    throw new Error(`Meta API error: ${listData.error.message}`);
  }

  const rawAds = listData.data || [];

  // Date ranges for MTD comparison
  const now = new Date();
  const todayDay = now.getDate();
  const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const currentEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-01`;
  const lastMonthLastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const lastCompareDay = Math.min(todayDay, lastMonthLastDay);
  const lastMonthEnd = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}-${String(lastCompareDay).padStart(2, "0")}`;

  const monthMap: Record<string, { spend: number; impressions: number }> = {};
  let mtd = { spend: 0, impressions: 0 };
  let lastMtd = { spend: 0, impressions: 0 };
  // Per-day, per-ad rows that we'll persist to creator_ad_performance_daily.
  // Keyed by `${ad_id}:${date}` for in-memory dedupe across pagination.
  const dailyMap = new Map<string, DailyAdRow>();

  // Single account-level insights call: get daily data for all ads in one request
  // Filtered to ads matching this handle via the ad name filter
  try {
    const insightsFiltering = JSON.stringify([
      { field: "ad.name", operator: "CONTAIN", value: handle },
    ]);
    const dailyFields =
      "ad_id,spend,impressions,outbound_clicks,action_values,purchase_roas";
    let insightsPageUrl: string | null =
      `https://graph.facebook.com/${META_API_VERSION}/${actId}/insights?` +
      `fields=${dailyFields}` +
      `&level=ad` +
      `&time_increment=1` +
      `&date_preset=last_90d` +
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
        const monthKey = dateStr?.substring(0, 7);
        const spend = parseFloat(row.spend || "0");
        const impressions = parseInt(row.impressions || "0");
        const outboundClicks = sumActionValue(row.outbound_clicks);
        const purchaseValue = sumActionValue(row.action_values, "purchase");
        const purchaseRoas = pickActionValue(row.purchase_roas, "purchase");

        if (monthKey) {
          if (!monthMap[monthKey]) monthMap[monthKey] = { spend: 0, impressions: 0 };
          monthMap[monthKey].spend += spend;
          monthMap[monthKey].impressions += impressions;
        }
        if (dateStr && dateStr >= currentMonthStart && dateStr <= currentEnd) {
          mtd.spend += spend;
          mtd.impressions += impressions;
        }
        if (dateStr && dateStr >= lastMonthStart && dateStr <= lastMonthEnd) {
          lastMtd.spend += spend;
          lastMtd.impressions += impressions;
        }

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

  const monthly = Object.entries(monthMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, vals]) => ({ month, ...vals }));

  // Build ads array — download thumbnails to R2
  let totalSpend = 0;
  let totalImpressions = 0;
  const r2Enabled = !!(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME);
  const creatorFolder = influencerId || handle;

  const ads: AdResult[] = [];

  for (const ad of rawAds) {
    let displayName = ad.name || "";
    displayName = displayName
      .replace(new RegExp(`@?${handle}\\s*\\/\\/\\s*`, "i"), "")
      .trim();

    const insights = ad.insights?.data?.[0];
    const spend = parseFloat(insights?.spend || "0");
    const impressions = parseInt(insights?.impressions || "0");
    const outboundClicks = sumActionValue(insights?.outbound_clicks);
    const outboundCtr = sumActionValue(insights?.outbound_clicks_ctr);
    const purchaseValue = sumActionValue(insights?.action_values, "purchase");
    const purchaseRoas = pickActionValue(insights?.purchase_roas, "purchase");

    totalSpend += spend;
    totalImpressions += impressions;

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
      spend: spend.toFixed(2),
      impressions: String(impressions),
      outbound_clicks: Math.round(outboundClicks),
      outbound_clicks_ctr: Math.round(outboundCtr * 100) / 100,
      purchase_value: Math.round(purchaseValue * 100) / 100,
      purchase_roas: purchaseRoas,
      thumbnailUrl,
      video_id: videoId ? String(videoId) : null,
      mux_playback_id: null, // will be filled in by processVideoUploads
    });
  }

  const adsLiveCount = ads.filter((a) => a.effective_status === "ACTIVE").length;

  return {
    ads,
    totals: { spend: totalSpend, impressions: totalImpressions },
    monthly,
    mtd,
    lastMtd,
    daily: Array.from(dailyMap.values()),
    adsLiveCount,
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

    // Fetch existing row to preserve mux_playback_ids and historical monthly data
    const { data: existingRow } = await (db.from("creator_ad_performance") as any)
      .select("ads, monthly")
      .eq("instagram_handle", handle)
      .single();

    // Process video uploads to Mux (skips ads that already have playback IDs)
    await processVideoUploads(result.ads, existingRow?.ads || null, accessToken);

    // Merge monthly data: fresh API data overwrites recent months,
    // but historical months outside the API window are preserved
    const existingMonthly = (existingRow?.monthly || []) as { month: string; spend: number; impressions: number }[];
    const freshMonths = new Set(result.monthly.map((m: any) => m.month));
    const preserved = existingMonthly.filter((m) => !freshMonths.has(m.month));
    const mergedMonthly = [...result.monthly, ...preserved]
      .sort((a, b) => b.month.localeCompare(a.month));

    await (db.from("creator_ad_performance") as any).upsert(
      {
        instagram_handle: handle,
        influencer_id: influencerId,
        ads: result.ads,
        totals: result.totals,
        monthly: mergedMonthly,
        mtd: result.mtd,
        last_mtd: result.lastMtd,
        sync_error: null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "instagram_handle" }
    );

    // Persist per-day, per-ad rows (the daily insights call already happens
    // above; we just stop discarding the data). Upsert is keyed on
    // (instagram_handle, ad_id, date) so re-syncs overwrite without dupes.
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
      // Chunk to keep payloads modest (Meta returns up to ~90d × N ads).
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

    console.log(`[meta-sync] Synced ${handle}: ${result.ads.length} ads, ${result.daily.length} daily rows, $${result.totals.spend.toFixed(2)} total spend`);
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

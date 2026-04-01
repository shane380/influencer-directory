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
  name: string;
  status: string;
  effective_status: string;
  spend: string;
  impressions: string;
  thumbnailUrl: string | null;
  video_id: string | null;
  mux_playback_id: string | null;
}

interface SyncResult {
  ads: AdResult[];
  totals: { spend: number; impressions: number };
  monthly: { month: string; spend: number; impressions: number }[];
  mtd: { spend: number; impressions: number };
  lastMtd: { spend: number; impressions: number };
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

  const fields = "name,status,effective_status,creative{thumbnail_url,image_url,object_story_spec{video_data{image_url,video_id}},asset_feed_spec{videos{video_id}}},insights.date_preset(maximum){spend,impressions}";
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
  const adIds: string[] = rawAds.map((ad: any) => ad.id);

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

  // Single insights call per ad: fetch daily data for last 90 days, then aggregate
  for (const adId of adIds) {
    try {
      const insightsUrl =
        `https://graph.facebook.com/${META_API_VERSION}/${adId}/insights?` +
        `fields=spend,impressions` +
        `&time_increment=1` +
        `&date_preset=last_90d` +
        `&limit=100` +
        `&access_token=${accessToken}`;
      const insightsData = await metaFetch(insightsUrl);
      for (const row of insightsData.data || []) {
        const dateStr = row.date_start?.substring(0, 10);
        const monthKey = dateStr?.substring(0, 7);
        const spend = parseFloat(row.spend || "0");
        const impressions = parseInt(row.impressions || "0");

        // Monthly aggregation
        if (monthKey) {
          if (!monthMap[monthKey]) monthMap[monthKey] = { spend: 0, impressions: 0 };
          monthMap[monthKey].spend += spend;
          monthMap[monthKey].impressions += impressions;
        }

        // Current MTD
        if (dateStr && dateStr >= currentMonthStart && dateStr <= currentEnd) {
          mtd.spend += spend;
          mtd.impressions += impressions;
        }

        // Last month MTD comparison
        if (dateStr && dateStr >= lastMonthStart && dateStr <= lastMonthEnd) {
          lastMtd.spend += spend;
          lastMtd.impressions += impressions;
        }
      }
    } catch (err) {
      console.error(`[meta-sync] Insights failed for ad ${adId}:`, err);
    }
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

    // For video ads without Mux, try to get a higher-quality video thumbnail from Meta
    if (videoId && thumbnailUrl && !thumbnailUrl.includes('video-thumb')) {
      try {
        const videoThumbUrl = `https://graph.facebook.com/${META_API_VERSION}/${videoId}/thumbnails?access_token=${accessToken}`;
        const thumbData = await metaFetch(videoThumbUrl);
        const bestThumb = thumbData?.data?.[0]?.uri;
        if (bestThumb) {
          if (r2Enabled) {
            const r2Key = `ads/${creatorFolder}/${ad.id}/video-thumb.jpg`;
            const r2Url = await mirrorImageToR2(bestThumb, r2Key);
            if (r2Url) thumbnailUrl = r2Url;
          } else {
            thumbnailUrl = bestThumb;
          }
        }
      } catch {
        // Fall back to existing thumbnail
      }
    }

    ads.push({
      name: displayName,
      status: ad.status,
      effective_status: ad.effective_status || ad.status,
      spend: spend.toFixed(2),
      impressions: String(impressions),
      thumbnailUrl,
      video_id: videoId ? String(videoId) : null,
      mux_playback_id: null, // will be filled in by processVideoUploads
    });
  }

  return {
    ads,
    totals: { spend: totalSpend, impressions: totalImpressions },
    monthly,
    mtd,
    lastMtd,
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

    // Fetch existing ads to preserve mux_playback_ids
    const { data: existingRow } = await (db.from("creator_ad_performance") as any)
      .select("ads")
      .eq("instagram_handle", handle)
      .single();

    // Process video uploads to Mux (skips ads that already have playback IDs)
    await processVideoUploads(result.ads, existingRow?.ads || null, accessToken);

    await (db.from("creator_ad_performance") as any).upsert(
      {
        instagram_handle: handle,
        influencer_id: influencerId,
        ads: result.ads,
        totals: result.totals,
        monthly: result.monthly,
        mtd: result.mtd,
        last_mtd: result.lastMtd,
        sync_error: null,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "instagram_handle" }
    );

    console.log(`[meta-sync] Synced ${handle}: ${result.ads.length} ads, $${result.totals.spend.toFixed(2)} total spend`);
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

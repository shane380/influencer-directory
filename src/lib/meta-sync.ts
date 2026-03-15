import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const META_API_VERSION = "v19.0";
const MAX_CALLS_PER_HOUR = 200;

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

interface AdResult {
  name: string;
  status: string;
  spend: string;
  impressions: string;
  thumbnailUrl: string | null;
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
  actId: string
): Promise<SyncResult> {
  const filtering = JSON.stringify([
    { field: "name", operator: "CONTAIN", value: handle },
  ]);

  const fields = "name,status,creative{thumbnail_url,image_url},insights.date_preset(maximum){spend,impressions}";
  const listUrl =
    `https://graph.facebook.com/${META_API_VERSION}/${actId}/ads?` +
    `fields=${fields}` +
    `&filtering=${encodeURIComponent(filtering)}` +
    `&thumbnail_width=600` +
    `&thumbnail_height=600` +
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

  // Sequential calls per ad (not Promise.all)
  for (const adId of adIds) {
    // Monthly insights (last 90 days)
    try {
      const mUrl =
        `https://graph.facebook.com/${META_API_VERSION}/${adId}/insights?` +
        `fields=spend,impressions` +
        `&time_increment=monthly` +
        `&date_preset=last_90d` +
        `&access_token=${accessToken}`;
      const mData = await metaFetch(mUrl);
      for (const row of mData.data || []) {
        const monthKey = row.date_start?.substring(0, 7);
        if (!monthMap[monthKey]) monthMap[monthKey] = { spend: 0, impressions: 0 };
        monthMap[monthKey].spend += parseFloat(row.spend || "0");
        monthMap[monthKey].impressions += parseInt(row.impressions || "0");
      }
    } catch (err) {
      console.error(`[meta-sync] Monthly insights failed for ad ${adId}:`, err);
    }

    // Current MTD
    try {
      const cUrl =
        `https://graph.facebook.com/${META_API_VERSION}/${adId}/insights?` +
        `fields=spend,impressions` +
        `&time_range=${encodeURIComponent(JSON.stringify({ since: currentMonthStart, until: currentEnd }))}` +
        `&access_token=${accessToken}`;
      const cData = await metaFetch(cUrl);
      if (cData.data?.[0]) {
        mtd.spend += parseFloat(cData.data[0].spend || "0");
        mtd.impressions += parseInt(cData.data[0].impressions || "0");
      }
    } catch (err) {
      console.error(`[meta-sync] Current MTD failed for ad ${adId}:`, err);
    }

    // Last month MTD comparison
    try {
      const lUrl =
        `https://graph.facebook.com/${META_API_VERSION}/${adId}/insights?` +
        `fields=spend,impressions` +
        `&time_range=${encodeURIComponent(JSON.stringify({ since: lastMonthStart, until: lastMonthEnd }))}` +
        `&access_token=${accessToken}`;
      const lData = await metaFetch(lUrl);
      if (lData.data?.[0]) {
        lastMtd.spend += parseFloat(lData.data[0].spend || "0");
        lastMtd.impressions += parseInt(lData.data[0].impressions || "0");
      }
    } catch (err) {
      console.error(`[meta-sync] Last MTD failed for ad ${adId}:`, err);
    }
  }

  const monthly = Object.entries(monthMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, vals]) => ({ month, ...vals }));

  // Build ads array
  let totalSpend = 0;
  let totalImpressions = 0;

  const ads: AdResult[] = rawAds.map((ad: any) => {
    let displayName = ad.name || "";
    displayName = displayName
      .replace(new RegExp(`@?${handle}\\s*\\/\\/\\s*`, "i"), "")
      .trim();

    const insights = ad.insights?.data?.[0];
    const spend = parseFloat(insights?.spend || "0");
    const impressions = parseInt(insights?.impressions || "0");

    totalSpend += spend;
    totalImpressions += impressions;

    return {
      name: displayName,
      status: ad.status,
      spend: spend.toFixed(2),
      impressions: String(impressions),
      thumbnailUrl: ad.creative?.image_url || ad.creative?.thumbnail_url || null,
    };
  });

  return {
    ads,
    totals: { spend: totalSpend, impressions: totalImpressions },
    monthly,
    mtd,
    lastMtd,
  };
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
    const result = await fetchAdsForHandle(handle, accessToken, actId);

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

import { createClient } from "@supabase/supabase-js";
import { r2Client, R2_BUCKET, getPublicUrl } from "./r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import mux from "./mux";
import { metaFetch, META_API_VERSION, sumActionValue, pickActionValue, metaCallCount } from "./meta-fetch";
import {
  fetchAccountSweep,
  fetchAdCreatives,
  type AccountSweep,
} from "./meta-account-sync";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Download an image from a URL and upload it to R2.
 * Returns the public R2 URL, or null if anything fails.
 */
async function mirrorImageToR2(
  imageUrl: string,
  r2Key: string,
  minBytes = 0
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    // Meta serves tiny placeholder images (50×50 question-mark GIF from
    // /picture, 64×64 default creative thumbs) that "succeed" but look glitchy
    // stretched into a 9:16 card. Refuse to mirror anything that small.
    if (buffer.length < minBytes) {
      console.warn(`[meta-sync] Skipping tiny image (${buffer.length}B < ${minBytes}B) for ${r2Key}`);
      return null;
    }
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
  video_3s_views: number;
  video_thruplays: number;
  thumbnailUrl: string | null;
  video_id: string | null;
  ig_media_id: string | null;
  ig_media_type: string | null;
  mux_playback_id: string | null;
  previewHtml: string | null;
  carousel_urls: string[] | null;
}

interface DailyAdRow {
  ad_id: string;
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  outbound_clicks: number;
  purchase_value: number;
  purchase_roas: number | null;
  video_3s_views: number;
  video_thruplays: number;
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

/**
 * Meta's `CONTAIN` filter is a case-insensitive substring test on the ad name.
 * Attribution used to happen server-side, once per creator; now it happens here,
 * once, over the account-wide sweep. Replicating the exact semantics matters —
 * these handles decide which rows land in the payment-critical
 * creator_ad_performance_daily table.
 *
 * An ad can match MORE than one handle (e.g. "alice" also matches "alice.cox").
 * The old code had the same behaviour, since each creator's filtered call
 * claimed the ad independently, so every match is returned here too.
 */
function handlesMatching(
  adName: string | null,
  handles: { handle: string; influencerId: string | null }[],
): { handle: string; influencerId: string | null }[] {
  if (!adName) return [];
  const lower = adName.toLowerCase();
  return handles.filter((h) => lower.includes(h.handle.toLowerCase()));
}

/** Strip the "@handle // " prefix the team puts on partnership ad names. */
function displayNameFor(adName: string | null, handle: string): string {
  return (adName || "").replace(new RegExp(`@?${handle}\\s*\\/\\/\\s*`, "i"), "").trim();
}

/**
 * Row shape for the meta_ads dimension table.
 * Mutable fields (status, name, campaign) refresh every run; creative fields are
 * fetched once per ad and then carried forward.
 */
interface MetaAdRow {
  ad_id: string;
  ad_name: string | null;
  status: string | null;
  effective_status: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  created_time: string | null;
  format: string | null;
  hook_line: string | null;
  thumbnail_url: string | null;
  video_id: string | null;
  mux_playback_id: string | null;
  ig_media_id: string | null;
  ig_media_type: string | null;
  carousel_urls: string[] | null;
  preview_html: string | null;
  partnership: boolean;
  instagram_handle: string | null;
  influencer_id: string | null;
  creative_synced_at: string | null;
  updated_at: string;
}

/**
 * Enrich one ad's creative: mirror the thumbnail to R2, pull a real video frame
 * when the creative image is missing or a placeholder, and mirror carousel
 * children. Lifted from the old per-handle fetchAdsForHandle so the behaviour
 * (and its hard-won edge cases) is preserved exactly — it just runs once per ad
 * id now instead of once per ad per sync.
 */
async function enrichCreative(
  row: MetaAdRow,
  creative: { thumbnail_url: string | null; video_id: string | null; ig_media_id: string | null },
  accessToken: string,
  folder: string,
): Promise<void> {
  const r2Enabled = !!(process.env.R2_ACCOUNT_ID && process.env.R2_BUCKET_NAME);
  const r2Prefix = r2Enabled ? getPublicUrl("") : null;

  let thumbnailUrl = creative.thumbnail_url;
  if (r2Enabled && thumbnailUrl) {
    const mirrored = await mirrorImageToR2(thumbnailUrl, `ads/${folder}/${row.ad_id}/thumbnail.jpg`, 3000);
    if (mirrored) thumbnailUrl = mirrored;
  }

  // Video ads with NO usable mirrored creative image: ask the video's
  // /thumbnails edge for a real frame (preferred, else largest). The /picture
  // URL is a last resort — it returns a 50x50 placeholder GIF for many
  // whitelisted IG videos, and must never OVERWRITE a good creative image.
  const hasGoodMirror = !!(r2Prefix && thumbnailUrl && thumbnailUrl.startsWith(r2Prefix));
  if (creative.video_id && !hasGoodMirror) {
    try {
      const tData = await metaFetch(
        `https://graph.facebook.com/${META_API_VERSION}/${creative.video_id}/thumbnails?access_token=${accessToken}`,
      );
      const thumbs = ((tData?.data || []) as any[]).filter((t) => t?.uri);
      const best =
        thumbs.find((t) => t.is_preferred) || thumbs.sort((a, b) => (b.width || 0) - (a.width || 0))[0];
      const candidate = best?.uri || `https://graph.facebook.com/${creative.video_id}/picture`;
      if (r2Enabled) {
        const mirrored = await mirrorImageToR2(candidate, `ads/${folder}/${row.ad_id}/video-thumb.jpg`, 3000);
        if (mirrored) thumbnailUrl = mirrored;
      } else {
        thumbnailUrl = candidate;
      }
    } catch (err) {
      console.warn(`[meta-sync] video thumbnails lookup failed for ${creative.video_id}:`, err);
    }
  }

  row.thumbnail_url = thumbnailUrl;
  row.video_id = creative.video_id;
  row.ig_media_id = creative.ig_media_id;

  // Image carousels (boosted CAROUSEL_ALBUM posts) have no video — mirror their
  // frames to R2 once so the dashboard shows a native viewer instead of Meta's
  // iframe.
  if (!creative.video_id && creative.ig_media_id && r2Enabled) {
    try {
      const mData = await metaFetch(
        `https://graph.facebook.com/${META_API_VERSION}/${creative.ig_media_id}?fields=media_type,children{media_type,media_url}&access_token=${accessToken}`,
      );
      row.ig_media_type = mData?.media_type || null;
      if (mData?.media_type === "CAROUSEL_ALBUM") {
        const children = ((mData.children?.data || []) as any[])
          .filter((c) => c?.media_type === "IMAGE" && c.media_url)
          .slice(0, 10);
        const urls: string[] = [];
        for (let ci = 0; ci < children.length; ci++) {
          const u = await mirrorImageToR2(children[ci].media_url, `ads/${folder}/${row.ad_id}/carousel-${ci}.jpg`, 3000);
          if (u) urls.push(u);
        }
        if (urls.length > 0) {
          row.carousel_urls = urls;
          row.format = "carousel";
        }
      }
    } catch (err) {
      console.warn(`[meta-sync] carousel fetch failed for ad ${row.ad_id}:`, err);
    }
  }
}

/**
 * Write the account-wide sweep to meta_ad_daily + meta_ads.
 *
 * Runs ONCE per sync, before any per-creator work. Everything expensive lives
 * here and is keyed on "have we already done this for this ad id?", so steady
 * state costs almost nothing.
 */
async function persistAccountSweep(
  db: any,
  sweep: AccountSweep,
  creators: { handle: string; influencerId: string | null }[],
  accessToken: string,
  opts: {
    creativeDeadline: number;
    /**
     * Report what WOULD happen without touching anything. Exists because the
     * first real run is irreversible in two expensive ways — Mux encodes are
     * billed per asset, and R2 mirroring rewrites thumbnail URLs — so it is
     * worth confirming the seed carried creative forward before letting either
     * loose on ~230 previously-synced ads.
     */
    dryRun?: boolean;
  },
): Promise<void> {
  const dry = !!opts.dryRun;
  // ── 1. Daily facts ────────────────────────────────────────────────────────
  if (sweep.daily.length > 0 && !dry) {
    const rows = sweep.daily.map((d) => ({
      ad_id: d.ad_id,
      date: d.date,
      spend: d.spend,
      impressions: d.impressions,
      outbound_clicks: d.outbound_clicks,
      purchases: d.purchases,
      purchase_value: d.purchase_value,
      purchase_roas: d.purchase_roas,
      video_3s_views: d.video_3s_views,
      video_thruplays: d.video_thruplays,
      synced_at: new Date().toISOString(),
    }));
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await db
        .from("meta_ad_daily")
        .upsert(rows.slice(i, i + CHUNK), { onConflict: "ad_id,date" });
      if (error) {
        console.warn(`[meta-sync] meta_ad_daily upsert failed:`, error.message);
        break;
      }
    }
    console.log(`[meta-sync] meta_ad_daily: ${rows.length} rows upserted`);
  }

  // ── 2. What do we already know about these ads? ───────────────────────────
  const { data: existingRows } = await db
    .from("meta_ads")
    .select(
      "ad_id, thumbnail_url, video_id, mux_playback_id, ig_media_id, ig_media_type, carousel_urls, preview_html, hook_line, format, creative_synced_at",
    );
  const existing = new Map<string, any>();
  for (const r of (existingRows as any[]) || []) existing.set(String(r.ad_id), r);

  // First run only: carry creative work forward from the old per-creator blobs.
  // Without this, every ad looks new and we would re-mirror ~231 thumbnails and
  // re-upload ~115 videos to Mux — real money and hours of processing, for data
  // we already have.
  const seed = new Map<string, any>();
  if (existing.size === 0) {
    const { data: blobs } = await db
      .from("creator_ad_performance")
      .select("instagram_handle, influencer_id, ads");
    for (const b of (blobs as any[]) || []) {
      for (const ad of (b.ads as any[]) || []) {
        if (!ad?.id || seed.has(String(ad.id))) continue;
        // Carry the owning handle: the blob stores a DISPLAY name with the
        // "@handle // " prefix already stripped, so it cannot be re-attributed
        // by substring match the way a raw Meta ad name can.
        seed.set(String(ad.id), {
          ...ad,
          __handle: b.instagram_handle || null,
          __influencerId: b.influencer_id || null,
        });
      }
    }
    if (seed.size > 0) {
      console.log(`[meta-sync] Seeding meta_ads creative from ${seed.size} previously-synced ads`);
    }
  }

  // ── 3. Build the dimension rows ───────────────────────────────────────────
  const rowsById = new Map<string, MetaAdRow>();
  for (const [adId, listRec] of sweep.list) {
    const prior = existing.get(adId);
    const seeded = seed.get(adId);
    const matches = handlesMatching(listRec.ad_name, creators);
    // Most specific handle wins the single-value column (an ad matching both
    // "alice" and "alice.cox" belongs to the latter). Every match still gets its
    // own row in creator_ad_performance_daily.
    const owner = matches.sort((a, b) => b.handle.length - a.handle.length)[0] || null;

    rowsById.set(adId, {
      ad_id: adId,
      ad_name: listRec.ad_name,
      status: listRec.status,
      effective_status: listRec.effective_status,
      campaign_id: listRec.campaign_id,
      campaign_name: listRec.campaign_name,
      adset_id: listRec.adset_id,
      adset_name: listRec.adset_name,
      created_time: listRec.created_time,
      format: prior?.format ?? seeded?.format ?? null,
      hook_line: prior?.hook_line ?? null,
      thumbnail_url: prior?.thumbnail_url ?? seeded?.thumbnailUrl ?? null,
      video_id: prior?.video_id ?? seeded?.video_id ?? null,
      mux_playback_id: prior?.mux_playback_id ?? seeded?.mux_playback_id ?? null,
      ig_media_id: prior?.ig_media_id ?? seeded?.ig_media_id ?? null,
      ig_media_type: prior?.ig_media_type ?? seeded?.ig_media_type ?? null,
      carousel_urls: prior?.carousel_urls ?? seeded?.carousel_urls ?? null,
      preview_html: prior?.preview_html ?? seeded?.previewHtml ?? null,
      partnership: matches.length > 0,
      instagram_handle: owner?.handle ?? null,
      influencer_id: owner?.influencerId ?? null,
      // Seeded ads count as already-enriched: we have their creative from the
      // old sync, so re-fetching it would be pure waste.
      creative_synced_at: prior?.creative_synced_at ?? (seeded ? new Date().toISOString() : null),
      updated_at: new Date().toISOString(),
    });
  }

  // Ads that are visible today but fall outside the sweep (paused, and last
  // spent more than the window ago) must still get a meta_ads row. Without this,
  // day one of the refactor would shrink every gallery to "active or recently
  // spending", and api/creator/top-ads — which supports a 92-day window and
  // skips ads missing from the gallery — would drop their cards.
  //
  // meta_ads is append-only in practice, so this matters only for the first run;
  // afterwards an ad stays once it has been seen.
  for (const [adId, seeded] of seed) {
    if (rowsById.has(adId)) continue;
    rowsById.set(adId, {
      ad_id: adId,
      ad_name: seeded.name || null,
      status: seeded.status ?? null,
      effective_status: seeded.effective_status ?? seeded.status ?? null,
      campaign_id: null,
      campaign_name: null,
      adset_id: null,
      adset_name: seeded.adset_name ?? null,
      created_time: null,
      format: seeded.format ?? null,
      hook_line: null,
      thumbnail_url: seeded.thumbnailUrl ?? null,
      video_id: seeded.video_id ?? null,
      mux_playback_id: seeded.mux_playback_id ?? null,
      ig_media_id: seeded.ig_media_id ?? null,
      ig_media_type: seeded.ig_media_type ?? null,
      carousel_urls: seeded.carousel_urls ?? null,
      preview_html: seeded.previewHtml ?? null,
      partnership: !!seeded.__handle,
      instagram_handle: seeded.__handle ?? null,
      influencer_id: seeded.__influencerId ?? null,
      creative_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  // ── 4. Creative expansion — new ad ids only, under a time budget ──────────
  // Partnership ads first: the creator dashboard depends on their thumbnails,
  // whereas brand-ad thumbnails only feed the (not yet shipped) performance
  // page. If the time budget cuts this short, the important ones are already in.
  const needCreative = Array.from(rowsById.values())
    .filter((r) => !r.creative_synced_at)
    .sort((a, b) => Number(b.partnership) - Number(a.partnership));
  if (needCreative.length > 0) {
    const p = needCreative.filter((r) => r.partnership).length;
    console.log(
      `[meta-sync] ${needCreative.length} ad(s) need creative enrichment ` +
      `(${p} partnership, ${needCreative.length - p} brand)`,
    );
  }
  if (needCreative.length > 0 && !dry) {
    const creatives = await fetchAdCreatives(accessToken, needCreative.map((r) => r.ad_id));

    let enriched = 0;
    for (const row of needCreative) {
      // The first run after this refactor faces every brand ad at once. Mirroring
      // is slow (CDN download + R2 put per ad), so stop cleanly at the deadline
      // and let the next run continue — rows without creative_synced_at are
      // simply picked up again.
      if (Date.now() > opts.creativeDeadline) {
        console.warn(
          `[meta-sync] Creative budget reached: enriched ${enriched}/${needCreative.length}, rest deferred to next run`,
        );
        break;
      }
      const c = creatives.get(row.ad_id);
      if (!c) continue;
      row.hook_line = c.hook_line;
      row.format = c.format;
      await enrichCreative(
        row,
        { thumbnail_url: c.thumbnail_url, video_id: c.video_id, ig_media_id: c.ig_media_id },
        accessToken,
        row.instagram_handle || "brand",
      );
      row.creative_synced_at = new Date().toISOString();
      enriched++;
    }
  }

  // ── 5. Mux uploads + preview fallback — PARTNERSHIP ADS ONLY ──────────────
  // Both of these exist to make video playable on the CREATOR dashboard, which
  // only ever shows a creator their own partnership ads. Running them across the
  // whole account would mean Mux-encoding several hundred brand ads (real money,
  // per asset and per minute stored) and spending hundreds of /previews calls a
  // run — to serve a page that, by design, shows a thumbnail and only resolves a
  // player when someone actually clicks one ad.
  //
  // The Ad Performance page gets brand-ad playback lazily, on click, instead.
  const playable = Array.from(rowsById.values()).filter((r) => r.partnership);

  // processVideoUploads skips anything that already has a playback id, so this
  // is a no-op in steady state.
  const asAdResults = playable.map((r) => ({
    id: r.ad_id,
    effective_status: r.effective_status,
    video_id: r.video_id,
    ig_media_id: r.ig_media_id,
    // Required by the still/carousel guard in processVideoUploads — without it
    // every static IG ad gets re-probed against Meta on every run.
    ig_media_type: r.ig_media_type,
    mux_playback_id: r.mux_playback_id,
  })) as unknown as AdResult[];
  const needMux = asAdResults.filter(
    (a: any) =>
      !a.mux_playback_id &&
      a.effective_status === "ACTIVE" &&
      (a.video_id || (a.ig_media_id && a.ig_media_type !== "IMAGE" && a.ig_media_type !== "CAROUSEL_ALBUM")),
  ).length;
  console.log(`[meta-sync] partnership ads needing a Mux upload: ${needMux}`);
  if (!dry) await processVideoUploads(asAdResults, null, accessToken);
  for (const a of asAdResults) {
    const row = rowsById.get(String(a.id));
    if (row) row.mux_playback_id = a.mux_playback_id ?? row.mux_playback_id;
  }

  // Ads Mux can't serve (whitelisted IG videos deny the `source` download, and
  // carousels have no video) get Meta's own ad-preview iframe so they stay
  // playable on the creator dashboard. Preview URLs expire (~24h) so this
  // refreshes each run — measured at ~1 ad account-wide, since almost everything
  // already has Mux or is a static image.
  for (const row of dry ? [] : playable) {
    if (row.mux_playback_id || (row.carousel_urls && row.carousel_urls.length > 0)) continue;
    if (row.effective_status !== "ACTIVE") continue;
    // Single-image posts aren't playable — the hi-res thumbnail already IS the
    // creative; an embed would just put a misleading play button on it.
    if (row.ig_media_type === "IMAGE") continue;
    try {
      const pData = await metaFetch(
        `https://graph.facebook.com/${META_API_VERSION}/${row.ad_id}/previews?ad_format=INSTAGRAM_REELS&width=340&height=700&access_token=${accessToken}`,
      );
      const body = pData?.data?.[0]?.body || null;
      if (body) row.preview_html = body;
    } catch (err) {
      console.warn(`[meta-sync] preview fetch failed for ad ${row.ad_id}:`, err);
    }
  }

  // ── 6. Persist the dimension table ────────────────────────────────────────
  const dimRows = Array.from(rowsById.values());
  const seededCount = dimRows.filter((r) => r.creative_synced_at && !r.hook_line).length;
  console.log(
    `[meta-sync] meta_ads rows to write: ${dimRows.length} ` +
    `(${dimRows.filter((r) => r.partnership).length} partnership, ` +
    `${seededCount} carried forward from existing galleries)`,
  );
  if (dry) {
    console.log("[meta-sync] DRY RUN — nothing written");
    return;
  }
  const CHUNK = 200;
  let written = 0;
  let writeError: string | null = null;
  for (let i = 0; i < dimRows.length; i += CHUNK) {
    const slice = dimRows.slice(i, i + CHUNK);
    const { error } = await db.from("meta_ads").upsert(slice, { onConflict: "ad_id" });
    if (error) {
      writeError = error.message;
      console.error(`[meta-sync] meta_ads upsert FAILED after ${written} rows:`, error.message);
      break;
    }
    written += slice.length;
  }
  // Report what actually landed. An earlier version logged the full row count
  // unconditionally after this loop, so a failed upsert was immediately followed
  // by "651 rows upserted" — the gallery would silently be empty while the logs
  // claimed success.
  if (writeError) {
    console.error(`[meta-sync] meta_ads INCOMPLETE: ${written}/${dimRows.length} rows written`);
  } else {
    console.log(`[meta-sync] meta_ads: ${written} rows upserted`);
  }
}

/**
 * Build the per-handle gallery + daily rows from already-fetched account data.
 *
 * This is the direct replacement for fetchAdsForHandle: same output shape, zero
 * Meta calls. The gallery now comes from meta_ads (durable) rather than from a
 * fresh per-creator /ads sweep.
 */
async function buildHandleResult(
  db: any,
  handle: string,
  sweep: AccountSweep,
): Promise<SyncResult> {
  // Gallery: every ad whose name contains this handle. Read from meta_ads so an
  // ad keeps its creative even in a run where it had no spend.
  // Match on EITHER the raw Meta ad name (normal attribution) or the stored
  // handle. The second arm covers ads seeded from the old per-creator blobs,
  // whose stored name is a display name with the handle prefix already removed.
  const { data: adRows } = await db
    .from("meta_ads")
    .select(
      "ad_id, ad_name, status, effective_status, adset_name, thumbnail_url, video_id, mux_playback_id, ig_media_id, ig_media_type, carousel_urls, preview_html",
    )
    .or(`ad_name.ilike.%${handle}%,instagram_handle.eq.${handle}`);

  const ads: AdResult[] = ((adRows as any[]) || []).map((r) => ({
    id: String(r.ad_id),
    name: displayNameFor(r.ad_name, handle),
    status: r.status,
    effective_status: r.effective_status || r.status,
    adset_name: r.adset_name || null,
    // Metrics are placeholders here — enriched from the daily table in syncCreator.
    spend: "0.00",
    impressions: "0",
    outbound_clicks: 0,
    outbound_clicks_ctr: 0,
    purchase_value: 0,
    purchase_roas: null,
    video_3s_views: 0,
    video_thruplays: 0,
    thumbnailUrl: r.thumbnail_url || null,
    video_id: r.video_id || null,
    ig_media_id: r.ig_media_id || null,
    ig_media_type: r.ig_media_type || null,
    mux_playback_id: r.mux_playback_id || null,
    previewHtml: r.preview_html || null,
    carousel_urls: Array.isArray(r.carousel_urls) && r.carousel_urls.length > 0 ? r.carousel_urls : null,
  }));

  // Daily rows for this handle, sliced from the account sweep.
  const lower = handle.toLowerCase();
  const daily: DailyAdRow[] = sweep.daily
    .filter((d) => (d.ad_name || "").toLowerCase().includes(lower))
    .map((d) => ({
      ad_id: d.ad_id,
      date: d.date,
      spend: d.spend,
      impressions: d.impressions,
      outbound_clicks: d.outbound_clicks,
      purchase_value: d.purchase_value,
      purchase_roas: d.purchase_roas,
      video_3s_views: d.video_3s_views,
      video_thruplays: d.video_thruplays,
    }));

  // Lifetime totals: sum the per-ad lifetime sweep over this handle's ads. The
  // old code got this from a `level=account` call filtered to the handle; summing
  // per-ad rows over the same ad set yields the same figure, for one sweep
  // instead of one call per creator.
  const galleryIds = new Set(ads.map((a) => a.id));
  let totals: SyncResult["totals"] = null;
  if (sweep.lifetime.size > 0) {
    totals = { spend: 0, impressions: 0, purchase_value: 0 };
    for (const [adId, t] of sweep.lifetime) {
      if (!galleryIds.has(adId)) continue;
      totals.spend += t.spend;
      totals.impressions += t.impressions;
      totals.purchase_value += t.purchase_value;
    }
    totals.spend = Math.round(totals.spend * 100) / 100;
    totals.purchase_value = Math.round(totals.purchase_value * 100) / 100;
  }

  return {
    ads,
    totals,
    daily,
    adsLiveCount: ads.filter((a) => a.effective_status === "ACTIVE").length,
    // Preserve the old contract: a failed list sweep means "keep the stored
    // gallery", not "the creator has no ads".
    adsListError: sweep.listError,
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
  // Maps of existing mux_playback_ids so re-syncs never re-upload
  const existingByVideo = new Map<string, string>();
  const existingByIgMedia = new Map<string, string>();
  if (existingAds) {
    for (const ad of existingAds) {
      if (!ad.mux_playback_id) continue;
      if (ad.video_id) existingByVideo.set(ad.video_id, ad.mux_playback_id);
      if ((ad as any).ig_media_id) existingByIgMedia.set((ad as any).ig_media_id, ad.mux_playback_id);
    }
  }

  for (const ad of ads) {
    if (!ad.video_id && !ad.ig_media_id) continue;

    // Already uploaded — nothing to do. This guard is what makes the function
    // safe to call with records that carry their own stored playback id (as the
    // account-wide path does) rather than relying solely on the `existingAds`
    // lookup below. Without it, every ACTIVE video would be re-uploaded to Mux
    // on every run: ~115 duplicate assets a night, at real cost.
    if (ad.mux_playback_id) continue;

    // Nothing to upload: no video_id, and Instagram already told us the media is
    // a still or a carousel. Measured on live data, 41 ACTIVE partnership ads sit
    // in exactly this state (37 IMAGE, 4 CAROUSEL_ALBUM) — and without this the
    // loop re-asks Meta about every one of them on every run, only to discover
    // again that media_type !== VIDEO. Pure wasted calls against the rate limit.
    if (!ad.video_id && (ad.ig_media_type === "IMAGE" || ad.ig_media_type === "CAROUSEL_ALBUM")) {
      continue;
    }

    // Check if we already have a playback ID for this video
    const existing =
      (ad.video_id && existingByVideo.get(ad.video_id)) ||
      (ad.ig_media_id && existingByIgMedia.get(ad.ig_media_id)) ||
      null;
    if (existing) {
      ad.mux_playback_id = existing;
      continue;
    }

    // Only download videos for active ads
    if (ad.effective_status !== "ACTIVE") continue;

    try {
      // Uploaded-video ads expose a downloadable `source` on the video node.
      let sourceUrl: string | null = null;
      if (ad.video_id) {
        const sourceData = await metaFetch(
          `https://graph.facebook.com/${META_API_VERSION}/${ad.video_id}?fields=source&access_token=${accessToken}`
        );
        sourceUrl = sourceData?.source || null;
      }

      // Boosted IG collab posts deny `source` (error #10), but their media is
      // co-owned by our IG account so the media node's media_url is readable.
      if (!sourceUrl && ad.ig_media_id) {
        const mediaData = await metaFetch(
          `https://graph.facebook.com/${META_API_VERSION}/${ad.ig_media_id}?fields=media_type,media_url&access_token=${accessToken}`
        );
        if (mediaData?.media_type === "VIDEO" && mediaData.media_url) {
          sourceUrl = mediaData.media_url;
        }
      }

      if (!sourceUrl) {
        console.warn(`[meta-sync] No downloadable video for ad ${ad.id} (video ${ad.video_id || "-"}, ig media ${ad.ig_media_id || "-"})`);
        continue;
      }

      // Upload to Mux directly from the CDN URL
      const asset = await mux.video.assets.create({
        inputs: [{ url: sourceUrl }],
        playback_policies: ["public"],
        mp4_support: "capped-1080p",
      });

      const playbackId = asset.playback_ids?.[0]?.id || null;
      if (playbackId) {
        ad.mux_playback_id = playbackId;
        console.log(`[meta-sync] Uploaded video for ad ${ad.id} to Mux: ${playbackId}`);
      }
    } catch (err) {
      console.error(`[meta-sync] Failed to process video for ad ${ad.id}:`, err);
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
  video_3s_views: number;
  video_thruplays: number;
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
      .select("date, spend, impressions, ad_id, purchase_value, outbound_clicks, video_3s_views, video_thruplays")
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
        if (!a) { a = { spend: 0, impressions: 0, purchase_value: 0, outbound_clicks: 0, video_3s_views: 0, video_thruplays: 0 }; perAd.set(adId, a); }
        a.spend += spend;
        a.impressions += impressions;
        a.purchase_value += Number(r.purchase_value || 0);
        a.outbound_clicks += Number(r.outbound_clicks || 0);
        a.video_3s_views += Number(r.video_3s_views || 0);
        a.video_thruplays += Number(r.video_thruplays || 0);
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
  supabase?: any,
  // Pre-fetched account-wide data. syncAllCreators fetches this ONCE and passes
  // it to every creator, so a full run costs one set of sweeps instead of three
  // Meta calls per creator. Omitted for a single-creator manual re-sync, which
  // falls back to a handle-filtered sweep (same cost as the old targeted path).
  sweep?: AccountSweep,
): Promise<{ success: boolean; error?: string }> {
  const db = supabase || getServiceClient();
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!accessToken || !adAccountId) {
    return { success: false, error: "Meta API not configured" };
  }

  const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  try {
    // Fetch existing row first: it preserves historical monthly data and (on a
    // partial sync) the previous gallery. Creative preservation now lives in
    // meta_ads rather than being threaded through the fetch.
    const { data: existingRow } = await (db.from("creator_ad_performance") as any)
      .select("ads, monthly, totals")
      .eq("instagram_handle", handle)
      .single();

    // Standalone re-sync: sweep just this handle, then persist it the same way a
    // full run would, so meta_ads/meta_ad_daily stay current either way.
    let activeSweep = sweep;
    if (!activeSweep) {
      activeSweep = await fetchAccountSweep(accessToken, actId, {
        sinceDaysAgo: 35,
        handleFilter: handle,
      });
      await persistAccountSweep(
        db,
        activeSweep,
        [{ handle, influencerId }],
        accessToken,
        { creativeDeadline: Date.now() + 120_000 },
      );
    }

    const result = await buildHandleResult(db, handle, activeSweep);

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
        video_3s_views: d.video_3s_views,
        video_thruplays: d.video_thruplays,
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
      ad.video_3s_views = Math.round(agg.video_3s_views);
      ad.video_thruplays = Math.round(agg.video_thruplays);
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
  supabase?: any,
  // Stop starting new creators this long after the run begins, so the run ends
  // cleanly (status written, stoppedEarly recorded) instead of being killed by
  // the platform's function timeout (maxDuration 300s on the calling routes).
  // Headroom below 300s absorbs the in-flight creator finishing.
  timeBudgetMs = 240_000,
  // Days back from today to START the daily window.
  //
  // Default is 7, not 35. At ~14s per 500-row page this account needs ~20 pages
  // for 35 days (~280s) — over the route's budget — while 7 days is ~4 pages
  // (~60s) and always completes. Meta restates for ~28 days, but the vast
  // majority of movement is in the last few, so the routine run covers 7 and a
  // chunked reconcile pass (see untilDaysAgo) walks the older slices.
  windowDays = 7,
  // Days back from today to END the window (0 = today). Lets a reconcile run
  // fetch an OLDER slice — e.g. {windowDays: 35, untilDaysAgo: 21} covers days
  // 21-35 in ~4 pages — so the full restatement horizon gets refreshed across
  // several bounded runs instead of one that cannot finish.
  untilDaysAgo = 0,
): Promise<{
  synced: number;
  failed: number;
  stoppedEarly: boolean;
  errors: string[];
}> {
  const db = supabase || getServiceClient();

  // Track two groups: partners with ad-spend deals (invites) AND influencers
  // whitelisted directly in the directory (whitelisting_enabled) who never went
  // through the invite flow. The latter have no creators account and no invite,
  // so no commissions accrue — but their ads sync, which puts them on the
  // community whitelisting board and in Top Performing Ads.
  const { data: invites } = await (db.from("creator_invites") as any)
    .select("influencer_id, influencer:influencers!creator_invites_influencer_id_fkey(id, instagram_handle)")
    .eq("has_ad_spend", true);
  const { data: wlInfluencers } = await (db.from("influencers") as any)
    .select("id, instagram_handle")
    .eq("whitelisting_enabled", true)
    .is("whitelisting_archived_at", null)
    .not("instagram_handle", "is", null);

  const creators: { handle: string; influencerId: string }[] = [];
  const seenHandles = new Set<string>();
  for (const inv of invites || []) {
    const inf = inv.influencer as any;
    if (inf?.instagram_handle && !seenHandles.has(inf.instagram_handle.toLowerCase())) {
      seenHandles.add(inf.instagram_handle.toLowerCase());
      creators.push({ handle: inf.instagram_handle, influencerId: inf.id });
    }
  }
  for (const inf of wlInfluencers || []) {
    if (inf?.instagram_handle && !seenHandles.has(inf.instagram_handle.toLowerCase())) {
      seenHandles.add(inf.instagram_handle.toLowerCase());
      creators.push({ handle: inf.instagram_handle, influencerId: inf.id });
    }
  }

  // Least-recently-synced first. When a run can't finish everyone (time budget
  // or rate limit), processing order decides who goes stale — a fixed order
  // starves the same tail creators every night. Never-synced creators (no row
  // or null synced_at) sort to the very front.
  const { data: perfRows } = await (db.from("creator_ad_performance") as any)
    .select("instagram_handle, synced_at");
  const lastSynced = new Map<string, string>();
  for (const r of perfRows || []) {
    if (r?.instagram_handle) {
      lastSynced.set(r.instagram_handle.toLowerCase(), r.synced_at || "");
    }
  }
  creators.sort((a, b) =>
    (lastSynced.get(a.handle.toLowerCase()) || "").localeCompare(
      lastSynced.get(b.handle.toLowerCase()) || ""
    )
  );

  console.log(`[meta-sync] Starting sync for ${creators.length} creators`);

  // ── ONE account-wide fetch for the whole run ──────────────────────────────
  // This is the refactor's whole point. Previously each creator cost three
  // filtered Meta round-trips (ads list at limit=5, daily insights, lifetime
  // totals), so a run scaled linearly with creator count and reliably tripped
  // "User request limit reached". Now the account is swept once and every
  // creator is served from it locally — adding creators costs zero Meta calls.
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    return { synced: 0, failed: 0, stoppedEarly: false, errors: ["Meta API not configured"] };
  }
  const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;

  // Budget the run as a chain against ONE deadline, reserving the tail for the
  // per-creator pass.
  //
  // This was previously two independent budgets (sweep = 55% of the total,
  // creative = up to 120s from its own start) which could together exceed the
  // whole allowance. A real run did exactly that: sweep + creative took 262s of
  // a 240s budget, so the creator loop hit its deadline immediately and reported
  // "0 synced, 0 failed, stoppedEarly=true" — meta_ads refreshed while
  // creator_ad_performance, which payments read, silently went stale.
  //
  // The creator pass makes NO Meta calls now (it reads meta_ads and the daily
  // table), so it needs far less than the sweep — but it must never be the part
  // that gets squeezed out.
  const runDeadline = Date.now() + timeBudgetMs;
  const CREATOR_PASS_RESERVE_MS = 45_000;
  const CREATIVE_RESERVE_MS = 60_000;
  const sweepDeadline = runDeadline - CREATOR_PASS_RESERVE_MS - CREATIVE_RESERVE_MS;

  const sweep = await fetchAccountSweep(accessToken, actId, {
    sinceDaysAgo: windowDays,
    untilDaysAgo,
    deadline: sweepDeadline,
  });

  if (sweep.dailyError) {
    // Daily rows are payment-critical. Without them there is nothing to derive
    // monthly/MTD from, and continuing would write zeros over good data.
    console.error(`[meta-sync] Daily sweep failed, aborting run: ${sweep.dailyError}`);
    return { synced: 0, failed: 0, stoppedEarly: true, errors: [sweep.dailyError] };
  }

  // Reserve most of the budget for per-creator work; creative enrichment yields
  // first since it is the only part that can be safely deferred to a later run.
  await persistAccountSweep(db, sweep, creators, accessToken, {
    // Whatever is left after the sweep, minus the creator-pass reserve. Creative
    // enrichment is the only genuinely deferrable step — unenriched ads simply
    // get picked up next run — so it yields first.
    creativeDeadline: runDeadline - CREATOR_PASS_RESERVE_MS,
  });


  let synced = 0;
  let failed = 0;
  let stoppedEarly = false;
  const errors: string[] = [];

  for (const creator of creators) {
    if (Date.now() > runDeadline) {
      stoppedEarly = true;
      console.warn(
        `[meta-sync] Stopped early: time budget reached after ${synced} synced, ${failed} failed (${creators.length - synced - failed} not attempted; they go first next run)`
      );
      break;
    }
    try {
      const result = await syncCreator(creator.handle, creator.influencerId, db, sweep);
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
    // Surfaced so rate-limit regressions are visible in app_settings rather than
    // only as stale rows weeks later.
    meta_calls: metaCallCount(),
    window_days: windowDays,
    until_days_ago: untilDaysAgo,
  };

  await (db.from("app_settings") as any).upsert(
    {
      key: "meta_sync_status",
      value: JSON.stringify(syncStatus),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  // A run that swept Meta but updated nobody is a silent-staleness failure, not
  // a success: the account tables refresh while creator_ad_performance (which
  // payments read) stands still. Log it as an error so it is visible.
  if (synced === 0 && creators.length > 0) {
    console.error(
      `[meta-sync] NO CREATORS SYNCED (${creators.length} eligible, stoppedEarly=${stoppedEarly}). ` +
      `Account tables refreshed but creator_ad_performance is now STALE.`,
    );
  }
  console.log(
    `[meta-sync] Complete: ${synced} synced, ${failed} failed, stoppedEarly=${stoppedEarly}, ` +
    `${metaCallCount()} Meta calls`,
  );

  return { synced, failed, stoppedEarly, errors };
}

/**
 * Internal exports for verification harnesses only. Not used by app code —
 * persistAccountSweep is deliberately not part of the module's public surface,
 * but the first production run needs to be dry-run inspected before it writes.
 */
export const __testing = { persistAccountSweep, buildHandleResult, handlesMatching };

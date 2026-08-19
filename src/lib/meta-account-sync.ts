/**
 * Account-wide Meta fetching.
 *
 * The old shape made three FILTERED Meta round-trips per creator handle — an
 * /ads sweep paginated at limit=5, a daily /insights call filtered
 * `ad.name CONTAIN <handle>`, and a lifetime totals call filtered the same way.
 * At 35 creators that is ~125-150 calls per run, and it grows linearly with
 * every creator added. It was reliably tripping Meta's "User request limit
 * reached" (insights calls are scored heavily by their limiter), leaving some
 * creators a month stale.
 *
 * Meta will return the same data for the WHOLE ACCOUNT in one unfiltered sweep,
 * so this module fetches once and the caller slices it per handle locally.
 * Adding a creator now costs zero extra Meta calls.
 *
 * Three sweeps, each paginated:
 *   1. daily insights   — level=ad, time_increment=1  (~21 calls for 35 days)
 *   2. lifetime totals  — level=ad, date_preset=maximum (~2 calls)
 *   3. ad list          — status/name/campaign/adset, NO creative expansion (~6 calls)
 * Plus a creative multi-get for ad IDs we have never seen before (~1-3 calls).
 *
 * The creative expansion is the expensive part (it is what trips Meta's "reduce
 * the amount of data" limit), so it runs ONCE per ad id, ever — not every sync.
 */

import { metaFetch, META_API_VERSION, sumActionValue, pickActionValue } from "./meta-fetch";

/** One ad, one day. Mirrors the meta_ad_daily table. */
export interface AccountDailyRow {
  ad_id: string;
  ad_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  outbound_clicks: number;
  purchases: number;
  purchase_value: number;
  purchase_roas: number | null;
  video_3s_views: number;
  video_thruplays: number;
}

/** Mutable per-ad fields, refreshed every run from the cheap list sweep. */
export interface AdListRecord {
  ad_id: string;
  ad_name: string | null;
  status: string | null;
  effective_status: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  created_time: string | null;
}

/** Expensive creative fields, fetched once per ad id and then cached in meta_ads. */
export interface AdCreativeRecord {
  ad_id: string;
  thumbnail_url: string | null; // raw Meta CDN URL; caller mirrors it to R2
  video_id: string | null;
  ig_media_id: string | null;
  hook_line: string | null;
  format: string | null;
}

export interface LifetimeTotals {
  spend: number;
  impressions: number;
  purchase_value: number;
}

export interface AccountSweep {
  daily: AccountDailyRow[];
  /** ad_id → mutable list fields */
  list: Map<string, AdListRecord>;
  /** ad_id → lifetime spend/impressions/purchase_value */
  lifetime: Map<string, LifetimeTotals>;
  /**
   * Set when the ad-list sweep failed. Callers must preserve the previously
   * stored gallery rather than wiping it — same contract as the old
   * `adsListError`, which several dashboards depend on.
   */
  listError: string | null;
  /** Set when the daily insights sweep failed. */
  dailyError: string | null;
}

function graph(path: string, params: Record<string, string>, accessToken: string): string {
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  return `https://graph.facebook.com/${META_API_VERSION}/${path}?${qs.toString()}`;
}

/**
 * Follow paging.next until exhausted. Meta's `next` URLs already carry the
 * access token and cursor, so they are fetched verbatim.
 */
async function paginate(
  firstUrl: string,
  onPage: (rows: any[]) => void,
  label: string,
  // Wall-clock backstop, NOT the primary defence. Insights pages cost ~14s each
  // on this account, so a 35-day window runs ~20 pages / ~280s — close enough to
  // Vercel's 300s maxDuration to be killed mid-run.
  //
  // Truncating is genuinely lossy here: Meta returns insights DATE-ASCENDING, so
  // the last pages hold the most recent days — the ones that matter most — and
  // with no cursor persisted a truncated sweep would stop at the same place
  // every run and never reach them. The real fix is to keep each window small
  // enough to finish (see the routine 7-day window and the chunked reconcile
  // slices); this deadline only stops a pathological run from being killed
  // outright.
  deadline?: number,
): Promise<string | null> {
  let url: string | null = firstUrl;
  let pages = 0;
  let rows = 0;
  const started = Date.now();
  while (url) {
    const data: any = await metaFetch(url);
    if (data?.error) {
      const msg = `Meta API error: ${data.error.message}`;
      console.error(
        `[meta-account-sync] ${label} failed on page ${pages + 1} after ${rows} rows: ${msg}`,
      );
      return msg;
    }
    const batch = data?.data || [];
    onPage(batch);
    pages++;
    rows += batch.length;
    // Per-page progress. These sweeps replace dozens of small calls with a few
    // long paginated ones, so without this a slow or throttled run looks
    // identical to a hung one in the logs.
    console.log(
      `[meta-account-sync] ${label}: page ${pages}, ${batch.length} rows ` +
      `(${rows} total, ${((Date.now() - started) / 1000).toFixed(1)}s)`,
    );
    url = data?.paging?.next || null;

    if (url && deadline && Date.now() > deadline) {
      console.warn(
        `[meta-account-sync] ${label}: stopping at page ${pages} (time budget reached); ` +
        `remaining pages resume next run`,
      );
      break;
    }
  }
  console.log(
    `[meta-account-sync] ${label}: done — ${pages} page(s), ${rows} rows, ` +
    `${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  return null;
}

/**
 * Per-ad, per-day insights for the whole account.
 *
 * `windowDays` should cover Meta's restatement horizon (~28 days) plus a buffer;
 * older days never change and are already stored permanently. A short window
 * (e.g. 3 days) makes this cheap enough to run hourly.
 *
 * `handleFilter` restores the old per-handle CONTAIN filter. It exists only for
 * the single-creator manual re-sync path, where sweeping the whole account would
 * cost more than the targeted fetch it replaces.
 */
export async function fetchAccountDaily(
  accessToken: string,
  actId: string,
  window: { sinceDaysAgo: number; untilDaysAgo?: number },
  handleFilter?: string,
  deadline?: number,
): Promise<{ rows: AccountDailyRow[]; error: string | null }> {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  };

  const untilDaysAgo = window.untilDaysAgo ?? 0;

  // Split the window into sub-ranges and fetch the MOST RECENT one first.
  //
  // Meta returns insights date-ascending within a request, so a single wide
  // request that gets cut short loses the newest days — the ones that matter
  // most and the only ones still changing. Slicing newest-first inverts that:
  // if we run out of time, what we drop is old days, which are stable and will
  // be picked up by the next run anyway.
  //
  // Pages on this account are erratic (13s to 270s observed), so this is not a
  // theoretical concern.
  const SLICE_DAYS = 7;
  const slices: { since: string; until: string }[] = [];
  for (let end = untilDaysAgo; end < window.sinceDaysAgo; end += SLICE_DAYS) {
    const start = Math.min(end + SLICE_DAYS, window.sinceDaysAgo);
    slices.push({ since: iso(dayAgo(start)), until: iso(dayAgo(end)) });
  }

  const byKey = new Map<string, AccountDailyRow>();
  let error: string | null = null;

  for (const slice of slices) {
    if (deadline && Date.now() > deadline) {
      console.warn(
        `[meta-account-sync] daily: time budget reached, skipping slices older than ${slice.until}`,
      );
      break;
    }

    const params: Record<string, string> = {
      // campaign_*/adset_* ride along free at level=ad. Pulling them here is what
      // lets us skip a full account /ads sweep entirely — see fetchAdDetails.
      // `ad_name` is what lets us attribute ads to creator handles locally,
      // replacing 35 server-side CONTAIN filters.
      // `actions` carries both the purchase COUNT and 3-second video plays
      // (action_type "video_view" — the standalone video_3_sec field is deprecated).
      fields:
        "ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name," +
        "spend,impressions,outbound_clicks,actions,action_values," +
        "purchase_roas,video_thruplay_watched_actions",
      level: "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since: slice.since, until: slice.until }),
      limit: "500",
    };
    if (handleFilter) {
      params.filtering = JSON.stringify([
        { field: "ad.name", operator: "CONTAIN", value: handleFilter },
      ]);
    }

    const sliceError = await paginate(
      graph(`${actId}/insights`, params, accessToken),
      (rows) => {
        for (const row of rows) {
          const date = row.date_start?.substring(0, 10);
          const adId = row.ad_id ? String(row.ad_id) : null;
          if (!date || !adId) continue;
          // Dedupe on (ad_id, date) — the same key the table uses. Slice
          // boundaries overlap by a day, so this matters.
          byKey.set(`${adId}:${date}`, {
            ad_id: adId,
            ad_name: row.ad_name || null,
            campaign_id: row.campaign_id ? String(row.campaign_id) : null,
            campaign_name: row.campaign_name || null,
            adset_id: row.adset_id ? String(row.adset_id) : null,
            adset_name: row.adset_name || null,
            date,
            spend: parseFloat(row.spend || "0"),
            impressions: parseInt(row.impressions || "0", 10),
            outbound_clicks: Math.round(sumActionValue(row.outbound_clicks)),
            purchases: Math.round(pickActionValue(row.actions, "purchase") ?? 0),
            purchase_value: Math.round(sumActionValue(row.action_values, "purchase") * 100) / 100,
            purchase_roas: pickActionValue(row.purchase_roas, "purchase"),
            video_3s_views: Math.round(pickActionValue(row.actions, "video_view") ?? 0),
            video_thruplays: Math.round(
              pickActionValue(row.video_thruplay_watched_actions, "video_view") ?? 0,
            ),
          });
        }
      },
      `daily insights (${slice.since}→${slice.until}${handleFilter ? `, @${handleFilter}` : ", account-wide"})`,
      deadline,
    );

    // Record the first failure but keep trying older slices: they are
    // independent requests, and partial data beats none.
    if (sliceError && !error) error = sliceError;
  }

  return { rows: Array.from(byKey.values()), error };
}

/**
 * Lifetime per-ad totals. Summed per handle by the caller, this reproduces the
 * old per-creator `level=account&date_preset=maximum` filtered call — one sweep
 * instead of one call per creator.
 */
export async function fetchAccountLifetime(
  accessToken: string,
  actId: string,
  handleFilter?: string,
): Promise<{ totals: Map<string, LifetimeTotals>; error: string | null }> {
  const params: Record<string, string> = {
    fields: "ad_id,spend,impressions,action_values",
    level: "ad",
    date_preset: "maximum",
    limit: "500",
  };
  if (handleFilter) {
    params.filtering = JSON.stringify([
      { field: "ad.name", operator: "CONTAIN", value: handleFilter },
    ]);
  }

  const totals = new Map<string, LifetimeTotals>();
  const error = await paginate(
    graph(`${actId}/insights`, params, accessToken),
    (rows) => {
      for (const row of rows) {
        if (!row.ad_id) continue;
        totals.set(String(row.ad_id), {
          spend: parseFloat(row.spend || "0"),
          impressions: parseInt(row.impressions || "0", 10),
          purchase_value: Math.round(sumActionValue(row.action_values, "purchase") * 100) / 100,
        });
      }
    },
    "lifetime totals",
  );

  return { totals, error };
}

/**
 * Every currently-ACTIVE ad, in one filtered call.
 *
 * Scoping the sweep to "ads with delivery in the window" would silently drop an
 * ad that is live but has not spent yet — and `api/creator/top-ads` deliberately
 * keeps those so a creator's just-launched ads never vanish from their
 * dashboard. Filtering server-side on effective_status returns only the live
 * set (a few hundred, not 7,600), so this costs ~1 call and closes that gap.
 */
export async function fetchActiveAds(
  accessToken: string,
  actId: string,
  handleFilter?: string,
): Promise<{ list: Map<string, AdListRecord>; error: string | null }> {
  const filtering: any[] = [
    { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
  ];
  if (handleFilter) {
    filtering.push({ field: "name", operator: "CONTAIN", value: handleFilter });
  }

  const list = new Map<string, AdListRecord>();
  const error = await paginate(
    graph(
      `${actId}/ads`,
      {
        fields: "name,status,effective_status,created_time",
        filtering: JSON.stringify(filtering),
        limit: "500",
      },
      accessToken,
    ),
    (rows) => {
      for (const ad of rows) {
        if (!ad?.id) continue;
        list.set(String(ad.id), {
          ad_id: String(ad.id),
          ad_name: ad.name || null,
          status: ad.status || null,
          effective_status: ad.effective_status || ad.status || null,
          campaign_id: null,
          campaign_name: null,
          adset_id: null,
          adset_name: null,
          created_time: ad.created_time || null,
        });
      }
    },
    "active ads",
  );

  return { list, error };
}

/**
 * Status + launch date for SPECIFIC ad ids, via multi-get.
 *
 * An earlier version of this swept the whole account's /ads edge. That was a
 * mistake and verification caught it: this account holds **7,600 ads**, so even
 * at limit=100 the sweep needed 77+ pages and tripped "User request limit
 * reached" — worse than the per-creator code it was replacing.
 *
 * Only ~500 ads have delivery in a given month, and those are the only ones the
 * dashboards can show. So the daily insights sweep decides the ad set, and this
 * fetches details for just those ids: ~10 calls instead of ~77, and meta_ads
 * never fills up with 7,000 dormant ads.
 *
 * These fields are mutable (ads get paused), so unlike creative they refresh
 * every run — but only for ads currently in the window.
 */
export async function fetchAdDetails(
  accessToken: string,
  adIds: string[],
  batchSize = 50,
): Promise<{ list: Map<string, AdListRecord>; error: string | null }> {
  const list = new Map<string, AdListRecord>();
  if (adIds.length === 0) return { list, error: null };

  let error: string | null = null;
  for (let i = 0; i < adIds.length; i += batchSize) {
    const batch = adIds.slice(i, i + batchSize);
    const url = graph(
      "",
      { ids: batch.join(","), fields: "id,name,status,effective_status,created_time" },
      accessToken,
    ).replace("/?", "?");
    const data: any = await metaFetch(url);

    if (data?.error) {
      // Record the failure but keep going: a partial status refresh is far better
      // than none, and callers treat a set error as "preserve stored gallery".
      error = `Meta API error: ${data.error.message}`;
      console.error(`[meta-account-sync] ad details batch failed: ${error}`);
      continue;
    }

    for (const adId of batch) {
      const ad = data?.[adId];
      if (!ad) continue;
      list.set(adId, {
        ad_id: adId,
        ad_name: ad.name || null,
        status: ad.status || null,
        effective_status: ad.effective_status || ad.status || null,
        campaign_id: null, // filled from the insights rows, which carry them free
        campaign_name: null,
        adset_id: null,
        adset_name: null,
        created_time: ad.created_time || null,
      });
    }
  }

  console.log(`[meta-account-sync] ad details: ${list.size}/${adIds.length} ads`);
  return { list, error };
}

/**
 * Creative fields for specific ad ids, via multi-get.
 *
 * Called ONLY for ads with no `creative_synced_at` in meta_ads, so it costs
 * roughly one call a day at current launch rates rather than running over the
 * whole account every sync.
 *
 * Batches are small (10) because this carries the heavy creative expansion; on a
 * "reduce the amount of data" style failure the batch is split and retried so one
 * awkward ad cannot blank out nine healthy ones.
 *
 * thumbnail_width/height ask for a real-size creative thumbnail rather than
 * Meta's 64x64 default (the old source of blurry previews).
 */
export async function fetchAdCreatives(
  accessToken: string,
  adIds: string[],
  batchSize = 10,
): Promise<Map<string, AdCreativeRecord>> {
  const out = new Map<string, AdCreativeRecord>();
  if (adIds.length === 0) return out;

  const fields =
    "id,creative.thumbnail_width(1080).thumbnail_height(1080)" +
    "{thumbnail_url,image_url,effective_instagram_media_id," +
    "object_story_spec{link_data{message},video_data{message,image_url,video_id}}," +
    "asset_feed_spec{bodies,videos{video_id},images}}";

  async function run(batch: string[]): Promise<void> {
    if (batch.length === 0) return;
    const url = graph("", { ids: batch.join(","), fields }, accessToken).replace("/?", "?");
    const data: any = await metaFetch(url);

    if (data?.error) {
      // A single malformed/oversized ad poisons its whole batch. Split and retry
      // so the rest still land; give up on a lone ad rather than looping.
      if (batch.length > 1) {
        const mid = Math.ceil(batch.length / 2);
        console.warn(
          `[meta-account-sync] creative batch of ${batch.length} failed (${data.error.message}); splitting`,
        );
        await run(batch.slice(0, mid));
        await run(batch.slice(mid));
      } else {
        console.warn(
          `[meta-account-sync] creative fetch failed for ad ${batch[0]}: ${data.error.message}`,
        );
      }
      return;
    }

    for (const adId of batch) {
      const ad = data?.[adId];
      if (!ad) continue;
      const c = ad.creative || {};
      const oss = c.object_story_spec || {};
      const afs = c.asset_feed_spec || {};

      out.set(adId, {
        ad_id: adId,
        // Priority matches the old getBestImageUrl: video cover > full-res
        // static > thumbnail fallback.
        thumbnail_url: oss.video_data?.image_url || c.image_url || c.thumbnail_url || null,
        video_id: oss.video_data?.video_id
          ? String(oss.video_data.video_id)
          : afs.videos?.[0]?.video_id
            ? String(afs.videos[0].video_id)
            : null,
        ig_media_id: c.effective_instagram_media_id ? String(c.effective_instagram_media_id) : null,
        // The hook line shown over performance cards. Ads built in our own
        // launcher also have this in ad_drafts.copy.primaryText; this covers
        // ads created directly in Ads Manager.
        hook_line:
          oss.video_data?.message || oss.link_data?.message || afs.bodies?.[0]?.text || null,
        format: deriveFormat(afs, oss),
      });
    }
  }

  for (let i = 0; i < adIds.length; i += batchSize) {
    await run(adIds.slice(i, i + batchSize));
  }
  return out;
}

/**
 * Best-effort creative format for the card badge.
 *
 * Meta does not expose the placement aspect ratios directly, so this infers from
 * asset counts: a creative carrying more than one video/image is a multi-ratio
 * (feed + vertical) build. Returns null when it cannot tell, and callers render
 * no badge rather than a wrong one. Carousels are labelled by the caller, which
 * is the layer that knows whether carousel children were actually found.
 */
function deriveFormat(afs: any, oss: any): string | null {
  const videos = Array.isArray(afs?.videos) ? afs.videos.length : 0;
  const images = Array.isArray(afs?.images) ? afs.images.length : 0;
  if (videos + images > 1) return "1:1 + 9:16";
  if (videos === 1 || oss?.video_data?.video_id) return "9:16";
  if (images === 1 || oss?.link_data) return "1:1";
  return null;
}

/**
 * One account-wide fetch covering everything the sync needs.
 *
 * Pass `handleFilter` to reproduce the old targeted behaviour for a
 * single-creator manual re-sync; omit it for the full run.
 */
export async function fetchAccountSweep(
  accessToken: string,
  actId: string,
  opts: {
    /** Days back from today to start the daily window. */
    sinceDaysAgo: number;
    /** Days back from today to END the window (0 = today). Used to fetch an
     *  older slice during a chunked reconcile pass. */
    untilDaysAgo?: number;
    handleFilter?: string;
    deadline?: number;
  },
): Promise<AccountSweep> {
  const { sinceDaysAgo, untilDaysAgo, handleFilter, deadline } = opts;

  // The daily sweep runs FIRST and defines the working set: every ad with
  // delivery in the window. Everything downstream is scoped to those ids, which
  // is what keeps this cheap on an account with thousands of dormant ads.
  // Reserve roughly a third of the budget for the cheaper sweeps that follow, so
  // a long daily pass can never starve status/lifetime entirely.
  const dailyDeadline = deadline ? deadline - (deadline - Date.now()) / 3 : undefined;
  const daily = await fetchAccountDaily(
    accessToken,
    actId,
    { sinceDaysAgo, untilDaysAgo },
    handleFilter,
    dailyDeadline,
  );
  const lifetime = await fetchAccountLifetime(accessToken, actId, handleFilter);

  // Live ads (including ones that have not spent yet) come free from one
  // filtered call; only ads that spent but are no longer active need a lookup.
  const active = await fetchActiveAds(accessToken, actId, handleFilter);
  const windowAdIds = Array.from(new Set(daily.rows.map((r) => r.ad_id)));
  const needDetail = windowAdIds.filter((id) => !active.list.has(id));
  const details = await fetchAdDetails(accessToken, needDetail);

  // Merge: active set wins on status (it is authoritative and fresher).
  for (const [adId, rec] of active.list) details.list.set(adId, rec);

  // Campaign/ad set names come from the insights rows (free there), so merge them
  // onto the detail records rather than paying for a second expansion.
  for (const row of daily.rows) {
    const rec = details.list.get(row.ad_id);
    if (!rec) continue;
    rec.campaign_id ??= row.campaign_id;
    rec.campaign_name ??= row.campaign_name;
    rec.adset_id ??= row.adset_id;
    rec.adset_name ??= row.adset_name;
    rec.ad_name ??= row.ad_name;
  }

  return {
    daily: daily.rows,
    list: details.list,
    lifetime: lifetime.totals,
    listError: details.error || active.error,
    dailyError: daily.error,
  };
}

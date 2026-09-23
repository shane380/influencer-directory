// Server-side Meta Marketing API client for the Ad Launcher (/ads).
// Field shapes verified against developers.facebook.com v25.0 docs, July 2026.
import type {
  AdCopy,
  AdsetSummary,
  AdsetTemplate,
  CampaignSummary,
  CreateAdsetRequest,
  DraftAsset,
  IgMediaItem,
  IgMediaResponse,
  LauncherDefaults,
  PartnerIdentity,
  TargetsResponse,
} from "@/types/meta-ads";

const META_API_VERSION = "v25.0";
const GRAPH = `https://graph.facebook.com/${META_API_VERSION}`;

export class MetaApiError extends Error {
  code: number | null;
  userMessage: string;

  constructor(message: string, code: number | null, userMessage?: string) {
    super(message);
    this.code = code;
    this.userMessage = userMessage || message;
  }
}

function getEnv() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    throw new MetaApiError("META_ACCESS_TOKEN / META_AD_ACCOUNT_ID not configured", null);
  }
  const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
  return { accessToken, actId };
}

function extractError(data: any): MetaApiError {
  const err = data?.error || {};
  // error_user_title/msg are Meta's human-readable versions — far more
  // actionable than the generic message, so prefer them for display.
  const userMessage = err.error_user_title
    ? `${err.error_user_title}: ${err.error_user_msg || ""}`.trim()
    : err.message || "Unknown Meta API error";
  return new MetaApiError(err.message || userMessage, err.code ?? null, userMessage);
}

async function graphGet(path: string, params: Record<string, string> = {}): Promise<any> {
  const { accessToken } = getEnv();
  const qs = new URLSearchParams({ ...params, access_token: accessToken });
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
  const data = await res.json();
  if (data.error) throw extractError(data);
  return data;
}

async function graphPost(path: string, params: Record<string, any>): Promise<any> {
  const { accessToken } = getEnv();
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  body.set("access_token", accessToken);
  const res = await fetch(`${GRAPH}/${path}`, { method: "POST", body });
  const data = await res.json();
  if (data.error) throw extractError(data);
  return data;
}

export const CTA_OPTIONS = [
  { value: "SHOP_NOW", label: "Shop now" },
  { value: "LEARN_MORE", label: "Learn more" },
  { value: "ORDER_NOW", label: "Order now" },
  { value: "GET_OFFER", label: "Get offer" },
  { value: "SIGN_UP", label: "Sign up" },
  { value: "SUBSCRIBE", label: "Subscribe" },
  { value: "CONTACT_US", label: "Contact us" },
];

export async function listTargets(): Promise<TargetsResponse> {
  const { actId } = getEnv();
  const data = await graphGet(`${actId}/campaigns`, {
    fields:
      "id,name,status,effective_status,objective," +
      "adsets.limit(100){id,name,status,effective_status,daily_budget,lifetime_budget}",
    filtering: JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
    ]),
    limit: "100",
  });

  const campaigns: CampaignSummary[] = (data.data || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    effective_status: c.effective_status,
    objective: c.objective || null,
    adsets: (c.adsets?.data || [])
      .filter((a: any) => ["ACTIVE", "PAUSED"].includes(a.effective_status))
      .map((a: any) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        effective_status: a.effective_status,
        daily_budget: a.daily_budget || null,
        lifetime_budget: a.lifetime_budget || null,
      })),
  }));

  return { accountId: actId.replace(/^act_/, ""), campaigns };
}

// ---- Creating ad sets in an existing campaign ----
// New ad sets clone an existing one in the same campaign rather than asking
// for a full ad-set editor: in this account every whitelisting ad set is the
// same setup with a different name/country list. Only the fields that really
// vary are editable; everything else is copied verbatim from the source.

/**
 * Targeting keys we copy forward. A whitelist rather than a blanket copy —
 * reads echo back derived fields (age_range, targeting_optimization_types)
 * that the write endpoint rejects.
 */
const WRITABLE_TARGETING_KEYS = [
  "age_min",
  "age_max",
  "genders",
  "geo_locations",
  "excluded_geo_locations",
  "targeting_automation",
  "targeting_relaxation_types",
  "publisher_platforms",
  "facebook_positions",
  "instagram_positions",
  "messenger_positions",
  "threads_positions",
  "audience_network_positions",
  "device_platforms",
  "user_os",
  "user_device",
  "locales",
  "flexible_spec",
  "exclusions",
  "interests",
  "behaviors",
  "custom_audiences",
  "excluded_custom_audiences",
  "brand_safety_content_filter_levels",
] as const;

function sanitizeTargeting(targeting: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of WRITABLE_TARGETING_KEYS) {
    if (targeting?.[key] !== undefined && targeting[key] !== null) out[key] = targeting[key];
  }

  // Meta now rejects explore_home without explore ("You Must Also Select
  // Instagram Explore"), but happily *returns* that pair on ad sets created
  // before the rule — so a verbatim clone of an older ad set fails. Add the
  // implied placement rather than dropping the one that was chosen.
  const ig: string[] = out.instagram_positions || [];
  if (ig.includes("explore_home") && !ig.includes("explore")) {
    out.instagram_positions = [...ig, "explore"];
  }

  return out;
}

/**
 * Used only when the chosen campaign has no ad set to copy. Mirrors the
 * "Contrast Winners // CA + USA // incremental /# of conv //" ad set in the
 * whitelisting CBO — the setup every whitelisting ad set in this account uses.
 */
const FALLBACK_ADSET_BLUEPRINT: AdsetBlueprint = {
  optimizationGoal: "OFFSITE_CONVERSIONS",
  billingEvent: "IMPRESSIONS",
  bidStrategy: null,
  bidAmount: 7000,
  bidConstraints: null,
  dailyBudget: null,
  destinationType: null,
  promotedObject: { pixel_id: "680666762114076", custom_event_type: "PURCHASE" },
  attributionSpec: [
    { event_type: "CLICK_THROUGH", window_days: 7 },
    { event_type: "VIEW_THROUGH", window_days: 1 },
    { event_type: "ENGAGED_VIDEO_VIEW", window_days: 1 },
  ],
  targeting: {
    age_min: 18,
    age_max: 65,
    genders: [2],
    geo_locations: { countries: ["US", "CA"], location_types: ["home", "recent"] },
    targeting_automation: { advantage_audience: 1, individual_setting: { age: 1, gender: 1 } },
    publisher_platforms: ["instagram", "messenger", "threads"],
    instagram_positions: [
      "stream",
      "story",
      "reels",
      "explore_home",
      "profile_feed",
      "ig_search",
    ],
    messenger_positions: ["story"],
    threads_positions: ["threads_stream"],
    device_platforms: ["mobile", "desktop"],
  },
};

interface AdsetBlueprint {
  optimizationGoal: string;
  billingEvent: string;
  /**
   * Set on the ad set only under ABO — with campaign budget optimization the
   * strategy lives on the campaign and the ad set reads back null.
   */
  bidStrategy: string | null;
  bidAmount: number | null;
  /** ROAS-goal strategies bid via a roas_average_floor instead of bid_amount */
  bidConstraints: Record<string, any> | null;
  dailyBudget: number | null;
  destinationType: string | null;
  promotedObject: Record<string, any> | null;
  attributionSpec: any[] | null;
  targeting: Record<string, any>;
}

const ADSET_READ_FIELDS =
  "id,name,created_time,effective_status,optimization_goal,billing_event,bid_amount," +
  "daily_budget,destination_type,promoted_object,attribution_spec,targeting," +
  "bid_strategy,bid_constraints";

function toBlueprint(adset: any): AdsetBlueprint {
  const promoted = adset.promoted_object ? { ...adset.promoted_object } : null;
  // Read-only echo on promoted_object; the write endpoint rejects it.
  if (promoted) delete promoted.smart_pse_enabled;
  return {
    optimizationGoal: adset.optimization_goal || FALLBACK_ADSET_BLUEPRINT.optimizationGoal,
    billingEvent: adset.billing_event || FALLBACK_ADSET_BLUEPRINT.billingEvent,
    bidStrategy: adset.bid_strategy || null,
    bidAmount: adset.bid_amount ? Number(adset.bid_amount) : null,
    bidConstraints: adset.bid_constraints || null,
    dailyBudget: adset.daily_budget ? Number(adset.daily_budget) : null,
    // "UNDEFINED" is Meta's way of saying "no explicit destination".
    destinationType:
      adset.destination_type && adset.destination_type !== "UNDEFINED"
        ? adset.destination_type
        : null,
    promotedObject: promoted,
    attributionSpec: adset.attribution_spec || null,
    targeting: sanitizeTargeting(adset.targeting),
  };
}

/** Bid strategies that make a per-ad-set bid/cost cap mandatory. */
const BID_AMOUNT_STRATEGIES = ["COST_CAP", "LOWEST_COST_WITH_BID_CAP"];

/**
 * Under CBO the strategy is a campaign field; under ABO it is per ad set and
 * siblings routinely differ, so fall back to whichever one the source used.
 */
function effectiveBidStrategy(campaign: any, bp: AdsetBlueprint): string | null {
  return campaign.bid_strategy || bp.bidStrategy || null;
}

async function loadCampaignAndSource(campaignId: string, sourceAdsetId?: string | null) {
  const campaign = await graphGet(campaignId, {
    fields: "id,name,objective,status,daily_budget,lifetime_budget,bid_strategy",
  });

  const list = await graphGet(`${campaignId}/adsets`, {
    fields: ADSET_READ_FIELDS,
    limit: "100",
  });
  // Newest first — the most recent ad set is the one worth cloning.
  const adsets: any[] = (list.data || []).sort((a: any, b: any) =>
    String(b.created_time || "").localeCompare(String(a.created_time || ""))
  );
  const source =
    (sourceAdsetId && adsets.find((a) => String(a.id) === String(sourceAdsetId))) ||
    adsets.find((a) => a.effective_status === "ACTIVE") ||
    adsets[0] ||
    null;

  return { campaign, adsets, source };
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  CA: "Canada",
  AU: "Australia",
  GB: "United Kingdom",
  NZ: "New Zealand",
};

function describeBlueprint(bp: AdsetBlueprint): string[] {
  const lines: string[] = [];
  const goal = bp.optimizationGoal.replace(/_/g, " ").toLowerCase();
  lines.push(`Optimizing for ${goal}, billed on ${bp.billingEvent.toLowerCase()}`);
  if (bp.promotedObject?.pixel_id) {
    lines.push(
      `Pixel ${bp.promotedObject.pixel_id}` +
        (bp.promotedObject.custom_event_type
          ? ` · ${String(bp.promotedObject.custom_event_type).toLowerCase()} event`
          : "")
    );
  }
  if (bp.attributionSpec?.length) {
    const parts = bp.attributionSpec.map((a: any) => {
      const label =
        a.event_type === "CLICK_THROUGH"
          ? "click"
          : a.event_type === "VIEW_THROUGH"
            ? "view"
            : "video view";
      return `${a.window_days}-day ${label}`;
    });
    lines.push(`Attribution: ${parts.join(", ")}`);
  }
  if (bp.bidConstraints?.roas_average_floor) {
    lines.push(`Minimum ROAS floor ${Number(bp.bidConstraints.roas_average_floor) / 10000}`);
  }
  const t = bp.targeting;
  const gender =
    Array.isArray(t.genders) && t.genders.length === 1
      ? t.genders[0] === 1
        ? "Men"
        : "Women"
      : "All genders";
  lines.push(`${gender}, ages ${t.age_min ?? 18}–${t.age_max ?? 65}`);
  if (t.publisher_platforms?.length) {
    lines.push(`Platforms: ${t.publisher_platforms.join(", ")}`);
  }
  if (t.instagram_positions?.length) {
    lines.push(`Instagram placements: ${t.instagram_positions.join(", ")}`);
  }
  if (t.targeting_automation?.advantage_audience === 1) {
    lines.push("Advantage+ audience on");
  }
  const audiences = (t.custom_audiences || []).length;
  const excluded = (t.excluded_custom_audiences || []).length;
  if (audiences || excluded) {
    lines.push(`${audiences} custom audience(s), ${excluded} excluded`);
  }
  return lines;
}

/** Everything the "New ad set" dialog needs to prefill itself. */
export async function getAdsetTemplate(
  campaignId: string,
  sourceAdsetId?: string | null
): Promise<AdsetTemplate> {
  const { campaign, adsets, source } = await loadCampaignAndSource(campaignId, sourceAdsetId);
  const bp = source ? toBlueprint(source) : FALLBACK_ADSET_BLUEPRINT;

  const cbo = Boolean(campaign.daily_budget || campaign.lifetime_budget);
  const bidStrategy = effectiveBidStrategy(campaign, bp);
  const requiresBidAmount = Boolean(bidStrategy && BID_AMOUNT_STRATEGIES.includes(bidStrategy));

  return {
    campaignId: String(campaign.id),
    campaignName: campaign.name || "",
    objective: campaign.objective || null,
    campaignBudgetOptimization: cbo,
    bidStrategy,
    requiresBidAmount,
    sourceAdsetId: source ? String(source.id) : null,
    sourceAdsetName: source?.name || null,
    sourceOptions: adsets.map((a) => ({ id: String(a.id), name: a.name || a.id })),
    name: source?.name || "",
    countries: bp.targeting.geo_locations?.countries || [],
    bidAmount: requiresBidAmount ? bp.bidAmount : null,
    dailyBudget: cbo ? null : bp.dailyBudget,
    inherited: describeBlueprint(bp),
  };
}

/**
 * Create an ad set in an existing campaign, cloning a sibling's setup.
 * Only name, countries, bid and budget come from the caller — the rest is
 * re-read from Meta at create time so a stale client can't smuggle settings in.
 */
export async function createAdset(
  input: CreateAdsetRequest,
  opts: { validateOnly?: boolean } = {}
): Promise<AdsetSummary> {
  const { actId } = getEnv();
  const name = input.name?.trim();
  if (!name) throw new MetaApiError("Give the ad set a name", null);
  const countries = (input.countries || []).map((c) => c.trim().toUpperCase()).filter(Boolean);
  if (!countries.length) throw new MetaApiError("Pick at least one country", null);

  const { campaign, source } = await loadCampaignAndSource(input.campaignId, input.sourceAdsetId);
  const bp = source ? toBlueprint(source) : FALLBACK_ADSET_BLUEPRINT;

  const cbo = Boolean(campaign.daily_budget || campaign.lifetime_budget);
  const bidStrategy = effectiveBidStrategy(campaign, bp);
  const requiresBidAmount = Boolean(bidStrategy && BID_AMOUNT_STRATEGIES.includes(bidStrategy));

  const targeting = {
    ...bp.targeting,
    geo_locations: {
      ...(bp.targeting.geo_locations || {}),
      countries,
    },
  };

  const params: Record<string, any> = {
    name,
    campaign_id: input.campaignId,
    optimization_goal: bp.optimizationGoal,
    billing_event: bp.billingEvent,
    targeting,
    status: input.status === "ACTIVE" ? "ACTIVE" : "PAUSED",
  };
  if (bp.promotedObject) params.promoted_object = bp.promotedObject;
  if (bp.attributionSpec) params.attribution_spec = bp.attributionSpec;
  if (bp.destinationType) params.destination_type = bp.destinationType;

  // Only ABO ad sets carry their own strategy; sending one under CBO is an error.
  if (!cbo && bp.bidStrategy) params.bid_strategy = bp.bidStrategy;
  if (bp.bidConstraints) params.bid_constraints = bp.bidConstraints;

  if (requiresBidAmount) {
    const bid = input.bidAmount ?? bp.bidAmount;
    if (!bid || bid <= 0) {
      throw new MetaApiError(`This ad set bids with ${bidStrategy} — set a cost cap`, null);
    }
    params.bid_amount = Math.round(bid);
  }

  // Under campaign budget optimization the budget lives on the campaign;
  // sending one here is an error, not an override.
  if (!cbo) {
    const budget = input.dailyBudget ?? bp.dailyBudget;
    if (!budget || budget <= 0) {
      throw new MetaApiError("This campaign has no shared budget — set a daily budget", null);
    }
    params.daily_budget = Math.round(budget);
  }

  if (opts.validateOnly) params.execution_options = ["validate_only"];

  const created = await graphPost(`${actId}/adsets`, params);

  return {
    id: String(created.id || ""),
    name,
    status: params.status,
    effective_status: params.status,
    daily_budget: params.daily_budget ? String(params.daily_budget) : null,
    lifetime_budget: null,
  };
}

export async function getDefaults(): Promise<LauncherDefaults> {
  const { actId } = getEnv();

  let pageId: string | null = null;
  let pageName: string | null = null;
  let pageIgId: string | null = null;
  let instagramUserId: string | null = null;
  let suggestedLink: string | null = null;
  let suggestedUrlTags: string | null = null;
  const partnerMap = new Map<string, PartnerIdentity>();
  const diagnostics: string[] = [];
  const errMsg = (err: unknown) =>
    err instanceof MetaApiError ? err.userMessage : err instanceof Error ? err.message : String(err);

  // Brand identity comes from the page granted to the token. Pages seen on
  // existing ads are often creators' pages (whitelisting ads run under the
  // creator's identity), so ad metadata is only a last-resort fallback.
  try {
    const pages = await graphGet("me/accounts", { fields: "id,name", limit: "5" });
    const granted = pages.data?.[0];
    if (granted?.id) {
      pageId = String(granted.id);
      pageName = granted.name || null;
      const g = await graphGet(pageId, { fields: "instagram_business_account" });
      if (g.instagram_business_account?.id) {
        pageIgId = String(g.instagram_business_account.id);
        instagramUserId = pageIgId;
      }
    }
  } catch (err) {
    diagnostics.push(`granted page: ${errMsg(err)}`);
  }

  try {
    const ads = await graphGet(`${actId}/ads`, {
      fields: "id,name,created_time,creative{object_story_spec,url_tags}",
      limit: "50",
    });
    for (const ad of ads.data || []) {
      const spec = ad.creative?.object_story_spec;
      if (!spec) continue;
      if (!pageId && spec.page_id) pageId = String(spec.page_id);
      if (!instagramUserId && spec.instagram_user_id) {
        instagramUserId = String(spec.instagram_user_id);
      }
      const link = spec.link_data?.link || spec.video_data?.call_to_action?.value?.link;
      if (!suggestedLink && link) suggestedLink = link;
      if (!suggestedUrlTags && ad.creative?.url_tags) suggestedUrlTags = ad.creative.url_tags;
    }
  } catch (err) {
    console.warn("[meta-ads] Failed to scan recent ads for defaults:", err);
    diagnostics.push(`ads scan: ${errMsg(err)}`);
  }

  // Partnership sponsors seen on existing partnership ads. Read separately —
  // instagram_branded_content is not returned inside object_story_spec.
  try {
    const ads = await graphGet(`${actId}/ads`, {
      fields: "id,name,creative{instagram_branded_content}",
      limit: "50",
    });
    for (const ad of ads.data || []) {
      const sponsorId = ad.creative?.instagram_branded_content?.sponsor_id;
      if (sponsorId && !partnerMap.has(String(sponsorId))) {
        partnerMap.set(String(sponsorId), {
          sponsorId: String(sponsorId),
          label: adNameToPartnerLabel(ad.name) || String(sponsorId),
        });
      }
    }
  } catch (err) {
    console.warn("[meta-ads] Failed to scan for partnership sponsors:", err);
    diagnostics.push(`sponsor scan: ${errMsg(err)}`);
  }

  // Every creator with account-level partnership permission — the same list
  // Ads Manager's "Select partnership" dialog shows. Try each brand IG
  // candidate (page-linked first, then the identity seen on recent ads);
  // the recent-ads sponsor scan above stays as a last-resort fallback.
  const brandIgCandidates = [...new Set([pageIgId, instagramUserId].filter(Boolean))] as string[];
  for (const igId of brandIgCandidates) {
    try {
      const perms = await graphGet(`${igId}/branded_content_ad_permissions`, {
        limit: "100",
      });
      let added = 0;
      for (const p of perms.data || []) {
        if (String(p.permission_status || "").toLowerCase() !== "approved") continue;
        if (!p.creator_ig_id) continue;
        partnerMap.set(String(p.creator_ig_id), {
          sponsorId: String(p.creator_ig_id),
          label: p.creator_username ? `@${p.creator_username}` : String(p.creator_ig_id),
        });
        added++;
      }
      if (added > 0) break;
      diagnostics.push(`partnership permissions on ${igId}: 0 approved records`);
    } catch (err) {
      console.warn("[meta-ads] Failed to list partnership permissions:", err);
      diagnostics.push(`partnership permissions on ${igId}: ${errMsg(err)}`);
    }
  }

  // The brand's own accounts can show up as "sponsors" on creator-primary
  // whitelisting ads — they aren't pickable partners.
  for (const ownId of brandIgCandidates) partnerMap.delete(ownId);

  let canPublish = false;
  try {
    const perms = await graphGet("me/permissions");
    canPublish = (perms.data || []).some(
      (p: any) => p.permission === "ads_management" && p.status === "granted"
    );
  } catch {
    // Leave canPublish false; the UI shows the token banner.
  }

  return {
    accountId: actId.replace(/^act_/, ""),
    pageId,
    pageName,
    instagramUserId,
    partners: Array.from(partnerMap.values()),
    suggestedLink,
    suggestedUrlTags,
    ctaOptions: CTA_OPTIONS,
    canPublish,
    diagnostics,
  };
}

/** Best-effort creator handle out of an ad name like "wl-@handle-june-v2". */
function adNameToPartnerLabel(name: string | undefined): string | null {
  const m = name?.match(/@[\w.]+/);
  return m ? m[0] : null;
}

/** The brand IG account linked to the page granted to the token. */
async function resolveBrandIgUserId(): Promise<string> {
  const pages = await graphGet("me/accounts", { fields: "id,name", limit: "5" });
  const pageId = pages.data?.[0]?.id;
  if (!pageId) {
    throw new MetaApiError("No Facebook Page is granted to the Meta access token", null);
  }
  const page = await graphGet(String(pageId), { fields: "instagram_business_account" });
  const igId = page.instagram_business_account?.id;
  if (!igId) {
    throw new MetaApiError("The brand page has no linked Instagram business account", null);
  }
  return String(igId);
}

// ---- Partnership ads access (account-level) ----
// Same edge the partner picker reads; POST sends the in-app request the
// Ads Manager "Add partners" flow would. Docs: instagram-platform/
// instagram-api-with-facebook-login/partnership-ads/account-level-permissioning
export interface PartnershipPermissionRecord {
  creator_ig_id: string | null;
  creator_username: string | null;
  permission_status: string;
  permission_url: string | null;
}

export async function listPartnershipPermissions(): Promise<PartnershipPermissionRecord[]> {
  const igId = await resolveBrandIgUserId();
  const res = await graphGet(`${igId}/branded_content_ad_permissions`, { limit: "200" });
  return (res.data || []).map((p: any) => ({
    creator_ig_id: p.creator_ig_id ? String(p.creator_ig_id) : null,
    creator_username: p.creator_username ? String(p.creator_username) : null,
    permission_status: String(p.permission_status || "UNKNOWN").toUpperCase(),
    permission_url: p.permission_url ? String(p.permission_url) : null,
  }));
}

export async function requestPartnershipPermission(username: string): Promise<any> {
  const igId = await resolveBrandIgUserId();
  return graphPost(`${igId}/branded_content_ad_permissions`, {
    creator_instagram_username: username,
  });
}

const IG_MEDIA_FIELDS =
  "id,media_type,media_product_type,media_url,thumbnail_url,permalink,caption,timestamp";

/** List the brand IG account's organic posts (newest first, paginated). */
export async function listInstagramMedia(after?: string | null): Promise<IgMediaResponse> {
  const igUserId = await resolveBrandIgUserId();
  const params: Record<string, string> = { limit: "24" };
  if (after) params.after = after;

  // boost_eligibility_info needs extra token capabilities on some setups —
  // fall back to the plain field list rather than failing the whole picker.
  let data: any;
  try {
    data = await graphGet(`${igUserId}/media`, {
      ...params,
      fields: `${IG_MEDIA_FIELDS},boost_eligibility_info`,
    });
  } catch {
    data = await graphGet(`${igUserId}/media`, { ...params, fields: IG_MEDIA_FIELDS });
  }

  const media: IgMediaItem[] = (data.data || []).map((m: any) => ({
    id: String(m.id),
    mediaType: m.media_type,
    mediaProductType: m.media_product_type || null,
    mediaUrl: m.media_url || null,
    thumbnailUrl: m.thumbnail_url || null,
    permalink: m.permalink || null,
    caption: m.caption || null,
    timestamp: m.timestamp || null,
    eligibleToBoost:
      typeof m.boost_eligibility_info?.eligible_to_boost === "boolean"
        ? m.boost_eligibility_info.eligible_to_boost
        : null,
  }));

  return { media, nextCursor: data.paging?.cursors?.after && data.paging?.next ? data.paging.cursors.after : null };
}

/** Download a file from R2 and register it as an ad image; returns the hash. */
async function uploadImage(fileUrl: string): Promise<string> {
  const { actId, accessToken } = getEnv();
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new MetaApiError(`Could not fetch creative from storage (${fileRes.status})`, null);
  const buffer = Buffer.from(await fileRes.arrayBuffer());

  const form = new FormData();
  form.set("access_token", accessToken);
  const contentType = fileRes.headers.get("content-type") || "image/jpeg";
  // Filename must be clean (no query string) and carry a type Meta accepts.
  let filename = (fileUrl.split("/").pop() || "creative").split("?")[0];
  if (!/\.(jpe?g|png|webp|gif|bmp|tiff?)$/i.test(filename)) {
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    filename = `${filename || "creative"}.${ext}`;
  }
  form.set(filename, new Blob([new Uint8Array(buffer)], { type: contentType }), filename);

  const res = await fetch(`${GRAPH}/${actId}/adimages`, { method: "POST", body: form });
  const data = await res.json();
  if (data.error) throw extractError(data);
  const first = Object.values(data.images || {})[0] as any;
  if (!first?.hash) throw new MetaApiError("adimages returned no hash", null);
  return first.hash;
}

/** Register a video by URL (Meta pulls it from R2); returns the video id. */
async function uploadVideo(fileUrl: string, name: string): Promise<string> {
  const { actId } = getEnv();
  const data = await graphPost(`${actId}/advideos`, { file_url: fileUrl, name });
  if (!data.id) throw new MetaApiError("advideos returned no id", null);
  return data.id;
}

/**
 * Poll until the video finishes processing.
 *
 * Two behaviours here are deliberate and were both learned from a real failure:
 *
 * 1. A timeout THROWS. This previously logged a warning and carried on, which
 *    meant a slow transcode went straight into the adcreatives call with a video
 *    Meta could not use yet — and Meta answers that with "Something went wrong.
 *    Please try again later", which tells the person approving the ad nothing.
 *    Failing here names the actual problem.
 *
 * 2. A short settle pause after `ready`. Meta flips video_status to ready a beat
 *    before the video is usable in a creative, so creating one immediately can
 *    fail with that same generic error. Cheap insurance against a race that
 *    otherwise looks random.
 *
 * The window is generous because large source files (65MB QuickTime is normal
 * here) genuinely take minutes to transcode.
 */
const VIDEO_SETTLE_MS = 5_000;

async function waitForVideoReady(videoId: string, timeoutMs = 150_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await graphGet(videoId, { fields: "status" });
    const status = data.status?.video_status;
    if (status === "ready") {
      await new Promise((r) => setTimeout(r, VIDEO_SETTLE_MS));
      return;
    }
    if (status === "error") {
      throw new MetaApiError("Meta could not process the video file", null);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  throw new MetaApiError(
    `Meta was still processing this video after ${Math.round(timeoutMs / 1000)}s. ` +
      `Large files can take longer — try publishing again in a minute.`,
    null,
  );
}

interface UploadedAsset extends DraftAsset {
  imageHash?: string;
  videoId?: string;
  verticalImageHash?: string;
  verticalVideoId?: string;
}

export interface PushDraftInput {
  adName: string;
  adsetId: string;
  pageId: string;
  instagramUserId: string | null;
  partnershipSponsorId: string | null;
  assets: DraftAsset[];
  copy: AdCopy;
}

export interface PushDraftResult {
  adId: string;
  creativeId: string;
}

/** Full pipeline: upload media, create the creative, create the ad. */
export async function pushDraftToMeta(
  draft: PushDraftInput,
  status: "ACTIVE" | "PAUSED"
): Promise<PushDraftResult> {
  const { actId } = getEnv();

  // Existing-post ads reference the organic IG media directly — no upload,
  // no object_story_spec; the post's caption becomes the ad text.
  const existingPost = draft.assets.find((a) => a.sourceInstagramMediaId);
  if (existingPost?.sourceInstagramMediaId) {
    if (draft.partnershipSponsorId) {
      throw new MetaApiError(
        "Partnership ads can't be built from an existing post here",
        null
      );
    }
    if (!draft.instagramUserId) {
      throw new MetaApiError("The brand page has no linked Instagram account", null);
    }
    const params: Record<string, any> = {
      name: `${draft.adName} — creative`,
      object_id: draft.pageId,
      instagram_user_id: draft.instagramUserId,
      source_instagram_media_id: existingPost.sourceInstagramMediaId,
      url_tags: draft.copy.urlTags || undefined,
    };
    if (draft.copy.cta && draft.copy.link) {
      params.call_to_action = { type: draft.copy.cta, value: { link: draft.copy.link } };
    }
    const creative = await graphPost(`${actId}/adcreatives`, params);
    const ad = await graphPost(`${actId}/ads`, {
      name: draft.adName,
      adset_id: draft.adsetId,
      creative: { creative_id: creative.id },
      status,
    });
    return { adId: ad.id, creativeId: creative.id };
  }

  // For partnership ads, also resolve the creator's FB page so both the IG
  // and Facebook sponsor identities are linked on the creative.
  let sponsorPageId: string | null = null;
  if (draft.partnershipSponsorId && draft.instagramUserId) {
    try {
      const perms = await graphGet(
        `${draft.instagramUserId}/branded_content_ad_permissions`,
        { limit: "100" }
      );
      const rec = (perms.data || []).find(
        (p: any) => String(p.creator_ig_id) === draft.partnershipSponsorId
      );
      if (rec?.creator_fb_page_id) sponsorPageId = String(rec.creator_fb_page_id);
    } catch {
      // Optional enrichment — instagram_branded_content alone still works.
    }
  }

  const uploaded: UploadedAsset[] = [];
  for (const asset of draft.assets) {
    if (asset.kind === "image") {
      const up: UploadedAsset = { ...asset, imageHash: await uploadImage(asset.fileUrl) };
      if (asset.verticalFileUrl) {
        up.verticalImageHash = await uploadImage(asset.verticalFileUrl);
      }
      uploaded.push(up);
    } else {
      const videoId = await uploadVideo(asset.fileUrl, `${draft.adName} (${asset.role})`);
      let verticalVideoId: string | undefined;
      if (asset.verticalFileUrl) {
        verticalVideoId = await uploadVideo(asset.verticalFileUrl, `${draft.adName} (${asset.role} 9:16)`);
      }
      await waitForVideoReady(videoId);
      if (verticalVideoId) await waitForVideoReady(verticalVideoId);
      uploaded.push({ ...asset, videoId, verticalVideoId });
    }
  }

  const creativeParams = buildCreativeParams(draft, uploaded, sponsorPageId);
  let creative: any;
  try {
    creative = await graphPost(`${actId}/adcreatives`, creativeParams);
  } catch (err) {
    // Enhancement opt-outs churn between API versions, so this stays as a
    // backstop — but it should no longer fire in normal operation now that the
    // deprecated standard_enhancements key is gone. Log when it does: a silent
    // fallback here is what hid the fact that no opt-out was being applied.
    if (err instanceof MetaApiError && creativeParams.degrees_of_freedom_spec) {
      console.warn(
        `[meta-ads] adcreatives rejected degrees_of_freedom_spec (${err.message}); ` +
          `retrying without it — creative enhancements will NOT be opted out`,
      );
      const { degrees_of_freedom_spec: _dropped, ...rest } = creativeParams;
      creative = await graphPost(`${actId}/adcreatives`, rest);
    } else {
      throw err;
    }
  }

  const ad = await graphPost(`${actId}/ads`, {
    name: draft.adName,
    adset_id: draft.adsetId,
    creative: { creative_id: creative.id },
    status,
  });

  return { adId: ad.id, creativeId: creative.id };
}

export async function setAdStatus(adId: string, status: "ACTIVE" | "PAUSED"): Promise<void> {
  await graphPost(adId, { status });
}

function buildCreativeParams(
  draft: PushDraftInput,
  assets: UploadedAsset[],
  sponsorPageId: string | null = null
): Record<string, any> {
  const feed = assets.find((a) => a.role === "feed");
  const vertical = assets.find((a) => a.role === "vertical");
  const cards = assets
    .filter((a) => a.role === "card")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  if (!feed && cards.length < 2) throw new MetaApiError("An ad needs a feed creative", null);

  const cta = {
    type: draft.copy.cta,
    value: { link: draft.copy.link },
  };

  const params: Record<string, any> = {
    name: `${draft.adName} — creative`,
    url_tags: draft.copy.urlTags || undefined,
    // Opt out of Advantage+ creative enhancements (per-feature since v22).
    //
    // `standard_enhancements` is deliberately NOT here. Meta now rejects the
    // field outright — "Including standard enhancements field in creative has
    // been deprecated" (code 100, subcode 3858504) — for every creative type,
    // verified against both asset_feed_spec and plain link_data creatives.
    //
    // This mattered more than a wasted call: the catch below dropped the WHOLE
    // spec on failure, so none of the opt-outs below were ever applied either,
    // while the launcher told submitters enhancements were off automatically.
    degrees_of_freedom_spec: {
      creative_features_spec: {
        adapt_to_placement: { enroll_status: "OPT_OUT" },
        description_automation: { enroll_status: "OPT_OUT" },
        inline_comment: { enroll_status: "OPT_OUT" },
      },
    },
  };

  if (draft.partnershipSponsorId) {
    params.instagram_branded_content = { sponsor_id: draft.partnershipSponsorId };
    if (sponsorPageId) {
      params.facebook_branded_content = { sponsor_page_id: sponsorPageId };
    }
  }

  const identity: Record<string, any> = { page_id: draft.pageId };
  if (draft.instagramUserId) identity.instagram_user_id = draft.instagramUserId;

  if (cards.length >= 2) {
    for (const c of cards) {
      if (c.kind === "video" && !c.thumbnailUrl) {
        throw new MetaApiError(
          "A video card is missing its poster frame — re-upload that card",
          null
        );
      }
    }

    if (cards.some((c) => c.verticalFileUrl)) {
      // Per-placement carousel: two card sets (1:1 for feeds, 9:16 for
      // stories/reels) via the undocumented asset_feed_spec.carousels +
      // carousel_label customization rules — the structure Ads Manager emits.
      if (!cards.every((c) => c.verticalFileUrl)) {
        throw new MetaApiError(
          "Every carousel card needs a 9:16 version (or remove them all)",
          null
        );
      }
      const allImages = cards.every((c) => c.kind === "image");
      const allVideos = cards.every((c) => c.kind === "video");
      if (!allImages && !allVideos) {
        throw new MetaApiError(
          "Per-placement carousels need every card to be the same media type",
          null
        );
      }

      const images: any[] = [];
      const videos: any[] = [];
      const linkUrls: any[] = [{ website_url: draft.copy.link }];
      const titles: any[] = draft.copy.headline ? [{ text: draft.copy.headline }] : [];
      const feedChildren: any[] = [];
      const vertChildren: any[] = [];

      cards.forEach((c, i) => {
        const feedLabel = { name: `card${i}_feed` };
        const vertLabel = { name: `card${i}_vert` };
        if (allImages) {
          images.push({ hash: c.imageHash, adlabels: [feedLabel] });
          images.push({ hash: c.verticalImageHash, adlabels: [vertLabel] });
        } else {
          videos.push({
            video_id: c.videoId,
            thumbnail_url: c.thumbnailUrl || undefined,
            adlabels: [feedLabel],
          });
          videos.push({
            video_id: c.verticalVideoId,
            thumbnail_url: c.verticalThumbnailUrl || c.thumbnailUrl || undefined,
            adlabels: [vertLabel],
          });
        }

        let linkLabel: { name: string } | undefined;
        if (c.cardLink) {
          linkLabel = { name: `card${i}_link` };
          linkUrls.push({ website_url: c.cardLink, adlabels: [linkLabel] });
        }
        let titleLabel: { name: string } | undefined;
        if (c.cardHeadline) {
          titleLabel = { name: `card${i}_title` };
          titles.push({ text: c.cardHeadline, adlabels: [titleLabel] });
        }
        const child = (mediaLabel: { name: string }) => ({
          ...(allImages ? { image_label: mediaLabel } : { video_label: mediaLabel }),
          ...(linkLabel ? { link_url_label: linkLabel } : {}),
          ...(titleLabel ? { title_label: titleLabel } : {}),
        });
        feedChildren.push(child(feedLabel));
        vertChildren.push(child(vertLabel));
      });

      const feedCarouselLabel = { name: "carousel_feed" };
      const vertCarouselLabel = { name: "carousel_vertical" };
      const shareFlags = {
        multi_share_optimized: draft.copy.multiShareOptimized === true,
        multi_share_end_card: false,
      };

      params.object_story_spec = identity;
      params.asset_feed_spec = {
        ad_formats: [allImages ? "CAROUSEL_IMAGE" : "CAROUSEL_VIDEO"],
        optimization_type: "PLACEMENT",
        bodies: [{ text: draft.copy.primaryText }],
        titles: titles.length ? titles : undefined,
        descriptions: draft.copy.description ? [{ text: draft.copy.description }] : undefined,
        link_urls: linkUrls,
        call_to_action_types: [draft.copy.cta],
        ...(allImages ? { images } : { videos }),
        carousels: [
          { adlabels: [feedCarouselLabel], child_attachments: feedChildren, ...shareFlags },
          { adlabels: [vertCarouselLabel], child_attachments: vertChildren, ...shareFlags },
        ],
        asset_customization_rules: [
          {
            customization_spec: {
              publisher_platforms: ["facebook", "instagram"],
              facebook_positions: ["feed", "marketplace", "video_feeds", "search"],
              instagram_positions: ["stream", "explore", "explore_home", "profile_feed"],
            },
            carousel_label: feedCarouselLabel,
            priority: 1,
          },
          {
            customization_spec: {
              publisher_platforms: ["facebook", "instagram"],
              facebook_positions: ["story", "facebook_reels"],
              instagram_positions: ["story", "reels"],
            },
            carousel_label: vertCarouselLabel,
            priority: 2,
          },
        ],
      };
      return params;
    }

    // Plain carousel — one set of square cards for every placement, no
    // asset_feed_spec; carousels use link_data directly.
    params.object_story_spec = {
      ...identity,
      link_data: {
        message: draft.copy.primaryText,
        link: draft.copy.link,
        name: draft.copy.headline || undefined,
        description: draft.copy.description || undefined,
        call_to_action: cta,
        // Preserve the authored card order unless the submitter opted into
        // Meta's reordering; never append the auto brand end-card.
        multi_share_optimized: draft.copy.multiShareOptimized === true,
        multi_share_end_card: false,
        child_attachments: cards.map((c) => ({
          link: c.cardLink || draft.copy.link,
          name: c.cardHeadline || undefined,
          ...(c.kind === "image"
            ? { image_hash: c.imageHash }
            : { video_id: c.videoId, picture: c.thumbnailUrl }),
        })),
      },
    };
    return params;
  }

  if (!feed) throw new MetaApiError("An ad needs a feed creative", null);

  if (!vertical) {
    // Single asset — plain object_story_spec.
    if (feed.kind === "image") {
      params.object_story_spec = {
        ...identity,
        link_data: {
          message: draft.copy.primaryText,
          link: draft.copy.link,
          name: draft.copy.headline || undefined,
          description: draft.copy.description || undefined,
          image_hash: feed.imageHash,
          call_to_action: cta,
        },
      };
    } else {
      params.object_story_spec = {
        ...identity,
        video_data: {
          video_id: feed.videoId,
          image_url: feed.thumbnailUrl || undefined,
          message: draft.copy.primaryText,
          title: draft.copy.headline || undefined,
          link_description: draft.copy.description || undefined,
          call_to_action: cta,
        },
      };
    }
    return params;
  }

  // Two assets — placement asset customization via asset_feed_spec.
  const feedLabel = { name: "feed_asset" };
  const verticalLabel = { name: "vertical_asset" };
  const feedSpec: Record<string, any> = {
    ad_formats: [feed.kind === "image" ? "SINGLE_IMAGE" : "SINGLE_VIDEO"],
    optimization_type: "PLACEMENT",
    bodies: [{ text: draft.copy.primaryText }],
    titles: draft.copy.headline ? [{ text: draft.copy.headline }] : undefined,
    descriptions: draft.copy.description ? [{ text: draft.copy.description }] : undefined,
    link_urls: [{ website_url: draft.copy.link }],
    call_to_action_types: [draft.copy.cta],
    asset_customization_rules: [
      {
        customization_spec: {
          publisher_platforms: ["facebook", "instagram"],
          facebook_positions: ["feed", "marketplace", "video_feeds", "search"],
          instagram_positions: ["stream", "explore", "explore_home", "profile_feed"],
        },
        [feed.kind === "image" ? "image_label" : "video_label"]: feedLabel,
        priority: 1,
      },
      {
        customization_spec: {
          publisher_platforms: ["facebook", "instagram"],
          facebook_positions: ["story", "facebook_reels"],
          instagram_positions: ["story", "reels"],
        },
        [vertical.kind === "image" ? "image_label" : "video_label"]: verticalLabel,
        priority: 2,
      },
    ],
  };

  if (feed.kind === "image") {
    feedSpec.images = [
      { hash: feed.imageHash, adlabels: [feedLabel] },
      { hash: vertical.imageHash, adlabels: [verticalLabel] },
    ];
  } else {
    feedSpec.videos = [
      {
        video_id: feed.videoId,
        thumbnail_url: feed.thumbnailUrl || undefined,
        adlabels: [feedLabel],
      },
      {
        video_id: vertical.videoId,
        thumbnail_url: vertical.thumbnailUrl || undefined,
        adlabels: [verticalLabel],
      },
    ];
  }

  params.object_story_spec = identity;
  params.asset_feed_spec = feedSpec;
  return params;
}

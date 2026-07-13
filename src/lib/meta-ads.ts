// Server-side Meta Marketing API client for the Ad Launcher (/ads).
// Field shapes verified against developers.facebook.com v25.0 docs, July 2026.
import type {
  AdCopy,
  CampaignSummary,
  DraftAsset,
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

/** Poll until the video finishes processing; proceeds on timeout. */
async function waitForVideoReady(videoId: string, timeoutMs = 120_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await graphGet(videoId, { fields: "status" });
    const status = data.status?.video_status;
    if (status === "ready") return;
    if (status === "error") {
      throw new MetaApiError("Meta could not process the video file", null);
    }
    await new Promise((r) => setTimeout(r, 4000));
  }
  console.warn(`[meta-ads] Video ${videoId} not ready after ${timeoutMs}ms; continuing`);
}

interface UploadedAsset extends DraftAsset {
  imageHash?: string;
  videoId?: string;
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
      uploaded.push({ ...asset, imageHash: await uploadImage(asset.fileUrl) });
    } else {
      const videoId = await uploadVideo(asset.fileUrl, `${draft.adName} (${asset.role})`);
      await waitForVideoReady(videoId);
      uploaded.push({ ...asset, videoId });
    }
  }

  const creativeParams = buildCreativeParams(draft, uploaded, sponsorPageId);
  let creative: any;
  try {
    creative = await graphPost(`${actId}/adcreatives`, creativeParams);
  } catch (err) {
    // Enhancement opt-outs churn between API versions; retry without the
    // degrees_of_freedom_spec rather than failing the whole publish.
    if (err instanceof MetaApiError && creativeParams.degrees_of_freedom_spec) {
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
  if (!feed) throw new MetaApiError("An ad needs a feed creative", null);

  const cta = {
    type: draft.copy.cta,
    value: { link: draft.copy.link },
  };

  const params: Record<string, any> = {
    name: `${draft.adName} — creative`,
    url_tags: draft.copy.urlTags || undefined,
    // Opt out of Advantage+ creative enhancements (per-feature since v22).
    degrees_of_freedom_spec: {
      creative_features_spec: {
        standard_enhancements: { enroll_status: "OPT_OUT" },
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

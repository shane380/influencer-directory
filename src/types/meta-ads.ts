// Shared types for the Ad Launcher (/ads page + /api/ads routes).

export interface AdsetSummary {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  daily_budget: string | null;
  lifetime_budget: string | null;
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string | null;
  adsets: AdsetSummary[];
}

export interface TargetsResponse {
  accountId: string;
  campaigns: CampaignSummary[];
}

/** Read-only summary of the setup a new ad set will inherit from a template. */
export interface AdsetTemplate {
  campaignId: string;
  campaignName: string;
  /** OUTCOME_SALES, CONVERSIONS… — decides which optimization goals are legal */
  objective: string | null;
  /** True when the campaign holds the budget (CBO) — ad sets must not set one */
  campaignBudgetOptimization: boolean;
  /** Campaign-level bid strategy, e.g. COST_CAP */
  bidStrategy: string | null;
  /** True when bidStrategy makes a per-ad-set bid/cost cap mandatory */
  requiresBidAmount: boolean;
  /** Ad set the settings were read from (null when the campaign has none yet) */
  sourceAdsetId: string | null;
  sourceAdsetName: string | null;
  /** Every ad set in the campaign, newest first — pickable as the source */
  sourceOptions: { id: string; name: string }[];
  /** Prefilled values for the editable fields */
  name: string;
  countries: string[];
  /** Cost cap / bid in account cents; null when not applicable */
  bidAmount: number | null;
  /** Daily budget in account cents; null under CBO */
  dailyBudget: number | null;
  /** Plain-English lines describing what gets copied verbatim */
  inherited: string[];
}

export interface CreateAdsetRequest {
  campaignId: string;
  /** Ad set to copy the setup from; defaults to the newest in the campaign */
  sourceAdsetId?: string | null;
  name: string;
  countries: string[];
  bidAmount?: number | null;
  dailyBudget?: number | null;
  status: "ACTIVE" | "PAUSED";
}

export interface PartnerIdentity {
  /** Instagram user id used as instagram_branded_content.sponsor_id */
  sponsorId: string;
  /** Display label, e.g. "@handle" or the id when the handle isn't readable */
  label: string;
}

export interface LauncherDefaults {
  accountId: string;
  /** Brand identity detected from the account's most recent ads */
  pageId: string | null;
  pageName: string | null;
  instagramUserId: string | null;
  /** Partner creator identities seen on existing partnership ads */
  partners: PartnerIdentity[];
  suggestedLink: string | null;
  suggestedUrlTags: string | null;
  ctaOptions: { value: string; label: string }[];
  /** True when the token holds ads_management (publishing possible) */
  canPublish: boolean;
  /** Non-fatal errors hit while assembling defaults (for troubleshooting) */
  diagnostics: string[];
}

export interface AdCopy {
  primaryText: string;
  headline: string;
  description: string;
  link: string;
  cta: string;
  urlTags: string;
  /**
   * Carousel only: true = let Meta reorder cards for performance
   * (multi_share_optimized); false/absent = keep the authored order.
   */
  multiShareOptimized?: boolean;
}

export type AssetRole = "feed" | "vertical" | "card";
export type AssetKind = "image" | "video";

export interface DraftAsset {
  role: AssetRole;
  kind: AssetKind;
  /** Public R2 URL of the uploaded file */
  fileUrl: string;
  /** Public R2 URL of the poster frame (videos only) */
  thumbnailUrl?: string | null;
  /** Carousel cards only: position in the deck (0-based) */
  order?: number;
  /** Carousel cards only: optional per-card headline (~35 chars on FB) */
  cardHeadline?: string | null;
  /** Carousel cards only: per-card destination; falls back to the ad link */
  cardLink?: string | null;
  /**
   * Carousel cards only: optional 9:16 variant for stories/reels placements.
   * Either every card has one or none do (Meta customizes the whole set).
   */
  verticalFileUrl?: string | null;
  verticalThumbnailUrl?: string | null;
  /**
   * Existing-post ads only: the organic IG media id promoted via the
   * creative's source_instagram_media_id. When set, nothing is uploaded to
   * Meta — fileUrl/thumbnailUrl hold the post's IG CDN preview for the UI.
   */
  sourceInstagramMediaId?: string | null;
  /** Existing-post ads only: permalink to the organic post */
  instagramPermalink?: string | null;
}

/** One organic post from the brand's IG account (GET /api/ads/ig-media). */
export interface IgMediaItem {
  id: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  /** FEED, REELS, STORY… — null on very old media */
  mediaProductType: string | null;
  mediaUrl: string | null;
  /** Videos only: poster image */
  thumbnailUrl: string | null;
  permalink: string | null;
  caption: string | null;
  timestamp: string | null;
  /** null = Meta didn't report eligibility (treat as promotable) */
  eligibleToBoost: boolean | null;
}

export interface IgMediaResponse {
  media: IgMediaItem[];
  /** Cursor for the next page, or null when exhausted */
  nextCursor: string | null;
}

export interface SubmitDraftRequest {
  adName: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  pageId: string;
  instagramUserId: string | null;
  partnershipSponsorId: string | null;
  partnershipSponsorLabel: string | null;
  assets: DraftAsset[];
  copy: AdCopy;
}

export type DraftStatus =
  | "pending"
  | "approved"
  | "changes_requested"
  | "direct"
  | "publishing"
  | "failed";

export interface AdDraft extends SubmitDraftRequest {
  id: string;
  status: DraftStatus;
  feedback: string | null;
  metaAdId: string | null;
  publishError: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
}

export interface PublishResponse {
  ok: boolean;
  adId?: string;
  creativeId?: string;
  error?: string;
}

/** Copy fields that can be saved as reusable templates (subset of AdCopy keys). */
export type TemplateFieldType = "primaryText" | "headline" | "description" | "link";

export interface AdTemplate {
  id: string;
  collectionId: string;
  fieldType: TemplateFieldType;
  name: string;
  content: string;
}

export interface AdTemplateCollection {
  id: string;
  name: string;
  templates: AdTemplate[];
}

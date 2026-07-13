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

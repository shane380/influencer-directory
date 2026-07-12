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
}

export interface AdCopy {
  primaryText: string;
  headline: string;
  description: string;
  link: string;
  cta: string;
  urlTags: string;
}

export type AssetRole = "feed" | "vertical";
export type AssetKind = "image" | "video";

export interface DraftAsset {
  role: AssetRole;
  kind: AssetKind;
  /** Public R2 URL of the uploaded file */
  fileUrl: string;
  /** Public R2 URL of the poster frame (videos only) */
  thumbnailUrl?: string | null;
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

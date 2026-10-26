import type { CampaignInfluencer } from "@/types/database";

// Gift selection link helpers, shared by the coordinator UI and the
// admin send-invite route.

export function generateGiftToken(): string {
  // 32 hex chars ≈ 122 bits of entropy — non-enumerable, unlike the
  // name-derived invite slugs.
  return crypto.randomUUID().replace(/-/g, "");
}

export function giftUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://creators.namaclo.com").trim().replace(/\/$/, "");
  return `${base}/gift/${token}`;
}

// Campaign-level open link — reusable by creators who have no influencer
// record yet; submissions match-or-create records server-side.
export function giftGenericUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://creators.namaclo.com").trim().replace(/\/$/, "");
  return `${base}/gift/g/${token}`;
}

// Preview (/gift/preview/[campaignId]) reads the settings dialog's unsaved
// draft from this localStorage key — same origin as the dashboard.
export function giftPreviewDraftKey(campaignId: string): string {
  return `gift-preview-draft:${campaignId}`;
}

export function giftDmSnippet(firstName: string, campaignName: string, url: string): string {
  const name = firstName ? `Hey ${firstName}!` : "Hey!";
  return `${name} We'd love to send you pieces from our ${campaignName} drop 🤍 pick your styles + drop your address here (takes 1 min): ${url}`;
}

export type GiftStage = "not_invited" | "invited" | "opened" | "submitted" | "ordered";

// A creator gift-invited in another campaign within this many days is flagged
// on the roster and in the bulk "Add to campaign" warning.
export const RECENT_GIFT_DAYS = 30;

// A view logged within 30 seconds of the invite is the sender loading the page
// (copying the link, an email scanner), not the creator. Only later views count
// as the creator opening it.
export const GENUINE_OPEN_DELAY_MS = 30_000;

export function isGenuineOpen(
  ci: Pick<CampaignInfluencer, "gift_invited_at" | "gift_viewed_at">,
): boolean {
  if (!ci.gift_viewed_at) return false;
  if (!ci.gift_invited_at) return true;
  return (
    new Date(ci.gift_viewed_at).getTime() - new Date(ci.gift_invited_at).getTime() >=
    GENUINE_OPEN_DELAY_MS
  );
}

export function giftStage(
  ci: Pick<
    CampaignInfluencer,
    "gift_token" | "gift_invited_at" | "gift_viewed_at" | "gift_submitted_at" | "shopify_order_id"
  >,
): GiftStage {
  if (ci.shopify_order_id) return "ordered";
  if (ci.gift_submitted_at) return "submitted";
  if (isGenuineOpen(ci)) return "opened";
  if (ci.gift_token || ci.gift_invited_at) return "invited";
  return "not_invited";
}

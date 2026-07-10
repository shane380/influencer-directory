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

export function giftDmSnippet(firstName: string, campaignName: string, url: string): string {
  const name = firstName ? `Hey ${firstName}!` : "Hey!";
  return `${name} We'd love to send you pieces from our ${campaignName} drop 🤍 pick your styles + drop your address here (takes 1 min): ${url}`;
}

export type GiftStage = "not_invited" | "invited" | "opened" | "submitted" | "ordered";

export function giftStage(
  ci: Pick<
    CampaignInfluencer,
    "gift_token" | "gift_invited_at" | "gift_viewed_at" | "gift_submitted_at" | "shopify_order_id"
  >,
): GiftStage {
  if (ci.shopify_order_id) return "ordered";
  if (ci.gift_submitted_at) return "submitted";
  if (ci.gift_viewed_at) return "opened";
  if (ci.gift_token || ci.gift_invited_at) return "invited";
  return "not_invited";
}

import type { CampaignInfluencer } from "@/types/database";
import { isGenuineOpen } from "@/lib/gift";

// Per-campaign funnel summary. Definitions mirror CampaignStatsPanel so the
// Gifting/PR overview and a campaign's own page agree:
//  - approved pool = approval_status approved or null (no approval required)
//  - contacted = outreach sent (status past prospect) or selects submitted
//  - replied = a status that implies the creator wrote back, or selects submitted
//  - orders = selects submitted or a Shopify order in any state

export type CampaignSummary = {
  creators: number;
  contacted: number;
  invited: number;
  opened: number;
  selects: number;
  orders: number;
  delivered: number;
  posted: number;
  response_rate: number | null; // replied / contacted, percent
};

type Row = Pick<
  CampaignInfluencer,
  | "status"
  | "approval_status"
  | "shopify_order_status"
  | "content_posted"
  | "gift_invited_at"
  | "gift_viewed_at"
  | "gift_submitted_at"
>;

const REPLIED_STATUSES: string[] = [
  "creator_wants_paid",
  "order_placed",
  "order_delivered",
  "order_follow_up_sent",
  "order_follow_up_two_sent",
  "posted",
];

const ORDER_STATUSES: string[] = ["draft", "fulfilled", "shipped", "delivered"];

export function summarizeCampaign(rows: Row[]): CampaignSummary {
  const pool = rows.filter((r) => r.approval_status === "approved" || r.approval_status === null);
  const submitted = (r: Row) => !!r.gift_submitted_at;
  const contacted = pool.filter((r) => r.status !== "prospect" || submitted(r)).length;
  const replied = pool.filter((r) => REPLIED_STATUSES.includes(r.status) || submitted(r)).length;
  return {
    creators: pool.length,
    contacted,
    invited: pool.filter((r) => !!r.gift_invited_at).length,
    opened: pool.filter(isGenuineOpen).length,
    selects: pool.filter(submitted).length,
    orders: pool.filter(
      (r) => submitted(r) || (r.shopify_order_status && ORDER_STATUSES.includes(r.shopify_order_status)),
    ).length,
    delivered: pool.filter((r) => r.shopify_order_status === "delivered").length,
    posted: pool.filter((r) => r.content_posted !== "none").length,
    response_rate: contacted > 0 ? Math.round((replied / contacted) * 100) : null,
  };
}

import type { CampaignInfluencer } from "@/types/database";
import { isGenuineOpen, RECENT_GIFT_DAYS } from "@/lib/gift";

// A creator's rows in other campaigns, summarised for the roster: are they new
// to us, which campaign did they last take part in, and how did it end.

export type HistoryRow = Pick<
  CampaignInfluencer,
  | "influencer_id"
  | "campaign_id"
  | "added_at"
  | "status"
  | "gift_invited_at"
  | "gift_viewed_at"
  | "gift_submitted_at"
  | "shopify_order_id"
  | "shopify_order_status"
  | "content_posted"
> & { campaign: { name: string | null; start_date: string | null } | null };

export type HistoryEntry = {
  campaignName: string;
  date: string; // ISO; invite date when there was one, else when they were added
  outcome: string;
  recentGift: boolean; // gift-invited within RECENT_GIFT_DAYS
  later: boolean; // they joined this campaign after joining the one being viewed
};

export type HistorySummary = {
  isNew: boolean;
  last: HistoryEntry | null;
  anyRecentGift: boolean;
  all: HistoryEntry[]; // newest first
};

export function historyOutcome(r: HistoryRow): string {
  if (r.content_posted && r.content_posted !== "none") return "posted";
  if (r.shopify_order_status === "delivered") return "delivered";
  if (r.shopify_order_id || r.shopify_order_status) return "ordered";
  if (r.gift_submitted_at) return "picked";
  if (r.status === "creator_wants_paid") return "wants paid";
  if (r.status === "lead_dead") return "no reply";
  if (isGenuineOpen(r)) return "opened";
  if (r.gift_invited_at || r.status !== "prospect") return "no reply";
  return "not contacted";
}

function refDate(r: HistoryRow): string {
  return r.gift_invited_at || r.added_at;
}

export function summarizeHistory(
  rows: HistoryRow[],
  currentCampaignId: string,
  currentAddedAt: string,
  now: number = Date.now(),
): HistorySummary {
  const recentCutoff = now - RECENT_GIFT_DAYS * 86400000;
  const others = rows
    .filter((r) => r.campaign_id !== currentCampaignId)
    .sort((a, b) => (refDate(a) < refDate(b) ? 1 : -1));
  const all = others.map<HistoryEntry>((r) => ({
    campaignName: (r.campaign?.name || "Untitled").trim(),
    date: refDate(r),
    outcome: historyOutcome(r),
    recentGift: !!r.gift_invited_at && new Date(r.gift_invited_at).getTime() >= recentCutoff,
    later: r.added_at > currentAddedAt,
  }));
  return {
    isNew: all.length === 0,
    last: all[0] ?? null,
    anyRecentGift: all.some((e) => e.recentGift),
    all,
  };
}

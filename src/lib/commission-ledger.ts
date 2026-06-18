import { getAdminClient } from "./admin-auth";
import { calculateAffiliateCommission } from "./affiliate";

// The append-only commission/earnings ledger. Earnings are FACTS (events);
// a creator's earned total is SUM(amount), and balance = earned − payouts.
// Events upsert on (creator_key, event_type, source_id), so re-syncing is
// idempotent — a rate-limited partial scan just completes next run, and a
// refund is a negative event (no separate clawback table).

export type EventType = "affiliate" | "ad_spend" | "retainer" | "paid_collab" | "refund";

export interface CommissionEvent {
  creator_key: string; // 'inf:<influencer_id>' | 'legacy:<legacy_affiliate_id>'
  influencer_id: string | null;
  legacy_affiliate_id: string | null;
  event_type: EventType;
  source_type: string; // shopify_order | shopify_refund | meta_monthly | retainer | campaign_deal
  source_id: string; // order_id | period | deal_id
  period: string; // YYYY-MM
  occurred_at: string | null;
  amount: number; // + earned, − refund
  rate: number | null;
  basis: number | null;
  detail: Record<string, unknown> | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function creatorKey(influencerId: string | null, legacyAffiliateId: string | null): string {
  return legacyAffiliateId ? `legacy:${legacyAffiliateId}` : `inf:${influencerId}`;
}

// Idempotent upsert. Re-running with the same source ids overwrites in place.
export async function upsertEvents(events: CommissionEvent[]): Promise<number> {
  if (!events.length) return 0;
  const db = getAdminClient();
  for (let i = 0; i < events.length; i += 500) {
    const { error } = await (db.from("commission_events") as any)
      .upsert(events.slice(i, i + 500), { onConflict: "creator_key,event_type,source_id" });
    if (error) throw new Error(`commission_events upsert failed: ${error.message}`);
  }
  return events.length;
}

interface Owner {
  creatorKey: string;
  influencerId: string | null;
  legacyAffiliateId: string | null;
}

// Affiliate: one positive event per order (gross × rate) + one negative event
// per refunded order (refund × rate). Net commission = sum = (gross−refund)×rate.
// Built from the same live Shopify scan the payment calc uses (retry/throw on
// rate-limit, so a partial scan never silently truncates).
export async function buildAffiliateEvents(
  owner: Owner,
  code: string,
  rate: number, // decimal, e.g. 0.25
  period: string,
  excludedOrderIds: number[] = [],
): Promise<CommissionEvent[]> {
  const res = await calculateAffiliateCommission(code, period, rate, excludedOrderIds);
  const events: CommissionEvent[] = [];
  for (const o of res.orders) {
    if (o.excluded) continue;
    const gross = Number(o.gross_amount) || 0;
    const refund = Number(o.refund_amount) || 0;
    if (gross > 0) {
      events.push({
        ...ownerCols(owner),
        event_type: "affiliate",
        source_type: "shopify_order",
        source_id: String(o.order_id),
        period,
        occurred_at: o.created_at,
        amount: round2(gross * rate),
        rate,
        basis: gross,
        detail: { order_number: o.order_number, gross },
      });
    }
    if (refund > 0) {
      events.push({
        ...ownerCols(owner),
        event_type: "refund",
        source_type: "shopify_refund",
        source_id: String(o.order_id), // upserts to the order's latest total refund
        period,
        occurred_at: o.created_at,
        amount: round2(-refund * rate),
        rate,
        basis: refund,
        detail: { order_number: o.order_number, refund },
      });
    }
  }
  return events;
}

// Ad spend: one event per (creator, month) — spend × rate.
export function buildAdSpendEvent(owner: Owner, spend: number, rate: number, period: string): CommissionEvent | null {
  if (!spend || spend <= 0) return null;
  return {
    ...ownerCols(owner),
    event_type: "ad_spend",
    source_type: "meta_monthly",
    source_id: period,
    period,
    occurred_at: null,
    amount: round2(spend * rate),
    rate,
    basis: round2(spend),
    detail: { spend: round2(spend) },
  };
}

// Retainer: fixed monthly amount, one event per (creator, month).
export function buildRetainerEvent(owner: Owner, amount: number, period: string): CommissionEvent | null {
  if (!amount || amount <= 0) return null;
  return {
    ...ownerCols(owner),
    event_type: "retainer",
    source_type: "retainer",
    source_id: period,
    period,
    occurred_at: null,
    amount: round2(amount),
    rate: null,
    basis: null,
    detail: null,
  };
}

// Paid collab: one event per deal.
export function buildPaidCollabEvent(owner: Owner, dealId: string, amount: number, period: string): CommissionEvent | null {
  if (!amount || amount <= 0) return null;
  return {
    ...ownerCols(owner),
    event_type: "paid_collab",
    source_type: "campaign_deal",
    source_id: dealId,
    period,
    occurred_at: null,
    amount: round2(amount),
    rate: null,
    basis: null,
    detail: null,
  };
}

function ownerCols(owner: Owner) {
  return {
    creator_key: owner.creatorKey,
    influencer_id: owner.influencerId,
    legacy_affiliate_id: owner.legacyAffiliateId,
  };
}

import { earnedOn } from "./retainers";
import type { CommissionEvent } from "./commission-ledger";

// One definition of how a campaign-deal milestone becomes money on the books.
//
// Deals are paid per milestone — "50% upfront / 50% when the post is live",
// "month 3 due when content is delivered" — so both the earnings ledger and the
// accrual report must work at milestone granularity. The old shape (one lump
// event per deal, pinned to the campaign's start month) could not represent a
// split payment and put the whole amount in a month where nothing happened.

export interface DealMilestoneLike {
  id: string;
  description?: string | null;
  percentage?: number | null;
  amount?: number | null;
  is_paid?: boolean;
  paid_date?: string | null;
  earned_on?: string | null;
  due_on?: string | null;
  gate?: string;
}

export interface DealLike {
  id: string;
  influencer_id: string | null;
  deal_kind?: string | null;
  deal_status?: string | null;
  whitelisting_status?: string | null;
  total_deal_value?: number | null;
  starts_on?: string | null;
  payment_terms?: DealMilestoneLike[] | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Deals whose milestones count: agreed and not abandoned. */
export function isCommittedDeal(d: Pick<DealLike, "deal_status">): boolean {
  return d.deal_status === "active" || d.deal_status === "closed";
}

/**
 * A milestone's dollar amount. Some older milestones carry only a percentage
 * (amount 0), so fall back to the deal value split.
 */
export function milestoneAmount(m: DealMilestoneLike, deal: DealLike): number {
  const explicit = Number(m.amount) || 0;
  if (explicit > 0) return round2(explicit);
  const pct = Number(m.percentage) || 0;
  return round2(((Number(deal.total_deal_value) || 0) * pct) / 100);
}

/**
 * When the milestone earned, with one pragmatic fallback: a milestone that was
 * PAID but never dated earned by its payment date at the latest. Without this,
 * history recorded before delivery-dates existed would show as never earned —
 * despite the money having left. Conservative and matches cash.
 */
export function milestoneEarnedOn(m: DealMilestoneLike, deal: DealLike, today = new Date()): string | null {
  const earned = earnedOn(m as any, deal as any, today);
  if (earned) return earned;
  if (m.is_paid && m.paid_date) return m.paid_date;
  return null;
}

/**
 * Bookkeeping category. Whitelisting covers both usage-rights fees (like a
 * 4-month whitelisting retainer) and — elsewhere — the ad-spend share; the
 * bookkeeper wants them under one heading. Content retainers stay 'retainer';
 * one-off collabs stay 'paid_collab'.
 */
export function dealCategory(deal: DealLike): "whitelisting" | "retainer" | "paid_collab" {
  if (deal.deal_kind !== "retainer") return "paid_collab";
  const wl = deal.whitelisting_status;
  return wl && wl !== "not_applicable" ? "whitelisting" : "retainer";
}

export const DEAL_MILESTONE_SOURCE = "deal_milestone";

/**
 * Ledger events for every earned milestone of every committed deal — one event
 * per milestone in the month it earned, keyed deal:milestone so re-syncs
 * overwrite in place. Unearned milestones emit nothing: money that is not yet
 * owed does not belong on the books.
 */
export function buildDealMilestoneEvents(deals: DealLike[], today = new Date()): CommissionEvent[] {
  const events: CommissionEvent[] = [];
  for (const d of deals) {
    if (!isCommittedDeal(d) || !d.influencer_id) continue;
    const category = dealCategory(d);
    for (const m of d.payment_terms || []) {
      const earned = milestoneEarnedOn(m, d, today);
      if (!earned) continue;
      const amount = milestoneAmount(m, d);
      if (amount <= 0) continue;
      events.push({
        creator_key: `inf:${d.influencer_id}`,
        influencer_id: d.influencer_id,
        legacy_affiliate_id: null,
        event_type: d.deal_kind === "retainer" ? "retainer" : "paid_collab",
        source_type: DEAL_MILESTONE_SOURCE,
        source_id: `${d.id}:${m.id}`,
        period: earned.slice(0, 7),
        occurred_at: null,
        amount,
        rate: null,
        basis: null,
        detail: {
          category,
          description: m.description || "Installment",
          deal_id: d.id,
          milestone_id: m.id,
          is_paid: !!m.is_paid,
          paid_date: m.paid_date || null,
        },
      });
    }
  }
  return events;
}

/**
 * The payment side of the same milestones, for FIFO allocation: each paid
 * milestone settles its own earned month (covers_period). Deal payments are
 * recorded on the deal itself — the tick/paid-date on the collabs page — not in
 * creator_payouts, so the payments page must read them from here.
 */
export function milestonePayments(
  deals: DealLike[],
  today = new Date()
): { influencer_id: string; amount: number; sent_at: string | null; covers_period: string }[] {
  const out: { influencer_id: string; amount: number; sent_at: string | null; covers_period: string }[] = [];
  for (const d of deals) {
    if (!isCommittedDeal(d) || !d.influencer_id) continue;
    for (const m of d.payment_terms || []) {
      if (!m.is_paid) continue;
      const earned = milestoneEarnedOn(m, d, today);
      if (!earned) continue; // paid but unearned with no date: counted by the accrual's unplaced warning instead
      const amount = milestoneAmount(m, d);
      if (amount <= 0) continue;
      out.push({
        influencer_id: d.influencer_id,
        amount,
        sent_at: m.paid_date || null,
        covers_period: earned.slice(0, 7),
      });
    }
  }
  return out;
}

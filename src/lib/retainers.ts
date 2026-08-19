import { CampaignDeal, PaymentMilestone, MilestoneGate } from "@/types/database";

// Retainer earning rules, shared by the summary strip and the row control so the
// two can never disagree about what a creator is owed.
//
// The core distinction: a milestone is EARNED when its gate is met, and PAID
// when money actually moved. A retainer installment is routinely earned and
// unpaid — that gap is the accrued liability the bookkeeper needs.

// Milestones written before 2026-08-11 have no `gate`, so it is inferred from
// the description the deal dialog generated. Anything unrecognised is 'manual':
// it earns only when someone sets a delivered date, never automatically.
export function inferGate(m: PaymentMilestone): MilestoneGate {
  if (m.gate) return m.gate;
  const d = (m.description || "").toLowerCase();
  if (d.includes("execution") || d.includes("signing") || d.includes("upfront")) return "on_execution";
  if (d.includes("content") || d.includes("live") || d.includes("post")) return "on_content_live";
  return "manual";
}

// The date a milestone earned, or null if it has not earned yet.
// An explicit earned_on always wins — it is what a human recorded.
export function earnedOn(m: PaymentMilestone, deal: Pick<CampaignDeal, "starts_on">): string | null {
  if (m.earned_on) return m.earned_on;
  // An on-execution milestone earns the day the term starts. With no start date
  // recorded we cannot claim it earned, so it stays pending rather than guessing.
  if (inferGate(m) === "on_execution" && deal.starts_on) return deal.starts_on;
  return null;
}

export function isEarned(m: PaymentMilestone, deal: Pick<CampaignDeal, "starts_on">): boolean {
  return earnedOn(m, deal) !== null;
}

export interface DealTotals {
  contract: number;
  earned: number;
  paid: number;
  balance: number; // earned but not yet paid — the accrued liability
  milestones: number;
  earnedCount: number;
}

export function dealTotals(deal: Pick<CampaignDeal, "starts_on" | "payment_terms" | "total_deal_value">): DealTotals {
  const ms = deal.payment_terms || [];
  let earned = 0;
  let paid = 0;
  let earnedCount = 0;
  for (const m of ms) {
    const amt = Number(m.amount) || 0;
    if (isEarned(m, deal)) { earned += amt; earnedCount++; }
    if (m.is_paid) paid += amt;
  }
  return {
    contract: Number(deal.total_deal_value) || 0,
    earned: round2(earned),
    paid: round2(paid),
    // Money paid ahead of earning is not a liability, so the balance floors at 0.
    balance: round2(Math.max(0, earned - paid)),
    milestones: ms.length,
    earnedCount,
  };
}

// The period an earned milestone accrues to — what the bookkeeper report groups by.
export function accrualPeriod(m: PaymentMilestone, deal: Pick<CampaignDeal, "starts_on">): string | null {
  const on = earnedOn(m, deal);
  return on ? on.slice(0, 7) : null;
}

// The date the term was SCHEDULED to run to. This is a plan, not an expiry —
// a creator who posts late is still owed the installment, and the contract
// stays open until they deliver or it is cancelled.
export function scheduledEnd(deal: Pick<CampaignDeal, "starts_on" | "term_months">): string | null {
  if (!deal.starts_on || !deal.term_months) return null;
  const d = new Date(deal.starts_on + "T00:00:00");
  d.setMonth(d.getMonth() + deal.term_months);
  return d.toISOString().slice(0, 10);
}

// The real end, recorded once every installment has been delivered (the last
// delivery plus its usage tail). Null while the term is still open.
export function actualEnd(deal: Pick<CampaignDeal, "ends_on">): string | null {
  return deal.ends_on || null;
}

// Kept for callers that just want "the end date, whatever we know of it".
export function endDate(deal: Pick<CampaignDeal, "ends_on" | "starts_on" | "term_months">): string | null {
  return actualEnd(deal) || scheduledEnd(deal);
}

export function endDateIsEstimate(deal: Pick<CampaignDeal, "ends_on" | "starts_on" | "term_months">): boolean {
  return !deal.ends_on && scheduledEnd(deal) !== null;
}

// Where a retainer actually stands. The distinction that matters operationally
// is `awaiting_delivery`: the scheduled term has passed but content is still
// owed, so the money has not earned and someone needs to chase it. Passing the
// scheduled end never closes a deal on its own.
export type RetainerState = "undated" | "in_term" | "awaiting_delivery" | "complete";

export function retainerState(
  deal: Pick<CampaignDeal, "starts_on" | "term_months" | "payment_terms">,
  today = new Date()
): RetainerState {
  const ms = deal.payment_terms || [];
  if (ms.length > 0 && ms.every((m) => isEarned(m, deal))) return "complete";
  if (!deal.starts_on) return "undated";
  const end = scheduledEnd(deal);
  if (end && today > new Date(end + "T23:59:59")) return "awaiting_delivery";
  return "in_term";
}

// Only meaningful for a term still running — a deal already past its scheduled
// end is overdue, not "ending soon".
export function isEndingWithin(
  deal: Pick<CampaignDeal, "ends_on" | "starts_on" | "term_months" | "payment_terms">,
  days: number,
  today = new Date()
): boolean {
  if (retainerState(deal, today) !== "in_term") return false;
  const end = scheduledEnd(deal);
  if (!end) return false;
  const diff = (new Date(end + "T00:00:00").getTime() - today.getTime()) / 86400000;
  return diff >= 0 && diff <= days;
}

export interface RetainerSummary {
  active: number;
  contract: number;
  earned: number;
  paid: number;
  outstanding: number;
  endingSoon: number;
  awaitingDelivery: number; // past the scheduled term with content still owed
  undated: number; // active retainers with no start date — terms still to be entered
}

export function summarize(deals: Array<Pick<CampaignDeal, "deal_status" | "starts_on" | "ends_on" | "term_months" | "payment_terms" | "total_deal_value">>): RetainerSummary {
  // Money covers every committed deal: a closed retainer you still owe belongs
  // in Outstanding. The headline count is only the ones still running.
  const committed = deals.filter((d) => d.deal_status === "active" || d.deal_status === "closed");
  const s: RetainerSummary = {
    active: committed.filter((d) => d.deal_status === "active").length,
    contract: 0, earned: 0, paid: 0, outstanding: 0, endingSoon: 0, awaitingDelivery: 0, undated: 0,
  };
  for (const d of committed) {
    const t = dealTotals(d);
    s.contract += t.contract;
    s.earned += t.earned;
    s.paid += t.paid;
    s.outstanding += t.balance;
    if (d.deal_status !== "active") continue; // the rest describe live work only
    if (isEndingWithin(d, 30)) s.endingSoon++;
    if (retainerState(d) === "awaiting_delivery") s.awaitingDelivery++;
    if (!d.starts_on) s.undated++;
  }
  s.contract = round2(s.contract);
  s.earned = round2(s.earned);
  s.paid = round2(s.paid);
  s.outstanding = round2(s.outstanding);
  return s;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

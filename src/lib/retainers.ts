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

// A retainer's end date. Stored ends_on wins; otherwise derive from the term.
// Returns null when the end genuinely is not known yet — some terms end on
// content ("30 days after the final post"), not on the calendar.
export function endDate(deal: Pick<CampaignDeal, "ends_on" | "starts_on" | "term_months">): string | null {
  if (deal.ends_on) return deal.ends_on;
  if (!deal.starts_on || !deal.term_months) return null;
  const d = new Date(deal.starts_on + "T00:00:00");
  d.setMonth(d.getMonth() + deal.term_months);
  return d.toISOString().slice(0, 10);
}

// True when endDate() is a projection from the term rather than a recorded date.
// Some terms really end "30 days after the final post", so showing the derived
// date unqualified would present a guess as a fact.
export function endDateIsEstimate(deal: Pick<CampaignDeal, "ends_on" | "starts_on" | "term_months">): boolean {
  return !deal.ends_on && endDate(deal) !== null;
}

export function isEndingWithin(deal: Pick<CampaignDeal, "ends_on" | "starts_on" | "term_months">, days: number, today = new Date()): boolean {
  const end = endDate(deal);
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
  undated: number; // active retainers with no start date — terms still to be entered
}

export function summarize(deals: Array<Pick<CampaignDeal, "deal_status" | "starts_on" | "ends_on" | "term_months" | "payment_terms" | "total_deal_value">>): RetainerSummary {
  const active = deals.filter((d) => d.deal_status === "confirmed");
  const s: RetainerSummary = { active: active.length, contract: 0, earned: 0, paid: 0, outstanding: 0, endingSoon: 0, undated: 0 };
  for (const d of active) {
    const t = dealTotals(d);
    s.contract += t.contract;
    s.earned += t.earned;
    s.paid += t.paid;
    s.outstanding += t.balance;
    if (isEndingWithin(d, 30)) s.endingSoon++;
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

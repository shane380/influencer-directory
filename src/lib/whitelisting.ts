import { CampaignDeal } from "@/types/database";

// Whitelisting usage-term logic, shared by the card view, the list view and the
// notification feed. These rules were duplicated inside the card components and
// nowhere else, which is why the list view could show a term as live months
// after it had run out.

// A live date with no explicit expiry defaults to a 90-day usage window — the
// house standard, and what the card view has always assumed.
const DEFAULT_USAGE_DAYS = 90;

export type TermState =
  | "none"      // no term recorded
  | "live"      // running, more than the warning window left
  | "expiring"  // inside the warning window
  | "expired"   // the term has run out
  | "ended";    // marked ended by a human

export const EXPIRY_WARNING_DAYS = 7;

// These columns hold whole calendar days, but whitelisting_expiry_date is a
// timestamptz stored at midnight UTC. Reading it with new Date() and then asking
// for local getDate() lands on the previous day for anyone west of UTC, which
// made a term look a day shorter than it is. Parse the date part as UTC instead.
function asUtcDay(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`);
}

export function termExpiry(deal: Pick<CampaignDeal, "whitelisting_live_date" | "whitelisting_expiry_date">): Date | null {
  if (deal.whitelisting_expiry_date) return asUtcDay(deal.whitelisting_expiry_date);
  if (!deal.whitelisting_live_date) return null;
  return new Date(asUtcDay(deal.whitelisting_live_date).getTime() + DEFAULT_USAGE_DAYS * 86400000);
}

// Whole days from `today` until the term runs out. Negative once it has passed.
export function daysRemaining(
  deal: Pick<CampaignDeal, "whitelisting_live_date" | "whitelisting_expiry_date">,
  today = new Date()
): number | null {
  const expiry = termExpiry(deal);
  if (!expiry) return null;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((expiry.getTime() - todayUtc) / 86400000);
}

export function termState(
  deal: Pick<CampaignDeal, "whitelisting_status" | "whitelisting_live_date" | "whitelisting_expiry_date">,
  today = new Date()
): TermState {
  if (deal.whitelisting_status === "ended") return "ended";
  const left = daysRemaining(deal, today);
  if (left === null) return "none";
  if (left <= 0) return "expired";
  if (left <= EXPIRY_WARNING_DAYS) return "expiring";
  return "live";
}

// How far through the term we are, 0..1 — for the progress bar in the list view.
export function termProgress(
  deal: Pick<CampaignDeal, "whitelisting_live_date" | "whitelisting_expiry_date">,
  today = new Date()
): number | null {
  const expiry = termExpiry(deal);
  if (!expiry || !deal.whitelisting_live_date) return null;
  const start = asUtcDay(deal.whitelisting_live_date).getTime();
  const end = expiry.getTime();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (today.getTime() - start) / (end - start)));
}

// A deal Nama paid a fee for, as opposed to one compensated by a share of ad
// spend. Only these carry a usage term that has to be honoured and chased.
export function isPaidWhitelisting(deal: Pick<CampaignDeal, "total_deal_value" | "whitelisting_status">): boolean {
  return deal.whitelisting_status !== "not_applicable" && Number(deal.total_deal_value) > 0;
}

// The deal whose term matters most for a creator: the one running out soonest
// among those still running, else the most recently expired.
export function primaryTermDeal<T extends Pick<CampaignDeal, "whitelisting_status" | "whitelisting_live_date" | "whitelisting_expiry_date">>(
  deals: T[],
  today = new Date()
): T | null {
  const withTerm = deals.filter((d) => termExpiry(d) !== null && d.whitelisting_status !== "not_applicable");
  if (withTerm.length === 0) return null;
  const running = withTerm.filter((d) => (daysRemaining(d, today) ?? -1) > 0);
  const pool = running.length > 0 ? running : withTerm;
  return pool.reduce((best, d) =>
    (daysRemaining(d, today) ?? 0) < (daysRemaining(best, today) ?? 0) ? d : best
  );
}

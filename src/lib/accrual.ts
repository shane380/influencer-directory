import { CampaignDeal } from "@/types/database";
import { earnedOn } from "./retainers";

// The monthly accrual report: what was EARNED in a period versus what was PAID
// in it, per creator, so a bookkeeper can reconcile the two. Every figure is
// USD — the app records a single currency and does not convert.
export const REPORT_CURRENCY = "USD";

export interface AccrualLine {
  period: string;          // YYYY-MM the earning is attributed to
  creator_name: string;
  handle: string;
  category: string;        // retainer | whitelisting | paid_collab | affiliate | ad_spend | refund
  description: string;
  accrued: number;         // earned in this period
  paid: number;            // cash that left in this period
  paid_date: string | null;
  reference: string | null;
  source: string;          // where the figure came from, for audit
}

export interface AccrualSummary {
  period: string;
  currency: string;
  opening_liability: number;  // earned but unpaid entering the period
  accrued: number;
  paid: number;
  closing_liability: number;
  creators: number;
  // Money recorded as paid but with no date on it, so it cannot be placed in
  // any month. It is missing from the cash side of every period, which would
  // otherwise overstate the closing liability with no hint as to why.
  unplaced_paid: number;
  unplaced_count: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const monthOf = (date: string | null | undefined) => (date ? date.slice(0, 7) : null);

interface DealLike extends Pick<CampaignDeal,
  "id" | "deal_kind" | "starts_on" | "payment_terms" | "total_deal_value" | "deal_status" | "whitelisting_status"> {
  influencer?: { name?: string | null; instagram_handle?: string | null } | null;
}

interface EventLike {
  event_type: string;
  period: string;
  amount: number | string;
  source_id: string;
  influencer_id: string | null;
  detail?: Record<string, unknown> | null;
  influencer?: { name?: string | null; instagram_handle?: string | null } | null;
}

interface PayoutLike {
  amount: number | string;
  sent_at: string;
  method?: string | null;
  reference?: string | null;
  influencer?: { name?: string | null; instagram_handle?: string | null } | null;
}

const who = (x: { influencer?: { name?: string | null; instagram_handle?: string | null } | null }) => ({
  creator_name: x.influencer?.name || "Unknown",
  handle: x.influencer?.instagram_handle ? `@${x.influencer.instagram_handle}` : "",
});

// A retainer earns per installment, on the date its gate was met. This is the
// whole reason the report exists: a $2,400 four-month deal paid upfront is not a
// $2,400 expense in the month the cash left.
export function retainerLines(deals: DealLike[], period: string, today = new Date()): AccrualLine[] {
  const lines: AccrualLine[] = [];
  for (const d of deals) {
    if (d.deal_kind !== "retainer") continue;
    if (d.deal_status === "cancelled" || d.deal_status === "negotiating") continue;
    const isWhitelisting = d.whitelisting_status && d.whitelisting_status !== "not_applicable";
    for (const m of d.payment_terms || []) {
      const earned = earnedOn(m, d, today);
      const accruedHere = monthOf(earned) === period ? Number(m.amount) || 0 : 0;
      const paidHere = m.is_paid && monthOf(m.paid_date) === period ? Number(m.amount) || 0 : 0;
      if (accruedHere === 0 && paidHere === 0) continue;
      lines.push({
        period, ...who(d),
        category: isWhitelisting ? "whitelisting" : "retainer",
        description: m.description || "Installment",
        accrued: round2(accruedHere),
        paid: round2(paidHere),
        paid_date: m.is_paid ? m.paid_date ?? null : null,
        reference: null,
        source: `deal:${d.id}:${m.id}`,
      });
    }
  }
  return lines;
}

// One-off deals and the commission streams come from the append-only ledger,
// which already attributes each event to a period.
export function eventLines(events: EventLike[], period: string): AccrualLine[] {
  return events
    .filter((e) => e.period === period)
    .map((e) => ({
      period, ...who(e),
      category: e.event_type,
      description:
        e.event_type === "refund" ? "Refund adjustment"
        : e.event_type === "affiliate" ? "Affiliate commission"
        : e.event_type === "ad_spend" ? "Ad spend commission"
        : "Paid collaboration",
      accrued: round2(Number(e.amount) || 0),
      paid: 0,
      paid_date: null,
      reference: null,
      source: `event:${e.event_type}:${e.source_id}`,
    }));
}

// Cash actually sent to partner creators. Kept separate from deal milestones:
// payouts settle the commission streams, milestones settle deals, and mixing
// them would count one transfer twice.
export function payoutLines(payouts: PayoutLike[], period: string): AccrualLine[] {
  return payouts
    .filter((p) => monthOf(p.sent_at) === period)
    .map((p) => ({
      period, ...who(p),
      category: "payout",
      description: `Payment sent${p.method ? ` (${p.method})` : ""}`,
      accrued: 0,
      paid: round2(Number(p.amount) || 0),
      paid_date: p.sent_at,
      reference: p.reference || null,
      source: "payout",
    }));
}

// Everything earned or paid strictly BEFORE the period, netted — what the
// business already owed walking into the month.
export function openingLiability(
  deals: DealLike[],
  events: EventLike[],
  payouts: PayoutLike[],
  period: string,
  today = new Date()
): number {
  let earned = 0;
  let paid = 0;
  for (const d of deals) {
    if (d.deal_kind !== "retainer") continue;
    if (d.deal_status === "cancelled" || d.deal_status === "negotiating") continue;
    for (const m of d.payment_terms || []) {
      const on = monthOf(earnedOn(m, d, today));
      if (on && on < period) earned += Number(m.amount) || 0;
      const pd = monthOf(m.paid_date);
      if (m.is_paid && pd && pd < period) paid += Number(m.amount) || 0;
    }
  }
  for (const e of events) if (e.period < period) earned += Number(e.amount) || 0;
  for (const p of payouts) {
    const pd = monthOf(p.sent_at);
    if (pd && pd < period) paid += Number(p.amount) || 0;
  }
  return round2(earned - paid);
}

export function undatedPayments(deals: DealLike[]): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const d of deals) {
    for (const m of d.payment_terms || []) {
      if (m.is_paid && !m.paid_date) { total += Number(m.amount) || 0; count++; }
    }
  }
  return { total: round2(total), count };
}

export function summarize(
  lines: AccrualLine[],
  opening: number,
  period: string,
  unplaced: { total: number; count: number } = { total: 0, count: 0 }
): AccrualSummary {
  const accrued = round2(lines.reduce((t, l) => t + l.accrued, 0));
  const paid = round2(lines.reduce((t, l) => t + l.paid, 0));
  return {
    period,
    currency: REPORT_CURRENCY,
    opening_liability: round2(opening),
    accrued,
    paid,
    closing_liability: round2(opening + accrued - paid),
    creators: new Set(lines.map((l) => l.creator_name)).size,
    unplaced_paid: unplaced.total,
    unplaced_count: unplaced.count,
  };
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(lines: AccrualLine[], summary: AccrualSummary): string {
  const head = ["period","creator","handle","category","description","accrued_usd","paid_usd","paid_date","reference","source"];
  const rows = lines
    .slice()
    .sort((a, b) => a.creator_name.localeCompare(b.creator_name) || a.category.localeCompare(b.category))
    .map((l) => [l.period,l.creator_name,l.handle,l.category,l.description,l.accrued.toFixed(2),l.paid.toFixed(2),l.paid_date ?? "",l.reference ?? "",l.source].map(csvCell).join(","));

  // The reconciliation a bookkeeper actually posts from, carried with the detail
  // so the file stands alone once it leaves the app.
  const tail = [
    "",
    `# Accrual report,${summary.period}`,
    `# All amounts in,${summary.currency}`,
    `# Opening accrued liability,${summary.opening_liability.toFixed(2)}`,
    `# Accrued this period,${summary.accrued.toFixed(2)}`,
    `# Paid this period,${summary.paid.toFixed(2)}`,
    `# Closing accrued liability,${summary.closing_liability.toFixed(2)}`,
    `# Creators,${summary.creators}`,
  ];
  if (summary.unplaced_count > 0) {
    tail.push(
      `# NOTE — ${summary.unplaced_count} payment(s) totalling ${summary.unplaced_paid.toFixed(2)} are recorded as paid with no date`,
      "# and so appear in no period. The closing liability above is overstated by that amount until dates are added.",
    );
  }
  return [head.join(","), ...rows, ...tail].join("\n");
}

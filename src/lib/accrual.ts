import { CampaignDeal } from "@/types/database";
import { milestoneEarnedOn, milestoneAmount, milestoneCategory, isCommittedDeal } from "./deal-milestones";

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

// Every deal earns per installment, on the date its gate was met — a $2,400
// four-month deal paid upfront is not a $2,400 expense in the month the cash
// left. One-off collabs work the same way: a 50/50 deal is two expenses in two
// months, not one lump at the campaign start. This pass covers BOTH kinds, and
// is also where deal cash appears — one-off milestone payments used to be
// counted nowhere, overstating the closing liability by every dollar of them.
export function retainerLines(deals: DealLike[], period: string, today = new Date()): AccrualLine[] {
  const lines: AccrualLine[] = [];
  for (const d of deals) {
    if (!isCommittedDeal(d as any)) continue;
    for (const m of d.payment_terms || []) {
      const category = milestoneCategory(m as any, d as any);
      const earned = milestoneEarnedOn(m as any, d as any, today);
      const amount = milestoneAmount(m as any, d as any);
      const accruedHere = monthOf(earned) === period ? amount : 0;
      const paidHere = m.is_paid && monthOf(m.paid_date) === period ? amount : 0;
      if (accruedHere === 0 && paidHere === 0) continue;
      lines.push({
        period, ...who(d),
        category,
        // Flat usage-rights fees share the whitelisting heading with the
        // ad-spend commission; the note is what tells the bookkeeper which is which.
        description: (m.description || "Installment") + (category === "whitelisting" ? " · usage fee" : ""),
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
    // Deal money (retainer + paid_collab events) is read from the deals
    // themselves above, at milestone level with its paid side. Counting the
    // ledger copies too would double every deal.
    .filter((e) => e.event_type !== "retainer" && e.event_type !== "paid_collab")
    .map((e) => ({
      period, ...who(e),
      // Ad-spend commission books under whitelisting, per the bookkeeper's
      // categories: one heading for everything whitelisting-related.
      category: e.event_type === "ad_spend" ? "whitelisting" : e.event_type,
      description:
        // A manual adjustment carries its own story (e.g. an agreed settlement)
        (e as any).detail?.description ? String((e as any).detail.description)
        : e.event_type === "refund" ? "Refund adjustment"
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
  // Must mirror retainerLines / eventLines exactly, or the opening balance
  // stops tying to the prior month's close.
  for (const d of deals) {
    if (!isCommittedDeal(d as any)) continue;
    for (const m of d.payment_terms || []) {
      const amount = milestoneAmount(m as any, d as any);
      const on = monthOf(milestoneEarnedOn(m as any, d as any, today));
      if (on && on < period) earned += amount;
      const pd = monthOf(m.paid_date);
      if (m.is_paid && pd && pd < period) paid += amount;
    }
  }
  for (const e of events) {
    if (e.event_type === "retainer" || e.event_type === "paid_collab") continue; // deal money counted above
    if (e.period < period) earned += Number(e.amount) || 0;
  }
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

// ---------------------------------------------------------------------------
// Bookkeeper format: totals first, one row per creator, no transaction rows.
// Mirrors the payments page grid so the two read the same. The old per-event
// detail stays available behind format=detail for tracing a specific figure.
// ---------------------------------------------------------------------------

const bucketOf = (category: string): "affiliate" | "whitelisting" | "retainer" | "paid_collab" | "payout" => {
  if (category === "refund") return "affiliate"; // refunds net against the commission they adjust
  if (category === "whitelisting" || category === "retainer" || category === "paid_collab" || category === "payout") return category;
  return "affiliate";
};

export function toBookkeeperCsv(
  lines: AccrualLine[],
  summary: AccrualSummary,
  methodByHandle: Record<string, string> = {}
): string {
  type Row = { name: string; handle: string; affiliate: number; whitelisting: number; retainer: number; paidCollab: number; paid: number };
  const byCreator = new Map<string, Row>();
  const totals = { affiliate: 0, whitelisting: 0, retainer: 0, paidCollab: 0, paid: 0 };

  for (const l of lines) {
    const key = l.handle || l.creator_name;
    let r = byCreator.get(key);
    if (!r) { r = { name: l.creator_name, handle: l.handle, affiliate: 0, whitelisting: 0, retainer: 0, paidCollab: 0, paid: 0 }; byCreator.set(key, r); }
    const b = bucketOf(l.category);
    if (b === "affiliate") { r.affiliate += l.accrued; totals.affiliate += l.accrued; }
    else if (b === "whitelisting") { r.whitelisting += l.accrued; totals.whitelisting += l.accrued; }
    else if (b === "retainer") { r.retainer += l.accrued; totals.retainer += l.accrued; }
    else if (b === "paid_collab") { r.paidCollab += l.accrued; totals.paidCollab += l.accrued; }
    r.paid += l.paid;
    totals.paid += l.paid;
  }

  const money = (n: number) => (Math.abs(n) < 0.005 ? "" : round2(n).toFixed(2));
  const out: string[] = [];
  const row = (...cells: unknown[]) => out.push(cells.map(csvCell).join(","));

  row("Accrual report", summary.period);
  row("Currency", summary.currency);
  out.push("");

  // The figures the bookkeeper posts, first thing on the sheet.
  row("PARTNERSHIP TYPE", "EARNED THIS PERIOD");
  row("Affiliate commission (net of refunds)", round2(totals.affiliate).toFixed(2));
  row("Whitelisting (ad-spend share + usage fees)", round2(totals.whitelisting).toFixed(2));
  row("Paid collabs (one-offs + retainers)", round2(totals.paidCollab + totals.retainer).toFixed(2));
  row("TOTAL EARNED", summary.accrued.toFixed(2));
  out.push("");

  row("LIABILITY RECONCILIATION", "");
  row("Opening accrued liability", summary.opening_liability.toFixed(2));
  row("Earned this period", summary.accrued.toFixed(2));
  row("Paid this period", summary.paid.toFixed(2));
  row("Closing accrued liability", summary.closing_liability.toFixed(2));
  out.push("");

  row("BY CREATOR", "", "", "", "", "", "", "", "");
  row("Creator", "Handle", "Payment method", "Affiliate", "Whitelisting", "Retainer", "One-off", "Earned", "Paid this period");
  const rows = [...byCreator.values()].sort((a, b) => (b.affiliate + b.whitelisting + b.retainer + b.paidCollab) - (a.affiliate + a.whitelisting + a.retainer + a.paidCollab));
  for (const r of rows) {
    const earned = r.affiliate + r.whitelisting + r.retainer + r.paidCollab;
    row(r.name, r.handle, methodByHandle[r.handle] || methodByHandle[r.name] || "",
      money(r.affiliate), money(r.whitelisting), money(r.retainer), money(r.paidCollab),
      round2(earned).toFixed(2), money(r.paid));
  }
  row("TOTAL", "", "",
    round2(totals.affiliate).toFixed(2), round2(totals.whitelisting).toFixed(2),
    round2(totals.retainer).toFixed(2), round2(totals.paidCollab).toFixed(2),
    summary.accrued.toFixed(2), summary.paid.toFixed(2));

  if (summary.unplaced_count > 0) {
    out.push("");
    row("NOTE", `${summary.unplaced_count} payment(s) totalling ${summary.unplaced_paid.toFixed(2)} are recorded as paid with no date and appear in no period. Closing liability is overstated by that amount until dates are added.`);
  }
  return out.join("\n") + "\n";
}

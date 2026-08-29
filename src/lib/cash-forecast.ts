import { allocatePayments, PaymentLike } from "./payout-allocation";
import { dueDateForPeriod } from "./payment-due";
import { inferGate } from "./retainers";
import {
  DealLike,
  isCommittedDeal,
  milestoneAmount,
  milestoneEarnedOn,
  milestonePayments,
} from "./deal-milestones";

// The cash forecast served to the nama-inventory cash planner — upcoming
// influencer outflows bucketed by ISO week. The full contract (shape, auth,
// semantics, what is deliberately excluded) lives in
// docs/cash-forecast-contract.md; keep the two in lockstep.
//
// Two mutually exclusive sources:
//   period_balance   — earned-but-unpaid ledger balances, dated by the period's
//                      contractual due date (overdue → current week)
//   deal_installment — committed-deal milestones whose gate has NOT been met,
//                      which therefore exist nowhere in the ledger yet
// Unearned money with no determinable date is reported in `unscheduled` rather
// than guessed into a week.

export const FORECAST_VERSION = 1;
export const DEFAULT_HORIZON_WEEKS = 13;
export const MAX_HORIZON_WEEKS = 26;

export interface ForecastEvent {
  source: "influencer";
  kind: "period_balance" | "deal_installment";
  label: string;
  creator: string;
  amount: number;
  expected_date: string | null; // null only inside `unscheduled`
  confidence: "confirmed" | "estimated";
  reference: string;
}

export interface ForecastWeek {
  iso_week: string;
  total: number;
  events: ForecastEvent[];
}

export interface CashForecast {
  version: number;
  generated_at: string;
  currency: "USD";
  horizon_weeks: number;
  start_week: string;
  weeks: ForecastWeek[];
  beyond_horizon: { total: number; count: number };
  unscheduled: { total: number; count: number; events: ForecastEvent[] };
}

export interface LedgerEventRow {
  influencer_id: string | null;
  legacy_affiliate_id: string | null;
  period: string;
  amount: number | string;
}

export interface PayoutRow extends PaymentLike {
  influencer_id: string | null;
  legacy_affiliate_id: string | null;
}

export interface CreatorName {
  name?: string | null;
  handle?: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** ISO-8601 week of a UTC date, in the planner's format: "2026-W35". */
export function isoWeekOf(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // Mon=1 … Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - day); // shift to the week's Thursday
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodLabel = (period: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : period;
};

const displayName = (n: CreatorName | undefined) => {
  const name = n?.name || "Unknown";
  return n?.handle ? `${name} (@${n.handle})` : name;
};

export function buildCashForecast(input: {
  events: LedgerEventRow[];
  payouts: PayoutRow[];
  deals: DealLike[];
  names: Map<string, CreatorName>; // keyed "inf:<id>" / "legacy:<id>"
  today?: Date;
  horizonWeeks?: number;
}): CashForecast {
  const today = input.today ?? new Date();
  const horizonWeeks = Math.min(
    Math.max(1, input.horizonWeeks ?? DEFAULT_HORIZON_WEEKS),
    MAX_HORIZON_WEEKS,
  );
  const todayIso = today.toISOString().slice(0, 10);

  // A payout recorded on a legacy stream can settle earnings on the partner
  // stream of the same person (and vice versa), so both streams must merge
  // before allocation — same person, one balance. Any ledger event carrying
  // both ids proves the link.
  const legacyToInf = new Map<string, string>();
  for (const e of input.events) {
    if (e.influencer_id && e.legacy_affiliate_id) legacyToInf.set(e.legacy_affiliate_id, e.influencer_id);
  }
  const keyOf = (r: { influencer_id: string | null; legacy_affiliate_id: string | null }): string => {
    if (r.influencer_id) return `inf:${r.influencer_id}`;
    const linked = r.legacy_affiliate_id ? legacyToInf.get(r.legacy_affiliate_id) : null;
    return linked ? `inf:${linked}` : `legacy:${r.legacy_affiliate_id}`;
  };

  const earnedByKeyMonth = new Map<string, Map<string, number>>();
  for (const e of input.events) {
    const key = keyOf(e);
    let m = earnedByKeyMonth.get(key);
    if (!m) { m = new Map(); earnedByKeyMonth.set(key, m); }
    m.set(e.period, (m.get(e.period) || 0) + (Number(e.amount) || 0));
  }
  const paymentsByKey = new Map<string, PaymentLike[]>();
  const pushPayment = (key: string, p: PaymentLike) => {
    if (!paymentsByKey.has(key)) paymentsByKey.set(key, []);
    paymentsByKey.get(key)!.push(p);
  };
  for (const p of input.payouts) pushPayment(keyOf(p), p);
  // Deal payments live on the deal (the paid tick on the collabs page), not in
  // creator_payouts — without them every milestone-paid deal reads as owed.
  for (const dp of milestonePayments(input.deals, today)) {
    pushPayment(keyOf({ influencer_id: dp.influencer_id, legacy_affiliate_id: null }), {
      amount: dp.amount,
      covers_period: dp.covers_period,
    });
  }

  const dated: ForecastEvent[] = [];
  const unscheduled: ForecastEvent[] = [];

  // Source 1: earned-but-unpaid period balances, FIFO-allocated exactly as the
  // payments-v2 grid does, due per the Creator Terms.
  for (const [key, months] of earnedByKeyMonth) {
    const earnedByMonth = [...months.entries()].map(([period, amount]) => ({ period, amount }));
    const { paidByMonth } = allocatePayments(earnedByMonth, paymentsByKey.get(key) || []);
    for (const { period, amount } of earnedByMonth) {
      const balance = round2(amount - (paidByMonth[period] || 0));
      if (balance <= 0.01) continue;
      const due = dueDateForPeriod(period);
      dated.push({
        source: "influencer",
        kind: "period_balance",
        label: `${periodLabel(period)} commissions balance`,
        creator: displayName(input.names.get(key)),
        amount: balance,
        expected_date: due && due > todayIso ? due : todayIso, // overdue leaves ASAP
        confidence: "confirmed",
        reference: `period:${period}:${key}`,
      });
    }
  }

  // Source 2: committed-deal installments whose gate has not been met. Earned
  // milestones already flow through commission_events (source 1), so only the
  // unearned remainder can appear here — no overlap by construction.
  for (const d of input.deals) {
    if (!isCommittedDeal(d) || !d.influencer_id) continue;
    const creator = displayName(input.names.get(`inf:${d.influencer_id}`));
    for (const m of d.payment_terms || []) {
      if (m.is_paid) continue; // paid-but-undated history, not a future outflow
      if (milestoneEarnedOn(m, d, today)) continue;
      const amount = milestoneAmount(m, d);
      if (amount <= 0) continue;
      const gate = inferGate(m as any);
      // Calendar gates WILL pass; content/manual gates make any date a plan.
      const date =
        gate === "on_date" ? m.due_on || null :
        gate === "on_execution" ? d.starts_on || null :
        m.due_on || null;
      const confidence: ForecastEvent["confidence"] =
        (gate === "on_date" || gate === "on_execution") && date ? "confirmed" : "estimated";
      const event: ForecastEvent = {
        source: "influencer",
        kind: "deal_installment",
        label: m.description || "Installment",
        creator,
        amount: round2(amount),
        expected_date: date && date > todayIso ? date : date ? todayIso : null,
        confidence,
        reference: `deal:${d.id}:${m.id}`,
      };
      (event.expected_date ? dated : unscheduled).push(event);
    }
  }

  // Bucket dated obligations into the horizon's ISO weeks.
  const weekKeys: string[] = [];
  const weekIndex = new Map<string, number>();
  for (let i = 0; i < horizonWeeks; i++) {
    const wk = isoWeekOf(new Date(today.getTime() + i * 7 * 86_400_000));
    weekIndex.set(wk, i);
    weekKeys.push(wk);
  }
  const weeks: ForecastWeek[] = weekKeys.map((iso_week) => ({ iso_week, total: 0, events: [] }));
  let beyondTotal = 0;
  let beyondCount = 0;
  for (const ev of dated) {
    const idx = weekIndex.get(isoWeekOf(new Date(`${ev.expected_date}T00:00:00Z`)));
    if (idx === undefined) { beyondTotal = round2(beyondTotal + ev.amount); beyondCount++; continue; }
    weeks[idx].events.push(ev);
    weeks[idx].total = round2(weeks[idx].total + ev.amount);
  }
  for (const w of weeks) {
    w.events.sort((a, b) =>
      (a.expected_date || "").localeCompare(b.expected_date || "") || b.amount - a.amount);
  }

  return {
    version: FORECAST_VERSION,
    generated_at: today.toISOString(),
    currency: "USD",
    horizon_weeks: horizonWeeks,
    start_week: weekKeys[0],
    weeks,
    beyond_horizon: { total: beyondTotal, count: beyondCount },
    unscheduled: {
      total: round2(unscheduled.reduce((s, e) => s + e.amount, 0)),
      count: unscheduled.length,
      events: unscheduled,
    },
  };
}

// Payment receipts: the creator-facing account of what one transfer settled.
//
// A receipt is a SNAPSHOT taken when the payment is recorded and stored on the
// payout row. It must never be recomputed live: the FIFO allocation shifts
// whenever history is edited (a re-dated payment reshuffles months), and a
// receipt that silently rewrites itself after the creator has read it is worse
// than none. Payouts recorded before receipts existed get a reconstruction
// from today's allocation, explicitly labelled as such.

export interface ReceiptLine {
  period: string | null; // YYYY-MM the slice applied to; null = credit/overpayment
  label: string;         // creator-facing, e.g. "July 2026 — settled in full"
  amount: number;
}

export interface PayoutReceipt {
  version: 1;
  generated_at: string;
  reconstructed?: boolean; // built after the fact from current allocation
  lines: ReceiptLine[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compute and store the snapshot receipt for a just-recorded payout row.
 * Reads the creator's ledger state (with the new payout excluded), spreads the
 * payout over the unpaid months, and writes the receipt onto the row. Failures
 * are swallowed by the caller — a payment must never fail to record because
 * the receipt column is not migrated yet.
 *
 * Scope note: months are read by the payout's own subject id only; a creator
 * holding both a partner and a legacy identity gets receipt lines for the
 * paid identity's months.
 */
export async function snapshotPayoutReceipt(
  db: any,
  payout: { id: string; amount: number | string; influencer_id: string | null; legacy_affiliate_id: string | null; covers_period?: string | null; is_test?: boolean },
): Promise<void> {
  const { allocatePayments } = await import("./payout-allocation");
  const { milestonePayments } = await import("./deal-milestones");
  const { fetchAllRows } = await import("./partnerships/paginate");

  const subjCol = payout.influencer_id ? "influencer_id" : "legacy_affiliate_id";
  const subjVal = payout.influencer_id || payout.legacy_affiliate_id;

  const events = await fetchAllRows<any>((from, to) =>
    (db.from("commission_events") as any)
      .select("period, amount").eq(subjCol, subjVal).order("id").range(from, to));
  const { data: priorPayouts } = await (db.from("creator_payouts") as any)
    .select("id, amount, covers_period")
    .eq(subjCol, subjVal).eq("is_test", !!payout.is_test)
    .neq("id", payout.id);
  let dealPayments: { amount: number; covers_period: string }[] = [];
  if (payout.influencer_id) {
    const { data: deals } = await (db.from("campaign_deals") as any)
      .select("id, influencer_id, deal_kind, deal_status, whitelisting_status, total_deal_value, starts_on, payment_terms")
      .eq("influencer_id", payout.influencer_id)
      .in("deal_status", ["active", "closed"]);
    dealPayments = milestonePayments(deals || []).map((dp) => ({ amount: dp.amount, covers_period: dp.covers_period }));
  }

  const totals = new Map<string, number>();
  for (const e of events) totals.set(e.period, round2((totals.get(e.period) || 0) + (Number(e.amount) || 0)));
  const earnedByMonth = [...totals.entries()].map(([period, amount]) => ({ period, amount }))
    .sort((a, b) => a.period.localeCompare(b.period));
  const { paidByMonth } = allocatePayments(earnedByMonth, [...(priorPayouts || []), ...dealPayments]);
  const unpaid = earnedByMonth
    .map((m) => ({ period: m.period, earned: round2(m.amount), alreadyPaid: round2(paidByMonth[m.period] || 0) }))
    .filter((m) => m.earned - m.alreadyPaid > 0.005);

  const receipt: PayoutReceipt = {
    version: 1,
    generated_at: new Date().toISOString(),
    lines: buildPoolLines(Number(payout.amount) || 0, unpaid, payout.covers_period || null),
  };
  await (db.from("creator_payouts") as any).update({ receipt }).eq("id", payout.id);
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  if (!y || !m) return period;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Spread one pooled amount over a creator's unpaid months, oldest first, and
 * phrase each slice for the creator. `unpaidMonths` is the state at the moment
 * of payment: per-month earned totals and how much of each was already paid.
 */
export function buildPoolLines(
  amount: number,
  unpaidMonths: { period: string; earned: number; alreadyPaid: number }[],
  pinnedPeriod?: string | null
): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  let remaining = round2(amount);
  const months = [...unpaidMonths].sort((a, b) =>
    // A payment pinned to a month settles that month first, then pools.
    (a.period === pinnedPeriod ? -1 : b.period === pinnedPeriod ? 1 : 0) || a.period.localeCompare(b.period));
  for (const m of months) {
    if (remaining <= 0.005) break;
    const open = round2(m.earned - m.alreadyPaid);
    if (open <= 0.005) continue;
    const take = round2(Math.min(remaining, open));
    remaining = round2(remaining - take);
    const settles = take >= open - 0.005;
    const priorNote = m.alreadyPaid > 0.005 ? ` (with $${m.alreadyPaid.toFixed(2)} previously applied)` : "";
    lines.push({
      period: m.period,
      label: settles
        ? `${periodLabel(m.period)} — $${m.earned.toFixed(2)} settled in full${priorNote}`
        : `${periodLabel(m.period)} — partial, $${round2(open - take).toFixed(2)} remains of $${m.earned.toFixed(2)}`,
      amount: take,
    });
  }
  if (remaining > 0.005) {
    lines.push({ period: null, label: "Credited toward future earnings", amount: remaining });
  }
  return lines;
}

/**
 * Reconstruct per-payment coverage for payouts recorded before receipts
 * existed: replay every payment in the order the money moved (pinned
 * covers_period first within its own application), attributing month slices
 * as each payment lands. Returns one receipt per input payment, in order.
 */
export function reconstructReceipts(
  earnedByMonth: { period: string; amount: number }[],
  payments: { amount: number; covers_period?: string | null; sent_at?: string | null }[]
): PayoutReceipt[] {
  const months = [...earnedByMonth].sort((a, b) => a.period.localeCompare(b.period));
  const paidSoFar = new Map<string, number>(months.map((m) => [m.period, 0]));
  const indexed = payments.map((p, i) => ({ ...p, i }));
  // Replay in the order money actually moved; undated payments last.
  indexed.sort((a, b) => String(a.sent_at || "9999").localeCompare(String(b.sent_at || "9999")) || a.i - b.i);

  const receipts: PayoutReceipt[] = new Array(payments.length);
  for (const p of indexed) {
    let remaining = round2(Number(p.amount) || 0);
    const lines: ReceiptLine[] = [];
    const apply = (period: string, earned: number) => {
      const already = paidSoFar.get(period) || 0;
      const open = round2(earned - already);
      if (open <= 0.005 || remaining <= 0.005) return;
      const take = round2(Math.min(remaining, open));
      remaining = round2(remaining - take);
      paidSoFar.set(period, round2(already + take));
      const settles = take >= open - 0.005;
      lines.push({
        period,
        label: settles
          ? `${periodLabel(period)} — $${earned.toFixed(2)} settled in full${already > 0.005 ? ` (with $${already.toFixed(2)} previously applied)` : ""}`
          : `${periodLabel(period)} — partial, $${round2(open - take).toFixed(2)} remains of $${earned.toFixed(2)}`,
        amount: take,
      });
    };
    if (p.covers_period) {
      const m = months.find((x) => x.period === p.covers_period);
      if (m) apply(m.period, m.amount);
    }
    for (const m of months) apply(m.period, m.amount);
    if (remaining > 0.005) lines.push({ period: null, label: "Credited toward future earnings", amount: remaining });
    receipts[p.i] = { version: 1, generated_at: new Date().toISOString(), reconstructed: true, lines };
  }
  return receipts;
}

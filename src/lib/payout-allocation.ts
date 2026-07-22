// FIFO payout allocation — the single definition of "which months has this
// creator been paid for". Payments pinned to a month (covers_period) settle
// that month first; everything else is a pool applied to the oldest unpaid
// months first; whatever's left over is credit / overpayment. Used by both
// the payments-v2 monthly grid API and the per-creator History drawer so the
// two views can never disagree about paid status.

export interface EarnedMonth {
  period: string; // YYYY-MM
  amount: number;
}

export interface PaymentLike {
  amount: number | string | null;
  covers_period?: string | null;
}

export interface Allocation {
  paidByMonth: Record<string, number>; // period -> amount allocated to it
  credit: number; // leftover pool beyond all earned months (overpayment)
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function allocatePayments(earnedByMonth: EarnedMonth[], payments: PaymentLike[]): Allocation {
  const months = [...earnedByMonth].sort((a, b) => a.period.localeCompare(b.period)); // oldest first
  const paidByMonth: Record<string, number> = {};
  let pool = 0;
  for (const p of payments || []) {
    if (p.covers_period) paidByMonth[p.covers_period] = (paidByMonth[p.covers_period] || 0) + (Number(p.amount) || 0);
    else pool += Number(p.amount) || 0;
  }
  for (const m of months) {
    const need = Math.max(0, m.amount - (paidByMonth[m.period] || 0));
    const take = Math.min(pool, need);
    paidByMonth[m.period] = (paidByMonth[m.period] || 0) + take;
    pool = round2(pool - take);
  }
  for (const k of Object.keys(paidByMonth)) paidByMonth[k] = round2(paidByMonth[k]);
  return { paidByMonth, credit: round2(pool) };
}

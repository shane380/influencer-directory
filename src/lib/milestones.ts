import { PaymentMilestone } from "@/types/database";

// Adding months to a month-end date must not roll into the following month:
// naive date arithmetic turns 31 Jan + 1 month into 3 March, skipping February
// entirely and putting an installment in the wrong period. Clamp to the last
// day of the target month instead.
export function addMonthsClamped(date: string, months: number): string {
  const src = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const day = src.getUTCDate();
  const target = new Date(Date.UTC(src.getUTCFullYear(), src.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

// Shared by the create and edit deal dialogs, which previously carried identical
// copies of this and drifted apart.
//
// Everything a human recorded about a milestone survives regeneration: when it
// EARNED (gate/earned_on — what accrual is built from) and, for settled ones,
// the amount and who/when paid it. Its description survives too, since a deal
// can carry wording specific to its own terms.
export function preserveHistory(
  fresh: PaymentMilestone[],
  prev: PaymentMilestone[]
): PaymentMilestone[] {
  return fresh.map((m) => {
    const existing = prev.find((p) => p.id === m.id);
    if (!existing) return m;
    const kept: PaymentMilestone = {
      ...m,
      description: existing.description || m.description,
      gate: existing.gate ?? m.gate,
      earned_on: existing.earned_on ?? null,
      due_on: existing.due_on ?? null,
    };
    if (!existing.is_paid) return kept;
    return {
      ...kept,
      amount: existing.amount,
      is_paid: true,
      paid_date: existing.paid_date,
      paid_by: existing.paid_by,
    };
  });
}

// Rescale a schedule to a new deal total. Settled milestones are historical
// records and keep their amounts; amounts that already reconcile are left alone,
// because re-deriving them from percentages drifts on splits like 3 x 33.33%.
export function rescaleToTotal(
  prev: PaymentMilestone[],
  totalDealValue: number
): PaymentMilestone[] {
  if (prev.length === 0) return prev;
  const sum = prev.reduce((t, m) => t + (m.amount || 0), 0);
  if (Math.abs(sum - totalDealValue) < 0.01) return prev;
  return prev.map((m) =>
    m.is_paid
      ? m
      : { ...m, amount: Math.round(totalDealValue * (m.percentage / 100) * 100) / 100 }
  );
}

// A monthly schedule: one installment per month of the term. Used for retainers
// billed by the calendar — whitelisting usage fees are the clearest case, since
// the right is granted over time and accrues whether or not content changes
// hands, so each installment is date-gated rather than content-gated.
export function generateMonthlyMilestones(
  total: number,
  months: number,
  startDate: string | null
): PaymentMilestone[] {
  if (!months || months < 1) return [];
  const per = Math.round((total / months) * 100) / 100;
  return Array.from({ length: months }, (_, i) => {
    // The final installment absorbs the rounding remainder so the schedule
    // always sums back to the deal total (3 x 33.33 would lose a cent).
    const amount = i === months - 1
      ? Math.round((total - per * (months - 1)) * 100) / 100
      : per;
    const due = startDate ? addMonthsClamped(startDate, i) : null;
    return {
      id: `m${i + 1}`,
      description: `Month ${i + 1}`,
      percentage: Math.round((amount / (total || 1)) * 10000) / 100,
      amount,
      is_paid: false,
      paid_date: null,
      paid_by: null,
      gate: "on_date" as const,
      due_on: due,
      earned_on: null,
    };
  });
}

/**
 * Round every amount to cents and absorb any percentage-rounding drift into
 * the LAST unpaid milestone, so the schedule always sums to the deal total.
 * Typing thirds as 33.33/33.33/33.34 used to store $799.92 monthly against an
 * "$800 a month" agreement — the pennies belong to the schedule, not lost.
 * Paid milestones are never altered: their amount is a record of money moved.
 */
export function snapMilestonesToTotal(
  milestones: PaymentMilestone[],
  total: number
): PaymentMilestone[] {
  if (!milestones.length || !(total > 0)) return milestones;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const out = milestones.map((m) => ({ ...m, amount: r2(Number(m.amount) || 0) }));
  const sum = r2(out.reduce((s, m) => s + m.amount, 0));
  const drift = r2(total - sum);
  // Only correct rounding residue, never a genuinely different schedule
  // (e.g. a deliberate partial schedule while a deal is being negotiated).
  if (drift === 0 || Math.abs(drift) > 0.05 * milestones.length) return out;
  for (let i = out.length - 1; i >= 0; i--) {
    if (!out[i].is_paid) { out[i] = { ...out[i], amount: r2(out[i].amount + drift) }; break; }
  }
  return out;
}

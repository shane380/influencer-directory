import { PaymentMilestone } from "@/types/database";

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

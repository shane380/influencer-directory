// When a month's partner payments are due, per Creator Terms of Use section 6:
// "All payments are made by the end of the following calendar month" — so
// August's earnings are due 30 September.
//
// Derived from the period rather than stored. creator_payments has no due_date
// column and the payments-v2 ledger has no per-payment row at all, so deriving
// keeps every historical period correct without a backfill, and means changing
// the rule later is a one-line change here rather than a data migration.

// The end-of-month rule arrived with v2 of the Creator Terms, effective August
// 2026. Earlier months were earned under the old promise — the 5th of the
// following month — and are judged against that. Applying the new rule
// backwards would relabel settled history against terms nobody agreed to at
// the time, and would show months as "due soon" that were actually paid weeks
// before their supposed deadline.
export const END_OF_MONTH_RULE_FROM = "2026-08";

/** When `period`'s payments were due, as 'YYYY-MM-DD', under the terms in force then. */
export function dueDateForPeriod(period: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12

  if (period < END_OF_MONTH_RULE_FROM) {
    // Old terms: the 5th of the following month.
    return new Date(Date.UTC(year, month, 5)).toISOString().slice(0, 10);
  }
  // Current terms: the last day of the following month. Day 0 of the month
  // after next is the last day of next month.
  return new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
}

export type DueState = "paid" | "upcoming" | "due_soon" | "overdue";

/** Days before the due date at which a period starts reading as "due soon". */
export const DUE_SOON_DAYS = 7;

/**
 * Where a period stands against its deadline.
 *
 * `balance` is what is still owed. A settled period is never late however old
 * it is, and a period with nothing outstanding is treated as paid.
 */
export function dueState(
  period: string,
  balance: number,
  today: Date = new Date()
): DueState {
  if (balance <= 0.01) return "paid";

  const due = dueDateForPeriod(period);
  if (!due) return "upcoming";

  const todayIso = today.toISOString().slice(0, 10);
  if (todayIso > due) return "overdue";

  const msPerDay = 86_400_000;
  const daysLeft = Math.ceil(
    (Date.parse(`${due}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / msPerDay
  );
  return daysLeft <= DUE_SOON_DAYS ? "due_soon" : "upcoming";
}

/** "30 September 2026" */
export function formatDueDate(due: string): string {
  const d = new Date(`${due}T00:00:00Z`);
  if (isNaN(d.getTime())) return due;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

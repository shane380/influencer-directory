// When a month's partner payments are due, per Creator Terms of Use section 6:
// "All payments are made by the end of the following calendar month" — so
// August's earnings are due 30 September.
//
// Derived from the period rather than stored. creator_payments has no due_date
// column and the payments-v2 ledger has no per-payment row at all, so deriving
// keeps every historical period correct without a backfill, and means changing
// the rule later is a one-line change here rather than a data migration.

/** Last day of the month after `period` ('YYYY-MM'), as 'YYYY-MM-DD'. */
export function dueDateForPeriod(period: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]); // 1-12
  // Day 0 of month+1 (0-indexed month+2 is really month+1 here) is its last day.
  const d = new Date(Date.UTC(year, month + 1, 0));
  return d.toISOString().slice(0, 10);
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

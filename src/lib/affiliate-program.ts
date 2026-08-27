// Nama Affiliate Program standard, as published in section 13.2 of the Creator
// Terms of Use: 15% off for the affiliate's audience, 10% commission to the
// affiliate.
//
// These are two different numbers. Discount code creation used to derive the
// customer discount from the commission rate, which made every 10%-commission
// partner's code give 10% off instead of 15%.
export const AFFILIATE_DISCOUNT_PERCENT = 15;
export const AFFILIATE_COMMISSION_PERCENT = 10;

export type RateSubject = { creatorId: string } | { legacyAffiliateId: string };

/**
 * The commission rate in force for a given payment month, as a percentage.
 *
 * `month` is the `YYYY-MM` string the payment generator works in. Rates are
 * resolved against the first of that month, so a rate starting mid-month
 * applies from the following month rather than part-way through one.
 *
 * Falls back to the caller's current scalar rate when no scheduled rate covers
 * the month, which is what makes historical months work without a backfill.
 */
export async function commissionRateForMonth(
  // Service-role client; these tables are absent from src/types/database.ts.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  subject: RateSubject,
  month: string,
  fallback: number
): Promise<number> {
  const column = 'creatorId' in subject ? 'creator_id' : 'legacy_affiliate_id';
  const value = 'creatorId' in subject ? subject.creatorId : subject.legacyAffiliateId;

  const { data, error } = await db
    .from('affiliate_commission_rates')
    .select('commission_rate')
    .eq(column, value)
    .lte('effective_from', `${month}-01`)
    .order('effective_from', { ascending: false })
    .limit(1);

  // A lookup failure must not silently reprice anyone — fall back to the rate
  // already on the subject row rather than guessing.
  if (error || !data?.length) return fallback;

  return Number(data[0].commission_rate);
}

function subjectKey(subject: RateSubject): string {
  return 'creatorId' in subject ? `c:${subject.creatorId}` : `l:${subject.legacyAffiliateId}`;
}

export interface CommissionRateSchedule {
  /** Rate in force for `subject` in `month` ('YYYY-MM'), as a percentage. */
  rateForMonth(subject: RateSubject, month: string, fallback: number): number;
}

/**
 * Load the whole rate schedule once and resolve (subject, month) synchronously.
 *
 * Callers resolve several months at a time — a dashboard shows the current month
 * plus history — and one query per month adds up. The table is tens of rows.
 *
 * Throws rather than degrading to the caller's scalar: a silent failure here
 * would reprice every affiliate at once, which is precisely what the schedule
 * exists to prevent.
 */
export async function loadCommissionRateSchedule(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): Promise<CommissionRateSchedule> {
  const { data, error } = await db
    .from('affiliate_commission_rates')
    .select('creator_id, legacy_affiliate_id, commission_rate, effective_from')
    .order('effective_from', { ascending: true });

  if (error) {
    throw new Error(`affiliate_commission_rates load failed: ${error.message}`);
  }

  const index = new Map<string, { from: string; rate: number }[]>();
  for (const row of data || []) {
    const key = row.creator_id ? `c:${row.creator_id}` : `l:${row.legacy_affiliate_id}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key)!.push({ from: row.effective_from, rate: Number(row.commission_rate) });
  }

  return {
    rateForMonth(subject, month, fallback) {
      const entries = index.get(subjectKey(subject));
      if (!entries?.length) return fallback;
      const asOf = `${month}-01`;
      // Rows arrive ascending; the last one that has started is the one in force.
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].from <= asOf) return entries[i].rate;
      }
      return fallback;
    },
  };
}

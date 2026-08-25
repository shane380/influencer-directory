// Nama Affiliate Program standard, as published in section 13.2 of the Creator
// Terms of Use: 15% off for the affiliate's audience, 10% commission to the
// affiliate.
//
// These are two different numbers. Discount code creation used to derive the
// customer discount from the commission rate, which made every 10%-commission
// partner's code give 10% off instead of 15%.
export const AFFILIATE_DISCOUNT_PERCENT = 15;
export const AFFILIATE_COMMISSION_PERCENT = 10;

type RateSubject = { creatorId: string } | { legacyAffiliateId: string };

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

/**
 * Affiliate codes are stored lowercase (see creators.affiliate_code) and
 * matched case-insensitively everywhere — Shopify lookups, revenue sync, the
 * creator dashboard. Anything an admin types gets the same treatment so
 * "Aria15", "ARIA15" and "aria15" are one code.
 *
 * Returns "" when nothing usable is left after normalising.
 */
export function normalizeAffiliateCode(raw: string | null | undefined): string {
  const code = (raw || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (code.length < 3 || code.length > 20) return "";
  return code;
}

import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/**
 * Shared-secret check for the machine-to-machine feeds the nama-inventory
 * server reads (cash forecast, ad creatives). Moved here from the
 * cash-forecast route so every integration route checks the same way.
 *
 * Returns null when CASH_FORECAST_TOKEN is unset (the feeds do not exist yet),
 * false on a wrong or missing bearer, true when it matches.
 */
export function integrationTokenOk(request: NextRequest): boolean | null {
  const expected = process.env.CASH_FORECAST_TOKEN;
  if (!expected) return null;
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

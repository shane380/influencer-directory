import { NextRequest, NextResponse } from "next/server";
import { syncCodeRevenue } from "@/lib/code-revenue-sync";

// Match the other sync crons. The Shopify REST scan in syncCodeRevenue is the
// slow part; a 7-day window finishes in ~10s, but give backfills headroom.
export const maxDuration = 300;

// GET: Daily cron — refresh code-revenue cache for the trailing window.
// Runs after the Meta sync. Defaults to a 7-day rolling window: the daily run
// only needs to (re)capture recent orders and late refunds, and the upsert on
// (affiliate_code, date) is idempotent so older rows stay put. A short window
// keeps the run well under the function timeout — a full 400-day scan exceeds
// the 300s limit and 504s before any rows are written.
// Pass `?days=N` to backfill more (e.g. ?days=120). Single-call backfills are
// bounded by the 300s timeout to roughly ~150 days; go wider in chunks.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = parseInt(request.nextUrl.searchParams.get("days") || "7", 10);
  const days = Math.max(1, Math.min(daysParam, 730)); // cap at 2 years

  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - days);
  start.setUTCHours(0, 0, 0, 0);

  try {
    const result = await syncCodeRevenue(start, today);
    console.log(
      `[cron/sync-code-revenue] ${result.codesProcessed} codes, ` +
      `${result.rowsUpserted} rows upserted in ${result.durationMs}ms`,
    );
    return NextResponse.json({ message: "Code revenue sync complete", ...result });
  } catch (err: any) {
    console.error("[cron/sync-code-revenue] Fatal error:", err);
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { syncCodeRevenue } from "@/lib/code-revenue-sync";

// GET: Daily cron — refresh code-revenue cache for the trailing window.
// Runs after the Meta sync. Defaults to a 60-day rolling window so the trend
// chart's 30d and (most of) 90d views always have fresh cached data.
// Pass `?days=365` to backfill a longer window (one-shot).
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = parseInt(request.nextUrl.searchParams.get("days") || "60", 10);
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

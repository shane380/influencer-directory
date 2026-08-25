import { NextRequest, NextResponse } from "next/server";
import { scanCodeLeaks, DEFAULT_SCAN_DAYS, DETECTION_WINDOW_DAYS } from "@/lib/code-leak-scan";
import { sendLeakDigest } from "@/lib/code-leak-alert";
import { getServiceClient } from "@/lib/code-revenue-sync";
import { getShopifyStoreUrl } from "@/lib/shopify";

// The Shopify order pass is the slow part: ~26 pages at 250/page for a 60-day
// window. Same ceiling as the other sync crons.
export const maxDuration = 300;

// GET: bi-weekly cron (1st and 15th) — scan affiliate codes for leak signals.
//
// Runs after sync-code-revenue at 06:30 so the usage-spike detector reads a
// fresh cache. Fetches DEFAULT_SCAN_DAYS of orders and splits them into a
// 16-day detection window plus a baseline; 16 days is wider than the longest
// gap between runs, so consecutive scans overlap and no order is missed.
//
// `?days=N`    widen the fetch, which lengthens the baseline
// `?window=N`  widen the detection window (use on a first run or catch-up sweep)
// `?dry=1`     compute and return findings without writing rows or sending mail
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = parseInt(
    request.nextUrl.searchParams.get("days") || String(DEFAULT_SCAN_DAYS),
    10,
  );
  const days = Number.isFinite(daysParam) ? daysParam : DEFAULT_SCAN_DAYS;
  const windowParam = parseInt(
    request.nextUrl.searchParams.get("window") || String(DETECTION_WINDOW_DAYS),
    10,
  );
  const windowDays = Number.isFinite(windowParam) ? windowParam : DETECTION_WINDOW_DAYS;
  const dryRun = request.nextUrl.searchParams.get("dry") === "1";

  try {
    const db = getServiceClient();
    const result = await scanCodeLeaks({ days, windowDays, dryRun, supabase: db });

    let emailed: string[] = [];
    if (!dryRun && result.newSignals.length > 0) {
      emailed = await sendLeakDigest({
        db,
        signals: result.newSignals,
        windowStart: result.windowStart,
        windowEnd: result.windowEnd,
        storeUrl: getShopifyStoreUrl(),
      });
    }

    console.log(
      `[cron/scan-code-leaks] ${result.codesTracked} codes, ${result.ordersScanned} orders ` +
      `(${result.affiliateOrders} affiliate), ${result.signals.length} signals ` +
      `(${result.newSignals.length} new), emailed ${emailed.length} in ${result.durationMs}ms` +
      (dryRun ? " [dry run]" : ""),
    );

    return NextResponse.json({
      message: "Code leak scan complete",
      ...result,
      emailed_count: emailed.length,
    });
  } catch (err: any) {
    console.error("[cron/scan-code-leaks] Fatal error:", err);
    return NextResponse.json({ error: err.message || "Scan failed" }, { status: 500 });
  }
}

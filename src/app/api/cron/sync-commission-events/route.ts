import { NextRequest, NextResponse } from "next/server";
import { syncCommissionEvents } from "@/lib/commission-events-sync";

// Match the other sync crons; the Shopify updated_at scan is the slow part.
export const maxDuration = 300;

// GET: Daily cron — keep the commission_events ledger (payments-v2 earned
// amounts) fresh. Scans Shopify orders UPDATED in the trailing window, so it
// catches both new affiliate orders and late refunds on old orders; upserts
// are idempotent so re-seeing the same order is a no-op. Defaults to an 8-day
// window (daily run needs ~1 day; the margin covers missed runs). Pass
// `?days=N` for manual catch-ups — keep N modest (≤60) or the scan risks the
// 300s function timeout, like the sync-code-revenue 400-day scan did.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const daysParam = parseInt(request.nextUrl.searchParams.get("days") || "8", 10);
  const days = Math.max(1, Math.min(daysParam, 90));

  try {
    const result = await syncCommissionEvents(days);
    console.log(
      `[cron/sync-commission-events] days=${days} scanned=${result.ordersScanned} ` +
      `matched=${result.ordersMatched} events=${result.eventsUpserted} in ${result.durationMs}ms`,
    );
    return NextResponse.json({ message: "Commission events sync complete", days, ...result });
  } catch (err: any) {
    console.error("[cron/sync-commission-events] Fatal error:", err);
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}

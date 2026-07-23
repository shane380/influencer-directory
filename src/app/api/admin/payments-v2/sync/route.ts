import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/lib/admin-auth";
import { syncCommissionEvents } from "@/lib/commission-events-sync";

// The Shopify scan can be slow; same budget as the cron route.
export const maxDuration = 300;

// POST: manual "Refresh Shopify data" from the payments-v2 page — runs the
// same sync as the daily cron, but admin-authed instead of CRON_SECRET so the
// UI can trigger it. Defaults to the cron's 8-day window; pass { days } (≤60)
// for longer catch-ups after an outage.
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  let days = 8;
  try {
    const body = await request.json();
    const n = Number(body?.days);
    if (Number.isFinite(n)) days = Math.max(1, Math.min(n, 60));
  } catch {}

  try {
    const result = await syncCommissionEvents(days);
    console.log(
      `[admin/payments-v2/sync] by=${admin.email} days=${days} scanned=${result.ordersScanned} ` +
      `matched=${result.ordersMatched} events=${result.eventsUpserted} in ${result.durationMs}ms`,
    );
    return NextResponse.json({ days, ...result });
  } catch (err: any) {
    console.error("[admin/payments-v2/sync] Fatal error:", err);
    return NextResponse.json({ error: err.message || "Sync failed" }, { status: 500 });
  }
}

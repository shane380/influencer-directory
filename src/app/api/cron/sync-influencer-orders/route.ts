import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { syncGiftOrders } from "@/lib/sync-gift-orders";

export const maxDuration = 300;

// Nightly sync of all Shopify orders tagged "influencer" into gift_orders.
// Keeps the gifting dashboard + PR list complete without relying on per-influencer
// on-demand syncs.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const result = await syncGiftOrders(db);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("sync-influencer-orders failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 },
    );
  }
}

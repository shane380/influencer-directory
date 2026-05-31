import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { syncGiftOrders } from "@/lib/sync-gift-orders";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const maxDuration = 60;

// Sync a single influencer's orders into gift_orders (used by the profile
// Orders tab's Refresh / Link-customer actions), then return their gift_orders
// rows. gift_orders is the single source of truth for order history.
export async function POST(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const influencerId = body.influencer_id as string | undefined;
  if (!influencerId) {
    return NextResponse.json({ error: "influencer_id is required" }, { status: 400 });
  }

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    await syncGiftOrders(db, { influencerIds: [influencerId] });
  } catch (err) {
    console.error("sync-influencer failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 },
    );
  }

  const { data: orders } = await (db.from("gift_orders") as any)
    .select("*")
    .eq("influencer_id", influencerId)
    .order("order_date", { ascending: false });

  return NextResponse.json({ orders: orders || [] });
}

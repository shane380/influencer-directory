import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET - Get cached orders for an influencer
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: influencerId } = await params;

    if (!influencerId) {
      return NextResponse.json(
        { error: "Influencer ID is required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch cached orders for this influencer
    const { data: orders, error } = await supabase
      .from("influencer_orders")
      .select("*")
      .eq("influencer_id", influencerId)
      .order("order_date", { ascending: false });

    if (error) {
      console.error("Supabase fetch error:", error);
      return NextResponse.json(
        { error: "Failed to fetch orders" },
        { status: 500 }
      );
    }

    // Get the most recent sync timestamp
    const lastSynced = orders && orders.length > 0
      ? orders.reduce((latest, order) => {
          const orderSyncedAt = new Date(order.synced_at).getTime();
          return orderSyncedAt > latest ? orderSyncedAt : latest;
        }, 0)
      : null;

    return NextResponse.json({
      orders: orders || [],
      last_synced: lastSynced ? new Date(lastSynced).toISOString() : null,
    });
  } catch (error) {
    console.error("Get orders error:", error);
    return NextResponse.json(
      { error: "Failed to fetch orders" },
      { status: 500 }
    );
  }
}

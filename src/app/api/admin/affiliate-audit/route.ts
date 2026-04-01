import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateAffiliateCommission } from "@/lib/affiliate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET: Fetch affiliate orders with attribution for audit
export async function GET(request: NextRequest) {
  const influencerId = request.nextUrl.searchParams.get("influencer_id");
  const month = request.nextUrl.searchParams.get("month");

  if (!influencerId || !month) {
    return NextResponse.json({ error: "influencer_id and month required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get creator's affiliate code and commission rate
  const { data: invite } = await (supabase.from as any)("creator_invites")
    .select("id, commission_rate")
    .eq("influencer_id", influencerId)
    .limit(1)
    .single();

  if (!invite) {
    return NextResponse.json({ error: "No invite found for influencer" }, { status: 404 });
  }

  const { data: creator } = await (supabase.from as any)("creators")
    .select("affiliate_code, commission_rate")
    .eq("invite_id", invite.id)
    .single();

  if (!creator?.affiliate_code) {
    return NextResponse.json({ error: "No affiliate code found" }, { status: 404 });
  }

  const rate = creator.commission_rate || invite.commission_rate || 10;

  // Get excluded order IDs
  const { data: excluded } = await (supabase.from as any)("excluded_affiliate_orders")
    .select("order_id, reason")
    .eq("influencer_id", influencerId);

  const excludedOrderIds = (excluded || []).map((e: any) => e.order_id);
  const excludedReasons = new Map((excluded || []).map((e: any) => [e.order_id, e.reason]));

  // Calculate with exclusions
  const result = await calculateAffiliateCommission(creator.affiliate_code, month, rate / 100, excludedOrderIds);

  // Add exclusion reasons to orders
  const orders = result.orders.map((o) => ({
    ...o,
    exclusion_reason: excludedReasons.get(o.order_id) || null,
  }));

  return NextResponse.json({
    orders,
    summary: result.summary,
    affiliate_code: creator.affiliate_code,
    commission_rate: rate,
  });
}

// POST: Exclude or include an order
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { influencer_id, order_id, action, reason } = body;

  if (!influencer_id || !order_id || !action) {
    return NextResponse.json({ error: "influencer_id, order_id, and action required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  if (action === "exclude") {
    const { error } = await (supabase.from as any)("excluded_affiliate_orders")
      .upsert({
        influencer_id,
        order_id,
        reason: reason || null,
        excluded_at: new Date().toISOString(),
      }, { onConflict: "influencer_id,order_id" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === "include") {
    const { error } = await (supabase.from as any)("excluded_affiliate_orders")
      .delete()
      .eq("influencer_id", influencer_id)
      .eq("order_id", order_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

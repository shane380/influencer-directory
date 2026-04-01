import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/admin/payments?month=2026-03
export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  if (!month) {
    return NextResponse.json({ error: "month required" }, { status: 400 });
  }

  const supabase = getSupabase();

  const { data: payments, error } = await (supabase.from as any)("creator_payments")
    .select("*")
    .eq("month", month)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with influencer data
  const influencerIds = [...new Set((payments || []).map((p: any) => p.influencer_id).filter(Boolean))];
  const enriched: any[] = [];

  let influencerMap: Record<string, any> = {};
  if (influencerIds.length > 0) {
    const { data: influencers } = await supabase
      .from("influencers")
      .select("id, name, instagram_handle, profile_photo_url")
      .in("id", influencerIds);

    for (const inf of influencers || []) {
      influencerMap[inf.id] = inf;
    }
  }

  // Enrich paid_collab rows with deal/campaign data
  const dealIds = [...new Set((payments || []).map((p: any) => p.deal_id).filter(Boolean))];
  let dealMap: Record<string, any> = {};
  if (dealIds.length > 0) {
    const { data: deals } = await supabase
      .from("campaign_deals")
      .select("id, total_deal_value, payment_status, campaign:campaigns!campaign_deals_campaign_id_fkey(name)")
      .in("id", dealIds);

    for (const d of deals || []) {
      dealMap[d.id] = d;
    }
  }

  for (const p of payments || []) {
    enriched.push({
      ...p,
      influencer: influencerMap[p.influencer_id] || null,
      deal: p.deal_id ? dealMap[p.deal_id] || null : null,
    });
  }

  return NextResponse.json({ payments: enriched });
}

// PATCH /api/admin/payments — update status, amount, notes
// Also handles creating new rows for live-calculated payments (id starts with "live-")
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Handle live-calculated rows that need to be created in DB
  if (typeof id === "string" && id.startsWith("live-")) {
    const insertData: Record<string, any> = {
      influencer_id: body.influencer_id,
      month: body.month,
      payment_type: body.payment_type,
      amount_owed: body.amount_owed ?? 0,
      status: updates.status || "approved",
      payment_method: body.payment_method || null,
      payment_detail: body.payment_detail || null,
      notes: body.notes || null,
      deal_id: body.deal_id || null,
      calculation_details: body.calculation_details || null,
    };
    if (insertData.status === "approved") {
      insertData.approved_at = new Date().toISOString();
      insertData.approved_by = updates.approved_by || null;
    }
    if (insertData.status === "paid") {
      insertData.approved_at = new Date().toISOString();
      insertData.approved_by = updates.approved_by || updates.paid_by || null;
      insertData.paid_at = new Date().toISOString();
      insertData.paid_by = updates.paid_by || null;
      insertData.amount_paid = body.amount_paid ?? insertData.amount_owed;
    }

    const { data, error } = await (supabase.from as any)("creator_payments")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ payment: data });
  }

  // Existing update path
  if (updates.status === "approved") {
    updates.approved_at = new Date().toISOString();
  }
  if (updates.status === "paid") {
    updates.paid_at = new Date().toISOString();
    if (!updates.amount_paid && !body.amount_paid) {
      const { data: existing } = await (supabase.from as any)("creator_payments")
        .select("amount_owed")
        .eq("id", id)
        .single();
      if (existing) {
        updates.amount_paid = existing.amount_owed;
      }
    }
  }

  const { data, error } = await (supabase.from as any)("creator_payments")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ payment: data });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/admin/legacy-affiliates
export async function GET() {
  const supabase = getSupabase();
  const { data, error } = await (supabase.from as any)("legacy_affiliates")
    .select("*")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ legacyAffiliates: data });
}

// POST /api/admin/legacy-affiliates
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, discount_code, commission_rate, payment_method, payment_detail, notes } = body;

  if (!name || !discount_code) {
    return NextResponse.json({ error: "name and discount_code required" }, { status: 400 });
  }

  const supabase = getSupabase();
  const { data, error } = await (supabase.from as any)("legacy_affiliates")
    .insert({
      name,
      discount_code: discount_code.toUpperCase(),
      commission_rate: commission_rate ?? 25,
      payment_method: payment_method || null,
      payment_detail: payment_detail || null,
      notes: notes || null,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ legacyAffiliate: data });
}

// PATCH /api/admin/legacy-affiliates
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  // Only allow updating known fields
  const allowed: Record<string, any> = {};
  for (const key of ["name", "discount_code", "commission_rate", "status", "influencer_id", "payment_method", "payment_detail", "notes"]) {
    if (key in updates) {
      allowed[key] = updates[key];
    }
  }

  if (allowed.discount_code) {
    allowed.discount_code = allowed.discount_code.toUpperCase();
  }

  const supabase = getSupabase();
  const { data, error } = await (supabase.from as any)("legacy_affiliates")
    .update(allowed)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ legacyAffiliate: data });
}

// DELETE /api/admin/legacy-affiliates?id=...
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Soft delete: set to inactive
  const { data, error } = await (supabase.from as any)("legacy_affiliates")
    .update({ status: "inactive" })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ legacyAffiliate: data });
}

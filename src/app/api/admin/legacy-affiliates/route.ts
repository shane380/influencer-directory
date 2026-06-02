import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// Resolve (or create) the canonical influencer profile for an affiliate so the
// partnerships overview shows one row per person instead of a separate affiliate
// row. Matches an existing profile by normalized name or by
// discount_code≈instagram_handle; if none exists, creates a minimal profile.
// Returns null only when the match is ambiguous (>1 candidate), leaving the
// affiliate headless for manual linking.
async function resolveOrCreateInfluencerId(
  supabase: any,
  name: string,
  discountCode: string,
): Promise<string | null> {
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const nName = norm(name);
  const nCode = norm(discountCode);

  const { data: influencers } = await supabase
    .from("influencers")
    .select("id, name, instagram_handle");
  const matches = new Map<string, any>();
  for (const inf of (influencers || []) as any[]) {
    if (nName && norm(inf.name) === nName) matches.set(inf.id, inf);
    if (nCode && norm(inf.instagram_handle) === nCode) matches.set(inf.id, inf);
  }
  if (matches.size === 1) return [...matches.keys()][0];
  if (matches.size > 1) return null; // ambiguous — leave for manual linking

  // No profile — create a minimal one. instagram_handle is NOT NULL and the code
  // is usually the handle, so derive from it and keep it unique.
  const taken = new Set(
    ((influencers || []) as any[])
      .map((r) => (r.instagram_handle || "").toLowerCase())
      .filter(Boolean),
  );
  const lc = discountCode.toLowerCase();
  const handle = [lc.replace(/[0-9]+$/, "") || lc, lc].find((h) => !taken.has(h)) || `${lc}-aff`;
  const { data: created } = await supabase
    .from("influencers")
    .insert({
      name,
      instagram_handle: handle,
      source: "other",
      partnership_type: "unassigned",
      notes: "Affiliate auto-created to centralize partnership records. Verify instagram_handle.",
    })
    .select("id")
    .single();
  return created?.id ?? null;
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
  // Centralize: link to (or create) the canonical influencer profile so the new
  // affiliate doesn't show up as a separate, unmatched row. An explicit
  // influencer_id in the body wins.
  const influencerId =
    body.influencer_id ?? (await resolveOrCreateInfluencerId(supabase, name, discount_code));
  const { data, error } = await (supabase.from as any)("legacy_affiliates")
    .insert({
      name,
      discount_code: discount_code.toUpperCase(),
      commission_rate: commission_rate ?? 25,
      influencer_id: influencerId,
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

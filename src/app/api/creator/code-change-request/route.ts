import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — fetch code change requests for the authenticated creator
export async function GET() {
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: creator } = await (supabase.from as any)("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const { data: requests } = await (supabase.from as any)("creator_code_change_requests")
    .select("*")
    .eq("creator_id", creator.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ requests: requests || [] });
}

// POST — submit a new code change request
export async function POST(request: NextRequest) {
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { requested_code } = body;

  if (!requested_code || requested_code.length < 4) {
    return NextResponse.json({ error: "Code must be at least 4 characters" }, { status: 400 });
  }

  const cleanCode = requested_code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);

  // Get creator
  const { data: creator } = await (supabase.from as any)("creators")
    .select("id, affiliate_code, invite_id")
    .eq("user_id", user.id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // Get influencer_id from invite
  const { data: invite } = await (supabase.from as any)("creator_invites")
    .select("influencer_id")
    .eq("id", creator.invite_id)
    .single();

  // Check no pending request exists
  const { data: existing } = await (supabase.from as any)("creator_code_change_requests")
    .select("id")
    .eq("creator_id", creator.id)
    .eq("status", "pending");

  if (existing && existing.length > 0) {
    return NextResponse.json({ error: "You already have a pending request" }, { status: 409 });
  }

  // Check requested code doesn't already exist
  const { data: existingCreator } = await (supabase.from as any)("creators")
    .select("id")
    .ilike("affiliate_code", cleanCode);

  if (existingCreator && existingCreator.length > 0) {
    return NextResponse.json({ error: "This code is already in use" }, { status: 409 });
  }

  // Insert request
  const { data: created, error } = await (supabase.from as any)("creator_code_change_requests")
    .insert({
      creator_id: creator.id,
      influencer_id: invite?.influencer_id || null,
      current_code: creator.affiliate_code || "",
      requested_code: cleanCode,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: created });
}

// DELETE — cancel a pending request
export async function DELETE(request: NextRequest) {
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: creator } = await (supabase.from as any)("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  await (supabase.from as any)("creator_code_change_requests")
    .delete()
    .eq("id", id)
    .eq("creator_id", creator.id)
    .eq("status", "pending");

  return NextResponse.json({ success: true });
}

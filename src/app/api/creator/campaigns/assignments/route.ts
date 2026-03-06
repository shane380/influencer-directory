import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET: Get assignments for a campaign (admin) or single assignment detail
export async function GET(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const campaignId = request.nextUrl.searchParams.get("campaign_id");
  const id = request.nextUrl.searchParams.get("id");

  if (id) {
    const { data, error } = await supabase
      .from("campaign_assignments")
      .select("*, campaign:creator_campaigns(*)")
      .eq("id", id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ assignment: data });
  }

  if (!campaignId) {
    return NextResponse.json({ error: "campaign_id or id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("campaign_assignments")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sent_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with creator/influencer names
  const creatorIds = [...new Set((data || []).filter(a => a.creator_id).map(a => a.creator_id))];
  const influencerIds = [...new Set((data || []).filter(a => a.influencer_id).map(a => a.influencer_id))];

  let creators: Record<string, string> = {};
  let influencers: Record<string, { name: string; handle: string }> = {};

  if (creatorIds.length > 0) {
    const { data: cData } = await supabase
      .from("creators")
      .select("id, creator_name")
      .in("id", creatorIds);
    for (const c of cData || []) creators[c.id] = c.creator_name;
  }

  if (influencerIds.length > 0) {
    const { data: iData } = await supabase
      .from("influencers")
      .select("id, name, instagram_handle")
      .in("id", influencerIds);
    for (const i of iData || []) influencers[i.id] = { name: i.name, handle: i.instagram_handle };
  }

  const enriched = (data || []).map(a => ({
    ...a,
    creator_name: a.creator_id ? creators[a.creator_id] || "Unknown" : null,
    influencer_name: a.influencer_id ? influencers[a.influencer_id]?.name || "Unknown" : null,
    influencer_handle: a.influencer_id ? influencers[a.influencer_id]?.handle || null : null,
  }));

  return NextResponse.json({ assignments: enriched });
}

// PATCH: Update assignment (creator confirm/decline, or admin actions)
export async function PATCH(request: NextRequest) {
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const body = await request.json();
  const { id, status, selected_products, creator_notes, admin_notes, order_id } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};

  if (status) {
    updateData.status = status;
    if (status === "confirmed") updateData.confirmed_at = new Date().toISOString();
    if (status === "complete") updateData.completed_at = new Date().toISOString();
  }
  if (selected_products !== undefined) updateData.selected_products = selected_products;
  if (creator_notes !== undefined) updateData.creator_notes = creator_notes;
  if (admin_notes !== undefined) updateData.admin_notes = admin_notes;
  if (order_id !== undefined) updateData.order_id = order_id;

  const { data, error } = await supabase
    .from("campaign_assignments")
    .update(updateData)
    .eq("id", id)
    .select("*, campaign:creator_campaigns(title)")
    .single();

  if (error) {
    console.error("Assignment update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log notifications
  if (status === "confirmed") {
    console.log(`Campaign assignment ${id} confirmed by ${user?.email || "creator"} — selects: ${JSON.stringify(selected_products)}`);
  }

  return NextResponse.json({ assignment: data });
}

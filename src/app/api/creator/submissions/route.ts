import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET: Fetch submissions for an influencer (admin use)
export async function GET(request: NextRequest) {
  const influencerId = request.nextUrl.searchParams.get("influencer_id");
  if (!influencerId) {
    return NextResponse.json({ error: "influencer_id required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from("creator_content_submissions")
    .select("*")
    .eq("influencer_id", influencerId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ submissions: data || [] });
}

// PATCH: Update submission status (admin review)
export async function PATCH(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const body = await request.json();
  const { id, status, admin_feedback, reviewed_by } = body;

  if (!id || !status) {
    return NextResponse.json({ error: "id and status required" }, { status: 400 });
  }

  const validStatuses = ["pending", "approved", "rejected", "revision_requested"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    status,
    reviewed_by: reviewed_by || null,
    reviewed_at: new Date().toISOString(),
  };

  if (admin_feedback !== undefined) {
    updateData.admin_feedback = admin_feedback;
  }

  const { data, error } = await supabase
    .from("creator_content_submissions")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Submission review failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ submission: data });
}

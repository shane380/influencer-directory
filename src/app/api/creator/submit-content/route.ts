import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  const supabaseAuth = await createServerClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: creator } = await supabase
    .from("creators")
    .select("id, creator_name, invite_id")
    .eq("user_id", user.id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // Find linked influencer
  const { data: invite } = await supabase
    .from("creator_invites")
    .select("influencer_id")
    .eq("id", creator.invite_id)
    .single();

  let influencerId: string | null = null;
  if (invite?.influencer_id) {
    influencerId = invite.influencer_id;
  }

  const body = await request.json();
  const { month, notes, campaign_assignment_id, files } = body;

  if (!month || !files || files.length === 0) {
    return NextResponse.json(
      { error: "month and at least one file required" },
      { status: 400 }
    );
  }

  try {
    const insertData: Record<string, unknown> = {
      creator_id: creator.id,
      influencer_id: influencerId,
      month,
      files,
      notes: notes || null,
      status: "pending",
    };
    if (campaign_assignment_id) {
      insertData.campaign_assignment_id = campaign_assignment_id;
    }

    const { data: submission, error } = await supabase
      .from("creator_content_submissions")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error("Submission insert failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If linked to a campaign assignment, update its status
    if (campaign_assignment_id && submission) {
      const { data: assignment } = await supabase
        .from("campaign_assignments")
        .update({
          status: "content_submitted",
          content_submission_id: submission.id,
        })
        .eq("id", campaign_assignment_id)
        .select("*, campaign:creator_campaigns(title)")
        .single();

      if (assignment) {
        const campaignTitle = (assignment as any).campaign?.title || "Unknown";
        console.log(`Content submitted for campaign "${campaignTitle}" by ${creator.creator_name}`);
      }
    }

    return NextResponse.json({ submission });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Submission failed";
    console.error("Content submission failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

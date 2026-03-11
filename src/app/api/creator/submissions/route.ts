import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { contentStatusEmail } from "@/lib/email-templates";
import { isEmailTriggerEnabled } from "@/lib/app-settings";

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

  // Fire-and-forget: send content status email for approved/revision_requested
  if (data && (status === "approved" || status === "revision_requested")) {
    (async () => {
      try {
        // Check if this trigger is enabled in app settings
        const triggerKey = status === "approved" ? "content_approved" : "revision_requested";
        const enabled = await isEmailTriggerEnabled(triggerKey);
        if (!enabled) return;

        // Look up the creator and campaign info for this submission
        const creatorId = data.creator_id;
        if (!creatorId) return;

        const { data: creator } = await supabase
          .from("creators")
          .select("id, creator_name, email, notification_preferences")
          .eq("id", creatorId)
          .single();

        if (!creator?.email) return;
        const prefs = creator.notification_preferences as Record<string, boolean> | null;
        if (prefs && prefs.email_content_status === false) return;

        // Try to get campaign name from the linked assignment
        let campaignName = "your campaign";
        if (data.campaign_assignment_id) {
          const { data: assignment } = await supabase
            .from("campaign_assignments")
            .select("campaign:creator_campaigns(title)")
            .eq("id", data.campaign_assignment_id)
            .single();
          const campaign = assignment?.campaign as { title?: string } | null;
          if (campaign?.title) {
            campaignName = campaign.title;
          }
        }

        const firstName = (creator.creator_name || "").split(" ")[0] || "there";
        const { subject, html } = contentStatusEmail({
          firstName,
          campaignName,
          status,
          feedback: status === "revision_requested" ? (admin_feedback || undefined) : undefined,
        });

        await sendEmail({ to: creator.email, subject, html });
      } catch (err) {
        console.error("Failed to send content status email:", err);
      }
    })();
  }

  return NextResponse.json({ submission: data });
}

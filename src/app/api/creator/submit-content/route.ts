import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import mux from "@/lib/mux";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const maxDuration = 60;

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

  const body = await request.json();
  const { month, notes, campaign_assignment_id, files, influencer_id, submission_id } = body;

  if (!month || !files || files.length === 0) {
    return NextResponse.json(
      { error: "month and at least one file required" },
      { status: 400 }
    );
  }

  // Resolve influencer
  let infId = influencer_id || null;
  if (!infId) {
    const { data: invite } = await supabase
      .from("creator_invites")
      .select("influencer_id")
      .eq("id", creator.invite_id)
      .single();
    infId = invite?.influencer_id || null;
  }

  try {
    // Files are already uploaded to R2 by the client.
    // Each file has: { name, r2_key, r2_url, mime_type, size }
    const uploadedFiles = files.map((file: any) => ({
      name: file.name,
      r2_key: file.r2_key,
      r2_url: file.r2_url,
      mime_type: file.mime_type,
      size: file.size,
      uploaded_at: new Date().toISOString(),
    }));

    // Check if any file is a video — if so, create Mux asset for the first video
    let originalVideoUrl: string | null = null;
    let muxPlaybackId: string | null = null;

    for (const file of uploadedFiles) {
      if (file.mime_type?.startsWith("video/")) {
        originalVideoUrl = file.r2_url;
        try {
          const asset = await mux.video.assets.create({
            inputs: [{ url: file.r2_url }],
            playback_policies: ["public"],
          });
          muxPlaybackId = asset.playback_ids?.[0]?.id || null;
        } catch (muxErr) {
          console.error("Mux asset creation failed (non-fatal):", muxErr);
        }
        break; // Only process first video for Mux
      }
    }

    let submission: Record<string, unknown> | null = null;

    if (submission_id) {
      // Resubmission: update existing submission with new files, reset status
      const { data: existing } = await supabase
        .from("creator_content_submissions")
        .select("files")
        .eq("id", submission_id)
        .eq("creator_id", creator.id)
        .single();

      if (!existing) {
        return NextResponse.json({ error: "Submission not found" }, { status: 404 });
      }

      const { data, error } = await supabase
        .from("creator_content_submissions")
        .update({
          files: uploadedFiles,
          notes: notes || null,
          status: "pending",
          admin_feedback: null,
          reviewed_by: null,
          reviewed_at: null,
          submitted_at: new Date().toISOString(),
          original_video_url: originalVideoUrl,
          mux_playback_id: muxPlaybackId,
        })
        .eq("id", submission_id)
        .select()
        .single();

      if (error) {
        console.error("Resubmission update failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      submission = data;
    } else {
      // New submission
      const insertData: Record<string, unknown> = {
        creator_id: creator.id,
        influencer_id: infId || null,
        month,
        files: uploadedFiles,
        notes: notes || null,
        status: "pending",
        original_video_url: originalVideoUrl,
        mux_playback_id: muxPlaybackId,
      };
      if (campaign_assignment_id) {
        insertData.campaign_assignment_id = campaign_assignment_id;
      }

      const { data, error } = await supabase
        .from("creator_content_submissions")
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error("Submission insert failed:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      submission = data;

      // If linked to a campaign assignment, update its status
      if (campaign_assignment_id && submission) {
        await supabase
          .from("campaign_assignments")
          .update({
            status: "content_submitted",
            content_submission_id: submission.id,
          })
          .eq("id", campaign_assignment_id);
      }
    }

    return NextResponse.json({ submission });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Submission failed";
    console.error("Content submission failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

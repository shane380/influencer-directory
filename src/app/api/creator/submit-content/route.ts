import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  createSubmissionFolder,
  uploadFileToDrive,
  getFolderUrl,
} from "@/lib/google-drive";

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

  let influencer: { id: string; name: string; instagram_handle: string } | null = null;
  if (invite?.influencer_id) {
    const { data } = await supabase
      .from("influencers")
      .select("id, name, instagram_handle")
      .eq("id", invite.influencer_id)
      .single();
    influencer = data;
  }
  if (!influencer && creator.creator_name) {
    const { data } = await supabase
      .from("influencers")
      .select("id, name, instagram_handle")
      .ilike("name", creator.creator_name)
      .single();
    influencer = data;
  }

  const formData = await request.formData();
  const month = formData.get("month") as string;
  const notes = formData.get("notes") as string | null;
  const campaignAssignmentId = formData.get("campaign_assignment_id") as string | null;
  const files = formData.getAll("files") as File[];

  if (!month || files.length === 0) {
    return NextResponse.json(
      { error: "month and at least one file required" },
      { status: 400 }
    );
  }

  const ALLOWED_TYPES = [
    "video/mp4",
    "video/quicktime",
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  for (const file of files) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type not allowed: ${file.type}` },
        { status: 400 }
      );
    }
  }

  // Format month label: "2026-03" → "March 2026"
  const [year, mo] = month.split("-");
  const monthLabel = new Date(parseInt(year), parseInt(mo) - 1).toLocaleString(
    "en",
    { month: "long", year: "numeric" }
  );

  try {
    const creatorName = influencer?.name || creator.creator_name || "Unknown";
    const handle = influencer?.instagram_handle || "unknown";

    const { folderId, folderUrl } = await createSubmissionFolder(
      creatorName,
      handle,
      monthLabel
    );

    const uploadedFiles: Array<{
      name: string;
      drive_file_id: string;
      drive_url: string;
      mime_type: string;
      size: number;
      uploaded_at: string;
    }> = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { fileId, webViewLink } = await uploadFileToDrive(
        folderId,
        file.name,
        file.type,
        buffer
      );
      uploadedFiles.push({
        name: file.name,
        drive_file_id: fileId,
        drive_url: webViewLink,
        mime_type: file.type,
        size: file.size,
        uploaded_at: new Date().toISOString(),
      });
    }

    const insertData: Record<string, unknown> = {
      creator_id: creator.id,
      influencer_id: influencer?.id || null,
      month,
      drive_folder_id: folderId,
      drive_folder_url: folderUrl,
      files: uploadedFiles,
      notes: notes || null,
      status: "pending",
    };
    if (campaignAssignmentId) {
      insertData.campaign_assignment_id = campaignAssignmentId;
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
    if (campaignAssignmentId && submission) {
      const { data: assignment } = await supabase
        .from("campaign_assignments")
        .update({
          status: "content_submitted",
          content_submission_id: submission.id,
        })
        .eq("id", campaignAssignmentId)
        .select("*, campaign:creator_campaigns(title)")
        .single();

      if (assignment) {
        const campaignTitle = (assignment as any).campaign?.title || "Unknown";
        console.log(`Content submitted for campaign "${campaignTitle}" by ${creator.creator_name}`);
      }
    }

    return NextResponse.json({ submission });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed";
    console.error("Content submission failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

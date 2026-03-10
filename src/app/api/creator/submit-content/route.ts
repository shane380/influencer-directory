import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import {
  createInfluencerFolder,
  uploadFileToDrive,
  getFolderUrl,
} from "@/lib/google-drive";

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
  const { month, notes, campaign_assignment_id, files, influencer_id } = body;

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

  let influencer: { id: string; name: string; instagram_handle: string; google_drive_folder_id: string | null } | null = null;
  if (infId) {
    const { data } = await supabase
      .from("influencers")
      .select("id, name, instagram_handle, google_drive_folder_id")
      .eq("id", infId)
      .single();
    influencer = data;
  }

  try {
    // Ensure Google Drive folder exists
    let folderId = influencer?.google_drive_folder_id || null;
    if (!folderId && influencer) {
      folderId = await createInfluencerFolder(
        influencer.name,
        influencer.instagram_handle
      );
      await supabase
        .from("influencers")
        .update({ google_drive_folder_id: folderId } as any)
        .eq("id", influencer.id);
    }

    const uploadedFiles: Array<{
      name: string;
      drive_file_id: string;
      drive_url: string;
      mime_type: string;
      size: number;
      uploaded_at: string;
    }> = [];

    // Download each file from Supabase Storage and upload to Google Drive
    for (const file of files) {
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("creator-uploads")
        .download(file.storage_path);

      if (dlErr || !fileData) {
        console.error("Storage download failed:", dlErr);
        throw new Error(`Failed to retrieve ${file.name} from storage`);
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());

      if (folderId) {
        const { fileId, webViewLink } = await uploadFileToDrive(
          folderId,
          file.name,
          file.mime_type,
          buffer
        );
        uploadedFiles.push({
          name: file.name,
          drive_file_id: fileId,
          drive_url: webViewLink,
          mime_type: file.mime_type,
          size: file.size,
          uploaded_at: new Date().toISOString(),
        });
      } else {
        // No Drive folder — store metadata without Drive link
        uploadedFiles.push({
          name: file.name,
          drive_file_id: "",
          drive_url: "",
          mime_type: file.mime_type,
          size: file.size,
          uploaded_at: new Date().toISOString(),
        });
      }

      // Clean up storage file after successful Drive upload
      await supabase.storage.from("creator-uploads").remove([file.storage_path]);
    }

    const folderUrl = folderId ? getFolderUrl(folderId) : null;

    const insertData: Record<string, unknown> = {
      creator_id: creator.id,
      influencer_id: influencer?.id || null,
      month,
      drive_folder_id: folderId || null,
      drive_folder_url: folderUrl,
      files: uploadedFiles,
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
      await supabase
        .from("campaign_assignments")
        .update({
          status: "content_submitted",
          content_submission_id: submission.id,
        })
        .eq("id", campaign_assignment_id);
    }

    return NextResponse.json({ submission });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Submission failed";
    console.error("Content submission failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

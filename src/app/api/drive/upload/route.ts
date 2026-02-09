import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createInfluencerFolder,
  uploadFileToDrive,
  getFolderUrl,
} from "@/lib/google-drive";
import { Influencer } from "@/types/database";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const influencerId = formData.get("influencer_id") as string | null;
  const type = (formData.get("type") as string) || "post";
  const campaignId = formData.get("campaign_id") as string | null;
  const dealId = formData.get("deal_id") as string | null;
  const caption = formData.get("caption") as string | null;
  // "true" = upload file to Drive + create content row
  // "false" = upload file to Drive only (for additional carousel files)
  const createContent = formData.get("create_content") !== "false";
  // For carousel: total file count and extra file IDs from previous uploads
  const totalFiles = parseInt(formData.get("total_files") as string) || 1;
  const additionalFileIds = formData.get("additional_file_ids") as string | null;

  if (!file || !influencerId) {
    return NextResponse.json(
      { error: "file and influencer_id required" },
      { status: 400 }
    );
  }

  // Get influencer + ensure Drive folder exists
  const { data: influencer, error: fetchErr } = await supabase
    .from("influencers")
    .select("*")
    .eq("id", influencerId)
    .single();

  if (fetchErr || !influencer) {
    return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  }

  const inf = influencer as Influencer;
  let folderId = inf.google_drive_folder_id;

  if (!folderId) {
    try {
      folderId = await createInfluencerFolder(
        inf.name,
        inf.instagram_handle
      );
      await (supabase
        .from("influencers") as any)
        .update({ google_drive_folder_id: folderId })
        .eq("id", influencerId);
    } catch (err: any) {
      console.error("Drive folder creation failed:", err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { fileId, webViewLink, thumbnailLink } = await uploadFileToDrive(
      folderId,
      file.name,
      file.type,
      buffer
    );

    // If not creating a content row, just return the Drive file info
    if (!createContent) {
      return NextResponse.json({
        fileId,
        webViewLink,
        folder_url: getFolderUrl(folderId),
      });
    }

    // Build metadata with additional file IDs if this is a carousel
    const extraIds = additionalFileIds ? JSON.parse(additionalFileIds) as string[] : [];
    const metadata = extraIds.length > 0
      ? { additional_file_ids: extraIds, total_files: totalFiles }
      : {};

    const { data: content, error: insertErr } = await (supabase
      .from("content") as any)
      .insert({
        influencer_id: influencerId,
        type,
        media_url: webViewLink,
        thumbnail_url: thumbnailLink,
        caption,
        campaign_id: campaignId || null,
        deal_id: dealId || null,
        google_drive_file_id: fileId,
        file_name: totalFiles > 1
          ? `${file.name} (+${totalFiles - 1} more)`
          : file.name,
        file_size: file.size,
        platform: "google_drive",
        metadata,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Content insert failed:", insertErr);
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      content,
      folder_url: getFolderUrl(folderId),
    });
  } catch (err: any) {
    console.error("Drive upload failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

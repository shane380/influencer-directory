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
  const files = formData.getAll("file") as File[];
  const influencerId = formData.get("influencer_id") as string | null;
  const type = (formData.get("type") as string) || "post";
  const campaignId = formData.get("campaign_id") as string | null;
  const dealId = formData.get("deal_id") as string | null;
  const caption = formData.get("caption") as string | null;

  if (files.length === 0 || !influencerId) {
    return NextResponse.json(
      { error: "file(s) and influencer_id required" },
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
    // Upload all files to Drive
    const uploadResults: { fileId: string; webViewLink: string; thumbnailLink: string | null; fileName: string; fileSize: number }[] = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await uploadFileToDrive(folderId, file.name, file.type, buffer);
      uploadResults.push({ ...result, fileName: file.name, fileSize: file.size });
    }

    // Use the first file as the primary media for the content row
    const primary = uploadResults[0];
    const additionalFileIds = uploadResults.slice(1).map((r) => r.fileId);

    const { data: content, error: insertErr } = await (supabase
      .from("content") as any)
      .insert({
        influencer_id: influencerId,
        type,
        media_url: primary.webViewLink,
        thumbnail_url: primary.thumbnailLink,
        caption,
        campaign_id: campaignId || null,
        deal_id: dealId || null,
        google_drive_file_id: primary.fileId,
        file_name: files.length > 1
          ? `${primary.fileName} (+${files.length - 1} more)`
          : primary.fileName,
        file_size: files.reduce((sum, f) => sum + f.size, 0),
        platform: "google_drive",
        metadata: additionalFileIds.length > 0
          ? { additional_file_ids: additionalFileIds, total_files: files.length }
          : {},
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

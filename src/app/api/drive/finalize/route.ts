import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finalizeUpload, getFolderUrl } from "@/lib/google-drive";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const {
    influencer_id,
    file_id,
    file_name,
    file_size,
    type,
    campaign_id,
    deal_id,
    caption,
    total_files,
    additional_file_ids,
    folder_id,
  } = body;

  if (!influencer_id || !file_id) {
    return NextResponse.json(
      { error: "influencer_id and file_id required" },
      { status: 400 }
    );
  }

  try {
    const { webViewLink, thumbnailLink } = await finalizeUpload(file_id);

    const extraIds = additional_file_ids || [];
    const fileCount = total_files || 1;
    const metadata = extraIds.length > 0
      ? { additional_file_ids: extraIds, total_files: fileCount }
      : {};

    const { data: content, error: insertErr } = await (supabase
      .from("content") as any)
      .insert({
        influencer_id,
        type: type || "post",
        media_url: webViewLink,
        thumbnail_url: thumbnailLink,
        caption: caption || null,
        campaign_id: campaign_id || null,
        deal_id: deal_id || null,
        google_drive_file_id: file_id,
        file_name: fileCount > 1
          ? `${file_name} (+${fileCount - 1} more)`
          : file_name,
        file_size: file_size || 0,
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
      folder_url: folder_id ? getFolderUrl(folder_id) : null,
    });
  } catch (err: any) {
    console.error("Finalize upload failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteFileFromDrive } from "@/lib/google-drive";
import { InfluencerContent } from "@/types/database";

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();

  const { content_id } = await request.json();
  if (!content_id) {
    return NextResponse.json({ error: "content_id required" }, { status: 400 });
  }

  // Fetch content row
  const { data: content, error: fetchErr } = await supabase
    .from("content")
    .select("*")
    .eq("id", content_id)
    .single();

  if (fetchErr || !content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  const item = content as InfluencerContent;

  // Delete from Google Drive if it has a Drive file
  if (item.google_drive_file_id) {
    try {
      await deleteFileFromDrive(item.google_drive_file_id);
    } catch (err: any) {
      console.error("Drive delete failed (continuing with DB delete):", err);
    }
  }

  // Delete from database
  const { error: deleteErr } = await supabase
    .from("content")
    .delete()
    .eq("id", content_id);

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

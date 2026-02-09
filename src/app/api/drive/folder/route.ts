import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createInfluencerFolder, getFolderUrl } from "@/lib/google-drive";
import { Influencer } from "@/types/database";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { influencer_id } = await request.json();
  if (!influencer_id) {
    return NextResponse.json({ error: "influencer_id required" }, { status: 400 });
  }

  // Check if folder already exists
  const { data: influencer, error: fetchErr } = await supabase
    .from("influencers")
    .select("*")
    .eq("id", influencer_id)
    .single();

  if (fetchErr || !influencer) {
    return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  }

  const inf = influencer as Influencer;

  if (inf.google_drive_folder_id) {
    return NextResponse.json({
      folder_id: inf.google_drive_folder_id,
      folder_url: getFolderUrl(inf.google_drive_folder_id),
    });
  }

  try {
    const folderId = await createInfluencerFolder(
      inf.name,
      inf.instagram_handle
    );

    await (supabase
      .from("influencers") as any)
      .update({ google_drive_folder_id: folderId })
      .eq("id", influencer_id);

    return NextResponse.json({
      folder_id: folderId,
      folder_url: getFolderUrl(folderId),
    });
  } catch (err: any) {
    console.error("Drive folder creation failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  createInfluencerFolder,
  createResumableUpload,
  getFolderUrl,
} from "@/lib/google-drive";
import { Influencer } from "@/types/database";

export async function POST(request: NextRequest) {
  const supabaseAuth = await createClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Use service role for DB queries to avoid RLS issues with creator users
  const supabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { influencer_id, file_name, mime_type } = await request.json();
  const origin = request.headers.get("origin") || "";

  if (!influencer_id || !file_name || !mime_type) {
    return NextResponse.json(
      { error: "influencer_id, file_name, and mime_type required" },
      { status: 400 }
    );
  }

  const { data: influencer, error: fetchErr } = await supabase
    .from("influencers")
    .select("*")
    .eq("id", influencer_id)
    .single();

  if (fetchErr || !influencer) {
    return NextResponse.json({ error: "Influencer not found" }, { status: 404 });
  }

  const inf = influencer as Influencer;
  let folderId = inf.google_drive_folder_id;

  if (!folderId) {
    try {
      folderId = await createInfluencerFolder(inf.name, inf.instagram_handle);
      await (supabase.from("influencers") as any)
        .update({ google_drive_folder_id: folderId })
        .eq("id", influencer_id);
    } catch (err: any) {
      console.error("Drive folder creation failed:", err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  try {
    const uploadUrl = await createResumableUpload(folderId, file_name, mime_type, origin);
    return NextResponse.json({
      upload_url: uploadUrl,
      folder_id: folderId,
      folder_url: getFolderUrl(folderId),
    });
  } catch (err: any) {
    console.error("Resumable upload init failed:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

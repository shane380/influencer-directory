import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET: Return all approved submissions with R2 and Mux URLs
export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from("creator_content_submissions")
    .select(
      "id, creator_id, influencer_id, month, files, notes, original_video_url, mux_playback_id, submitted_at, reviewed_at, reviewed_by"
    )
    .eq("status", "approved")
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch approved submissions:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ submissions: data });
}

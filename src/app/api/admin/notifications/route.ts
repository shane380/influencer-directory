import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch pending content submissions with creator info
  const { data: submissions, error } = await supabase
    .from("creator_content_submissions")
    .select("id, creator_id, influencer_id, month, files, created_at, creators(creator_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ notifications: [] });
  }

  const notifications = (submissions || []).map((sub: any) => ({
    id: sub.id,
    creator_name: sub.creators?.creator_name || "Unknown",
    creator_id: sub.creator_id,
    influencer_id: sub.influencer_id,
    month: sub.month,
    file_count: Array.isArray(sub.files) ? sub.files.length : 0,
    created_at: sub.created_at,
  }));

  return NextResponse.json({ notifications });
}

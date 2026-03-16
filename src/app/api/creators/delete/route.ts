import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { creator_id } = await request.json();

  if (!creator_id) {
    return NextResponse.json({ error: "creator_id required" }, { status: 400 });
  }

  // Get creator details
  const { data: creator } = await supabase
    .from("creators")
    .select("id, user_id, invite_id")
    .eq("id", creator_id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  // Delete related data in order (foreign key constraints)
  // Order matters: campaign_assignments references content_submissions,
  // so clear that FK first, then delete in dependency order
  await (supabase.from("campaign_assignments") as any)
    .update({ content_submission_id: null })
    .eq("creator_id", creator_id);

  const tables = [
    "campaign_assignments",
    "creator_content_submissions",
    "creator_sample_requests",
    "creator_product_feedback",
    "creator_code_change_requests",
    "submissions",
    "content",
  ];

  for (const table of tables) {
    const { error } = await (supabase.from(table) as any).delete().eq("creator_id", creator_id);
    if (error) {
      console.error(`Failed to delete from ${table}:`, error);
    }
  }

  // Delete the creator record
  const { error: deleteError } = await (supabase
    .from("creators") as any)
    .delete()
    .eq("id", creator_id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // 9. Reset invite status so it can be reused
  if (creator.invite_id) {
    await supabase
      .from("creator_invites")
      .update({ status: "sent", accepted_at: null })
      .eq("id", creator.invite_id);
  }

  // 10. Delete auth user if exists
  if (creator.user_id) {
    await supabase.auth.admin.deleteUser(creator.user_id);
  }

  return NextResponse.json({ success: true });
}

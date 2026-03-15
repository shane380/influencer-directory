import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(request: NextRequest) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
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
  // 1. Content submissions
  await (supabase.from("creator_content_submissions") as any).delete().eq("creator_id", creator_id);

  // 2. Sample requests
  await (supabase.from("creator_sample_requests") as any).delete().eq("creator_id", creator_id);

  // 3. Product feedback
  await (supabase.from("creator_product_feedback") as any).delete().eq("creator_id", creator_id);

  // 4. Code change requests
  await (supabase.from("creator_code_change_requests") as any).delete().eq("creator_id", creator_id);

  // 5. Campaign assignments
  await (supabase.from("campaign_assignments") as any).delete().eq("creator_id", creator_id);

  // 6. Submissions (legacy)
  await (supabase.from("submissions") as any).delete().eq("creator_id", creator_id);

  // 7. Content
  await (supabase.from("content") as any).delete().eq("creator_id", creator_id);

  // 8. Delete the creator record
  const { error: deleteError } = await supabase
    .from("creators")
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

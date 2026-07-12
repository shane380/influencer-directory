import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";

/** Admin-only: send a pending draft back to its creator with feedback. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Only admins can review ads" }, { status: 403 });
  }

  const { id } = await params;
  const { feedback } = await request.json();
  if (!feedback?.trim()) {
    return NextResponse.json({ error: "Feedback text is required" }, { status: 400 });
  }

  const supabase = getAdminClient();
  const { error } = await (supabase.from("ad_drafts") as any)
    .update({
      status: "changes_requested",
      feedback: feedback.trim(),
      reviewed_by: user.userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");

  if (error) {
    console.error("[ads/feedback] update failed:", error.message);
    return NextResponse.json({ error: "Could not save feedback" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

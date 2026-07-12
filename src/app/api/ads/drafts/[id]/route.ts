import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";

/** Withdraw a draft (submitter or admin). Only drafts not yet in Meta. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = getAdminClient();

  const { data: row } = await (supabase.from("ad_drafts") as any)
    .select("id, created_by, meta_ad_id")
    .eq("id", id)
    .single();
  if (!row) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (row.meta_ad_id) {
    return NextResponse.json(
      { error: "Already published to Meta — manage it in Ads Manager" },
      { status: 409 }
    );
  }
  if (row.created_by !== user.userId && !user.isAdmin) {
    return NextResponse.json({ error: "Not your draft" }, { status: 403 });
  }

  const { error } = await (supabase.from("ad_drafts") as any).delete().eq("id", id);
  if (error) {
    console.error("[ads/drafts] delete failed:", error.message);
    return NextResponse.json({ error: "Could not delete the draft" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

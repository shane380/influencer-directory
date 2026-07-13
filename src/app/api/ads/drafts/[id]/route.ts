import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";

/**
 * Edit a draft's targeting/copy before it reaches Meta. Admins may edit any
 * editable draft (e.g. retarget an adset or fix a link before approving);
 * submitters may edit their own and pass `resubmit: true` to send a
 * changes-requested draft back to the review queue.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const supabase = getAdminClient();

  const { data: row } = await (supabase.from("ad_drafts") as any)
    .select("id, created_by, status, meta_ad_id, copy")
    .eq("id", id)
    .single();
  if (!row) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (row.meta_ad_id) {
    return NextResponse.json(
      { error: "Already published to Meta — manage it in Ads Manager" },
      { status: 409 }
    );
  }
  const isOwner = row.created_by === user.userId;
  if (!isOwner && !user.isAdmin) {
    return NextResponse.json({ error: "Not your draft" }, { status: 403 });
  }
  if (row.status !== "pending" && row.status !== "changes_requested") {
    return NextResponse.json(
      { error: "Only pending or changes-requested drafts can be edited" },
      { status: 409 }
    );
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.adName === "string" && body.adName.trim()) {
    update.ad_name = body.adName.trim();
  }
  if (typeof body.campaignId === "string" && body.campaignId) {
    update.campaign_id = body.campaignId;
    update.campaign_name = typeof body.campaignName === "string" ? body.campaignName : "";
  }
  if (typeof body.adsetId === "string" && body.adsetId) {
    update.adset_id = body.adsetId;
    update.adset_name = typeof body.adsetName === "string" ? body.adsetName : "";
  }
  if (body.copy && typeof body.copy === "object" && !Array.isArray(body.copy)) {
    update.copy = { ...(row.copy || {}), ...body.copy };
  }
  if (body.resubmit === true && isOwner) {
    update.status = "pending";
  }

  const { error } = await (supabase.from("ad_drafts") as any).update(update).eq("id", id);
  if (error) {
    console.error("[ads/drafts] patch failed:", error.message);
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

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

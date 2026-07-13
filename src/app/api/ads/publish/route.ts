import { NextResponse, after } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";
import { pushDraftToMeta, MetaApiError } from "@/lib/meta-ads";

// Media upload + video processing can take a while.
export const maxDuration = 300;

/**
 * Admin-only. Pushes one draft to Meta.
 * Body: { draftId: string, status?: "ACTIVE" | "PAUSED" }
 * Used for the admin's own publishes (status from the Live/Paused toggle)
 * and for approving a teammate's pending draft (always ACTIVE).
 *
 * Responds as soon as the draft is marked "publishing"; the Meta push
 * (media ingest + video transcode, ~10s for video ads) runs after the
 * response and resolves the draft to approved/direct or failed. Clients
 * poll /api/ads/drafts to observe the outcome.
 */
export async function POST(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Only admins can publish ads" }, { status: 403 });
  }

  const { draftId, status } = await request.json();
  if (!draftId) return NextResponse.json({ error: "draftId required" }, { status: 400 });
  const targetStatus: "ACTIVE" | "PAUSED" = status === "PAUSED" ? "PAUSED" : "ACTIVE";

  const supabase = getAdminClient();
  const { data: row, error } = await (supabase.from("ad_drafts") as any)
    .select("*")
    .eq("id", draftId)
    .single();
  if (error || !row) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  if (row.meta_ad_id) {
    return NextResponse.json({ error: "This draft was already published" }, { status: 409 });
  }

  const wasPending = row.status === "pending";
  await (supabase.from("ad_drafts") as any)
    .update({ status: "publishing", publish_error: null, updated_at: new Date().toISOString() })
    .eq("id", draftId);

  after(async () => {
    try {
      const result = await pushDraftToMeta(
        {
          adName: row.ad_name,
          adsetId: row.adset_id,
          pageId: row.page_id,
          instagramUserId: row.instagram_user_id,
          partnershipSponsorId: row.partnership_sponsor_id,
          assets: row.assets || [],
          copy: row.copy || {},
        },
        targetStatus
      );

      await (supabase.from("ad_drafts") as any)
        .update({
          status: wasPending ? "approved" : "direct",
          meta_ad_id: result.adId,
          meta_creative_id: result.creativeId,
          publish_error: null,
          reviewed_by: user.userId,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftId);
    } catch (err) {
      const message =
        err instanceof MetaApiError ? err.userMessage : "Publishing failed unexpectedly";
      console.error("[ads/publish] failed:", err instanceof Error ? err.message : err);

      await (supabase.from("ad_drafts") as any)
        .update({
          status: wasPending ? "pending" : "failed",
          publish_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", draftId);
    }
  });

  return NextResponse.json({ ok: true, publishing: true, draftId });
}

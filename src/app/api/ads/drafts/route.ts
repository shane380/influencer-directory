import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";
import type { AdDraft } from "@/types/meta-ads";

function rowToDraft(row: any): AdDraft {
  return {
    id: row.id,
    adName: row.ad_name,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name || "",
    adsetId: row.adset_id,
    adsetName: row.adset_name || "",
    pageId: row.page_id,
    instagramUserId: row.instagram_user_id,
    partnershipSponsorId: row.partnership_sponsor_id,
    partnershipSponsorLabel: row.partnership_sponsor_label,
    assets: row.assets || [],
    copy: row.copy || {},
    status: row.status,
    feedback: row.feedback,
    metaAdId: row.meta_ad_id,
    publishError: row.publish_error,
    createdBy: row.created_by,
    createdByName: row.creator_profile?.display_name || "Unknown",
    createdAt: row.created_at,
  };
}

/**
 * Admins see the pending review queue plus recent history;
 * everyone sees their own submissions (with feedback).
 */
export async function GET() {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getAdminClient();
  const base = () =>
    (supabase.from("ad_drafts") as any)
      .select("*, creator_profile:profiles!ad_drafts_created_by_fkey(display_name)")
      .order("created_at", { ascending: false });

  const { data: mine, error: mineErr } = await base().eq("created_by", user.userId).limit(50);
  if (mineErr) {
    console.error("[ads/drafts] query failed:", mineErr.message);
    return NextResponse.json({ error: "Could not load drafts" }, { status: 500 });
  }

  let queue: any[] = [];
  let reviewed: any[] = [];
  if (user.isAdmin) {
    const { data, error } = await base().eq("status", "pending").limit(50);
    if (error) {
      console.error("[ads/drafts] queue query failed:", error.message);
      return NextResponse.json({ error: "Could not load review queue" }, { status: 500 });
    }
    queue = data || [];

    // Review history: everyone else's non-pending drafts (own ones already
    // appear under "My submitted ads").
    const { data: reviewedData, error: reviewedErr } = await base()
      .neq("status", "pending")
      .neq("created_by", user.userId)
      .limit(20);
    if (reviewedErr) {
      console.error("[ads/drafts] reviewed query failed:", reviewedErr.message);
    } else {
      reviewed = reviewedData || [];
    }
  }

  return NextResponse.json({
    mine: (mine || []).map(rowToDraft),
    queue: queue.map(rowToDraft),
    reviewed: reviewed.map(rowToDraft),
    isAdmin: user.isAdmin,
  });
}

import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";
import type { SubmitDraftRequest } from "@/types/meta-ads";

function validate(body: SubmitDraftRequest): string | null {
  if (!body.adName?.trim()) return "Ad name is required";
  if (!body.adsetId) return "Pick an ad set";
  if (!body.pageId) return "Missing brand page identity";
  if (!Array.isArray(body.assets) || !body.assets.some((a) => a.role === "feed")) {
    return "Upload a feed creative";
  }
  const kinds = new Set(body.assets.map((a) => a.kind));
  if (kinds.size > 1) return "Feed and 9:16 creatives must both be images or both videos";
  if (!body.copy?.primaryText?.trim()) return "Primary text is required";
  if (!body.copy?.link?.trim()) return "Website URL is required";
  if (!body.copy?.cta) return "Pick a call to action";
  return null;
}

export async function POST(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as SubmitDraftRequest;
  const invalid = validate(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const supabase = getAdminClient();
  const { data, error } = await (supabase.from("ad_drafts") as any)
    .insert({
      ad_name: body.adName.trim(),
      campaign_id: body.campaignId,
      campaign_name: body.campaignName || null,
      adset_id: body.adsetId,
      adset_name: body.adsetName || null,
      page_id: body.pageId,
      instagram_user_id: body.instagramUserId || null,
      partnership_sponsor_id: body.partnershipSponsorId || null,
      partnership_sponsor_label: body.partnershipSponsorLabel || null,
      assets: body.assets,
      copy: body.copy,
      status: "pending",
      created_by: user.userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[ads/submit] insert failed:", error.message);
    return NextResponse.json({ error: "Could not save the draft" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, draftId: data.id });
}

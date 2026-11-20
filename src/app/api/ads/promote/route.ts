import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";
import { getPromotableAd, promoteAdToAdset, MetaApiError } from "@/lib/meta-ads";
import type { PromotableAd } from "@/types/meta-ads";

/**
 * Partnership ads need their sponsor re-attached to the new creative, and Meta
 * doesn't echo branded-content fields back on a read — so recover it from the
 * draft we published, and flag the ones we can't resolve.
 */
async function withPartnership(ad: PromotableAd): Promise<PromotableAd> {
  const supabase = getAdminClient();
  const { data: draft } = await (supabase.from("ad_drafts") as any)
    .select("partnership_sponsor_id")
    .eq("meta_ad_id", ad.adId)
    .maybeSingle();
  if (draft?.partnership_sponsor_id) {
    return { ...ad, partnershipSponsorId: String(draft.partnership_sponsor_id) };
  }
  const { data: synced } = await (supabase.from("meta_ads") as any)
    .select("partnership")
    .eq("ad_id", ad.adId)
    .maybeSingle();
  return { ...ad, partnershipUnresolved: !!synced?.partnership };
}

/** GET /api/ads/promote?adId=… — what the "Scale to CBO" dialog shows first. */
export async function GET(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adId = new URL(request.url).searchParams.get("adId");
  if (!adId) return NextResponse.json({ error: "adId required" }, { status: 400 });

  try {
    const ad = await withPartnership(await getPromotableAd(adId));
    return NextResponse.json(ad);
  } catch (err) {
    const message = err instanceof MetaApiError ? err.userMessage : "Failed to read the ad";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * POST /api/ads/promote — admin only. Creates a new ad in another ad set that
 * runs on the source ad's existing post, keeping its engagement.
 * Body: { adId, adsetId, name?, status: "ACTIVE" | "PAUSED" }
 */
export async function POST(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Only admins can scale ads" }, { status: 403 });
  }

  const body = await request.json();
  if (!body?.adId || !body?.adsetId) {
    return NextResponse.json({ error: "adId and adsetId required" }, { status: 400 });
  }

  try {
    const source = await withPartnership(await getPromotableAd(String(body.adId)));
    if (source.partnershipUnresolved) {
      return NextResponse.json(
        {
          error:
            "This is a partnership ad we didn't publish, so the creator sponsor can't be re-attached here — duplicate it in Ads Manager with the existing post.",
        },
        { status: 409 }
      );
    }
    const status: "ACTIVE" | "PAUSED" = body.status === "PAUSED" ? "PAUSED" : "ACTIVE";
    const mode: "post" | "copy" = body.mode === "copy" ? "copy" : "post";
    const result = await promoteAdToAdset({
      adId: source.adId,
      adsetId: String(body.adsetId),
      name: typeof body.name === "string" ? body.name : null,
      status,
      mode,
      partnershipSponsorId: source.partnershipSponsorId,
    });
    console.log(
      `[ads/promote] ${user.displayName} scaled ad ${source.adId} -> ${result.adId} in ad set ${body.adsetId} (${mode})`
    );

    // Remember the action so the page can badge the source ad as scaled.
    // Best-effort: the new ad already exists on Meta, so a missing table or
    // a failed insert must not turn the response into an error.
    const { error: recordError } = await (getAdminClient().from("ad_scale_actions") as any).insert({
      source_ad_id: source.adId,
      new_ad_id: result.adId,
      adset_id: String(body.adsetId),
      adset_name: typeof body.adsetName === "string" ? body.adsetName : null,
      campaign_id: typeof body.campaignId === "string" ? body.campaignId : null,
      campaign_name: typeof body.campaignName === "string" ? body.campaignName : null,
      status,
      created_by: user.userId,
    });
    if (recordError) console.warn("[ads/promote] could not record scale action:", recordError.message);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof MetaApiError ? err.userMessage : "Failed to scale the ad";
    console.error("[ads/promote] failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

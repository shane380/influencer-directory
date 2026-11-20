import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { getAdsUser } from "@/lib/ads-guard";
import { getAdPlacementMedia, MetaApiError } from "@/lib/meta-ads";
import type { AdPlacementMedia, PlacementMedia } from "@/lib/meta-ads";
import type { DraftAsset } from "@/types/meta-ads";

/**
 * GET /api/ads/media?adId=… — the feed and 9:16 creatives behind an ad.
 * Ads published from the launcher keep both files on R2 (durable, playable),
 * so those come first; anything else is read from Meta, where videos only
 * yield a poster frame.
 */
export async function GET(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adId = new URL(request.url).searchParams.get("adId");
  if (!adId) return NextResponse.json({ error: "adId required" }, { status: 400 });

  const supabase = getAdminClient();
  const { data: draft } = await (supabase.from("ad_drafts") as any)
    .select("assets")
    .eq("meta_ad_id", adId)
    .maybeSingle();
  const assets: DraftAsset[] = Array.isArray(draft?.assets) ? draft.assets : [];
  const fromDraft = (role: "feed" | "vertical"): PlacementMedia | null => {
    const a = assets.find((x) => x.role === role && x.fileUrl);
    return a ? { kind: a.kind === "video" ? "video" : "image", url: a.fileUrl, poster: a.thumbnailUrl || null } : null;
  };
  const draftMedia: AdPlacementMedia = { feed: fromDraft("feed"), vertical: fromDraft("vertical") };
  if (draftMedia.feed || draftMedia.vertical) {
    return NextResponse.json({ ...draftMedia, source: "launcher" });
  }

  try {
    const media = await getAdPlacementMedia(adId);
    return NextResponse.json({ ...media, source: "meta" });
  } catch (err) {
    const message = err instanceof MetaApiError ? err.userMessage : "Failed to read the ad's media";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

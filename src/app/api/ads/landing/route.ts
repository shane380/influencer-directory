import { NextResponse } from "next/server";
import { getAdsUser } from "@/lib/ads-guard";
import { getAdLandingPage, MetaApiError } from "@/lib/meta-ads";

/** GET /api/ads/landing?adId=… — the landing page an ad sends people to. */
export async function GET(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adId = new URL(request.url).searchParams.get("adId");
  if (!adId) return NextResponse.json({ error: "adId required" }, { status: 400 });

  try {
    return NextResponse.json(await getAdLandingPage(adId));
  } catch (err) {
    const message = err instanceof MetaApiError ? err.userMessage : "Failed to read the ad";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { listInstagramMedia, MetaApiError } from "@/lib/meta-ads";
import { getAdsUser } from "@/lib/ads-guard";

/** Organic posts from the brand IG account, for the "existing post" picker. */
export async function GET(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const after = new URL(request.url).searchParams.get("after");
  try {
    const result = await listInstagramMedia(after);
    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof MetaApiError ? err.userMessage : "Failed to load Instagram posts";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

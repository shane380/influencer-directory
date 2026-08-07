import { NextRequest, NextResponse } from "next/server";
import { getAdsUser } from "@/lib/ads-guard";
import { getAdminClient } from "@/lib/admin-auth";

// Directory-wide influencer search for the partnership panel — any record,
// not just flagged whitelisters, so requests can go to anyone on file.

export async function GET(request: NextRequest) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = String(request.nextUrl.searchParams.get("q") || "").trim().replace(/^@+/, "");
  if (q.length < 2) return NextResponse.json({ influencers: [] });
  const safe = q.replace(/[%_,()]/g, "");
  if (!safe) return NextResponse.json({ influencers: [] });

  const db = getAdminClient();
  const { data } = await (db.from("influencers") as any)
    .select("id, name, instagram_handle, profile_photo_url")
    .or(`name.ilike.%${safe}%,instagram_handle.ilike.%${safe}%`)
    .order("follower_count", { ascending: false })
    .limit(8);

  return NextResponse.json({ influencers: data || [] });
}

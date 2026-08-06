import { NextResponse } from "next/server";
import { getAdsUser } from "@/lib/ads-guard";
import { getAdminClient } from "@/lib/admin-auth";
import { listPartnershipPermissions, MetaApiError } from "@/lib/meta-ads";

// Partnership ads access panel data: every permission record from Meta
// (source of truth — no local table), matched to influencer records by
// handle, plus whitelisting influencers with no record yet as suggestions.

export async function GET() {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let permissions;
  try {
    permissions = await listPartnershipPermissions();
  } catch (err: any) {
    const msg = err instanceof MetaApiError ? err.userMessage : "Failed to load partnership permissions";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const db = getAdminClient();
  const { data: influencers } = await (db.from("influencers") as any)
    .select("id, name, instagram_handle, profile_photo_url, partnership_type, whitelisting_enabled")
    .or("whitelisting_enabled.eq.true,partnership_type.eq.whitelisting");

  const byHandle = new Map<string, any>();
  for (const inf of influencers || []) {
    byHandle.set(String(inf.instagram_handle || "").toLowerCase(), inf);
  }

  const knownHandles = new Set(
    permissions.map((p) => (p.creator_username || "").toLowerCase()).filter(Boolean)
  );

  const rows = permissions.map((p) => {
    const inf = p.creator_username ? byHandle.get(p.creator_username.toLowerCase()) : null;
    return {
      creator_username: p.creator_username,
      creator_ig_id: p.creator_ig_id,
      permission_status: p.permission_status,
      permission_url: p.permission_url,
      influencer: inf
        ? { id: inf.id, name: inf.name, profile_photo_url: inf.profile_photo_url }
        : null,
    };
  });

  const suggestions = (influencers || [])
    .filter((inf: any) => !knownHandles.has(String(inf.instagram_handle || "").toLowerCase()))
    .map((inf: any) => ({
      id: inf.id,
      name: inf.name,
      instagram_handle: inf.instagram_handle,
      profile_photo_url: inf.profile_photo_url,
    }));

  return NextResponse.json({ permissions: rows, suggestions });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { integrationTokenOk } from "@/lib/integrations-token";

// Machine-to-machine feed for the nama-inventory Paid Ads → Map ads inbox:
// the creative already mirrored here for each ad (thumbnail on R2, Mux
// playback id for videos, carousel image URLs, Meta's preview snippet), so a
// person can see the ad while deciding which products it promotes. Reads
// meta_ads only — no Meta API call. Contract: docs/cash-forecast-contract.md.
//
// Lives under /api/integrations/cash-forecast/ because that is the prefix the
// middleware lets through without a session (src/middleware.ts), and the
// middleware is off-limits to this change. If that whitelist ever becomes a
// generic /api/integrations/ prefix, move this to /api/integrations/ad-creatives.

export const dynamic = "force-dynamic";

const MAX_IDS = 300;

export async function GET(request: NextRequest) {
  const ok = integrationTokenOk(request);
  if (ok === null) return NextResponse.json({ error: "Integration endpoint not configured" }, { status: 503 });
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ids = (request.nextUrl.searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^\d{5,}$/.test(s))
    .slice(0, MAX_IDS);
  if (ids.length === 0) return NextResponse.json({ creatives: [] });

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("meta_ads")
    .select("ad_id, ad_name, format, effective_status, thumbnail_url, mux_playback_id, carousel_urls, preview_html")
    .in("ad_id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    creatives: (data || []).map((r: any) => ({
      ad_id: String(r.ad_id),
      ad_name: r.ad_name ?? null,
      format: r.format ?? null,
      effective_status: r.effective_status ?? null,
      thumbnail_url: r.thumbnail_url ?? null,
      mux_playback_id: r.mux_playback_id ?? null,
      carousel_urls: Array.isArray(r.carousel_urls) ? r.carousel_urls : [],
      preview_html: r.preview_html ?? null,
    })),
  });
}

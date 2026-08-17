import { NextResponse } from "next/server";
import { createAdset, getAdsetTemplate, MetaApiError } from "@/lib/meta-ads";
import { getAdsUser } from "@/lib/ads-guard";

/**
 * GET /api/ads/adsets?campaignId=…[&sourceAdsetId=…]
 * Prefill for the "New ad set" dialog: the setup a new ad set would inherit
 * from an existing sibling, plus which fields the campaign makes editable.
 */
export async function GET(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const campaignId = searchParams.get("campaignId");
  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  try {
    const template = await getAdsetTemplate(campaignId, searchParams.get("sourceAdsetId"));
    return NextResponse.json(template);
  } catch (err) {
    const message = err instanceof MetaApiError ? err.userMessage : "Failed to read the campaign";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/**
 * POST /api/ads/adsets — admin only; creates a real ad set on Meta.
 * Body: { campaignId, sourceAdsetId?, name, countries, bidAmount?,
 *         dailyBudget?, status }
 * Everything else is cloned server-side from the source ad set.
 */
export async function POST(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Only admins can create ad sets" }, { status: 403 });
  }

  const body = await request.json();
  if (!body?.campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  try {
    const adset = await createAdset({
      campaignId: String(body.campaignId),
      sourceAdsetId: body.sourceAdsetId ? String(body.sourceAdsetId) : null,
      name: String(body.name || ""),
      countries: Array.isArray(body.countries) ? body.countries.map(String) : [],
      bidAmount: typeof body.bidAmount === "number" ? body.bidAmount : null,
      dailyBudget: typeof body.dailyBudget === "number" ? body.dailyBudget : null,
      status: body.status === "ACTIVE" ? "ACTIVE" : "PAUSED",
    });
    console.log(`[ads/adsets] ${user.displayName} created ad set ${adset.id} (${adset.status})`);
    return NextResponse.json({ ok: true, adset });
  } catch (err) {
    const message = err instanceof MetaApiError ? err.userMessage : "Failed to create the ad set";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

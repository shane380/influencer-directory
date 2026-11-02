import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { summarizeCampaign, type CampaignSummary } from "@/lib/campaign-stats";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type CampaignStatsRow = CampaignSummary & {
  id: string;
  name: string;
  status: string;
  start_date: string | null;
  gift_enabled: boolean;
};

// One funnel row per campaign for the Gifting/PR overview. `scope=open`
// (default) is planning + active; `scope=all` includes completed and cancelled.
export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "open";

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let campaignQuery = (db.from("campaigns") as any)
    .select("id, name, status, start_date, gift_enabled")
    .order("start_date", { ascending: false, nullsFirst: false });
  if (scope === "open") {
    campaignQuery = campaignQuery.in("status", ["planning", "active"]);
  }
  const { data: campaigns, error: campaignError } = await campaignQuery;
  if (campaignError) {
    return NextResponse.json({ error: campaignError.message }, { status: 500 });
  }

  const ids = ((campaigns as any[]) || []).map((c) => c.id);
  if (ids.length === 0) {
    return NextResponse.json({ campaigns: [] });
  }

  // PostgREST caps a response at 1000 rows; the open campaigns together hold
  // more than that, so page through them.
  const PAGE = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: rowsError } = await (db.from("campaign_influencers") as any)
      .select(
        "campaign_id, status, approval_status, shopify_order_status, content_posted, gift_invited_at, gift_viewed_at, gift_submitted_at",
      )
      .in("campaign_id", ids)
      .order("id")
      .range(from, from + PAGE - 1);
    if (rowsError) {
      return NextResponse.json({ error: rowsError.message }, { status: 500 });
    }
    rows.push(...((page as any[]) || []));
    if (!page || page.length < PAGE) break;
  }

  const byCampaign = new Map<string, any[]>();
  for (const r of rows) {
    const list = byCampaign.get(r.campaign_id);
    if (list) list.push(r);
    else byCampaign.set(r.campaign_id, [r]);
  }

  const result: CampaignStatsRow[] = ((campaigns as any[]) || []).map((c) => ({
    id: c.id,
    name: String(c.name || "").trim(),
    status: c.status,
    start_date: c.start_date ?? null,
    gift_enabled: !!c.gift_enabled,
    ...summarizeCampaign(byCampaign.get(c.id) || []),
  }));

  return NextResponse.json({ campaigns: result });
}

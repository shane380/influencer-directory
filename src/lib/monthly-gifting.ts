import type { createClient } from "@/lib/supabase/client";
import type { Campaign, CampaignInfluencer, Influencer } from "@/types/database";

type Supabase = ReturnType<typeof createClient>;

// One-off gifting from the directory lands in the current month's
// "Monthly Gifting" campaign (matched by name + start_date month, the same
// month bucketing the campaigns tab uses), creating it if it doesn't exist.

const MONTHLY_GIFTING_NAME = "Monthly Gifting";

function currentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return { start: `${year}-${month}-01`, end: `${year}-${month}-${String(lastDay).padStart(2, "0")}` };
}

export async function findCurrentMonthlyGiftingCampaign(supabase: Supabase): Promise<Campaign | null> {
  const { start, end } = currentMonthRange();
  const { data } = await (supabase.from("campaigns") as any)
    .select("*")
    .ilike("name", `${MONTHLY_GIFTING_NAME}%`)
    .gte("start_date", start)
    .lte("start_date", end)
    .order("start_date", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1);
  return (data?.[0] as Campaign) || null;
}

async function findOrCreateCurrentMonthlyGiftingCampaign(supabase: Supabase): Promise<Campaign> {
  const existing = await findCurrentMonthlyGiftingCampaign(supabase);
  if (existing) return existing;

  const { data, error } = await (supabase.from("campaigns") as any)
    .insert({ name: MONTHLY_GIFTING_NAME, start_date: currentMonthRange().start, status: "active" })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not create this month's gifting campaign");
  return data as Campaign;
}

// Returns the influencer's row in this month's gifting campaign, adding them
// if needed. `created` tells the caller it may undo the add if no order is made.
export async function allocateToCurrentMonthlyGifting(
  supabase: Supabase,
  influencer: Influencer
): Promise<{ campaignInfluencer: CampaignInfluencer; created: boolean }> {
  const campaign = await findOrCreateCurrentMonthlyGiftingCampaign(supabase);

  const { data: existing } = await (supabase.from("campaign_influencers") as any)
    .select("*")
    .eq("campaign_id", campaign.id)
    .eq("influencer_id", influencer.id)
    .limit(1);
  if (existing?.[0]) return { campaignInfluencer: existing[0] as CampaignInfluencer, created: false };

  const insertData: Record<string, unknown> = {
    campaign_id: campaign.id,
    influencer_id: influencer.id,
    partnership_type: influencer.partnership_type,
  };
  if (campaign.requires_approval) insertData.approval_status = "pending";

  const { data, error } = await (supabase.from("campaign_influencers") as any)
    .insert(insertData)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Could not add this creator to the gifting campaign");
  return { campaignInfluencer: data as CampaignInfluencer, created: true };
}

// Undo an allocation the user backed out of: only removes the row if nothing
// was picked or ordered on it.
export async function releaseUnusedAllocation(supabase: Supabase, campaignInfluencerId: string) {
  const { data } = await (supabase.from("campaign_influencers") as any)
    .select("product_selections, shopify_order_id")
    .eq("id", campaignInfluencerId)
    .single();
  if (!data) return;
  const hasSelections = Array.isArray(data.product_selections) && data.product_selections.length > 0;
  if (hasSelections || data.shopify_order_id) return;
  await (supabase.from("campaign_influencers") as any).delete().eq("id", campaignInfluencerId);
}

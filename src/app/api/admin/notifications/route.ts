import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { isPaidWhitelisting, termState, daysRemaining, termExpiry } from "@/lib/whitelisting";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Who's asking — gift-selects notifications go to the influencer's owner.
  let viewerId: string | null = null;
  try {
    const authed = await createServerClient();
    const { data: { user } } = await authed.auth.getUser();
    viewerId = user?.id || null;
  } catch {
    // fall through: unowned notifications still show
  }

  // Fetch pending content submissions with creator info
  const { data: submissions } = await supabase
    .from("creator_content_submissions")
    .select("id, creator_id, influencer_id, month, files, created_at, creators(creator_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch recent confirmed outfit requests (product selections) that haven't been ordered yet
  const { data: outfitRequests } = await (supabase
    .from("campaign_assignments") as any)
    .select("id, creator_id, confirmed_at, selected_products, order_id, campaign:creator_campaigns(title), creator:creators(creator_name)")
    .eq("status", "confirmed")
    .not("selected_products", "is", null)
    .is("order_id", null)
    .order("confirmed_at", { ascending: false })
    .limit(20);

  // Gift/Selects submissions awaiting a draft order — clears when the
  // coordinator places the order. Targeted at the influencer's owner;
  // unassigned rows show for everyone.
  const { data: giftSelects } = await (supabase
    .from("campaign_influencers") as any)
    .select("id, campaign_id, gift_submitted_at, product_selections, influencers!inner(name, assigned_to), campaigns!inner(name)")
    .not("gift_submitted_at", "is", null)
    .is("shopify_order_id", null)
    .order("gift_submitted_at", { ascending: false })
    .limit(20);

  const contentNotifications = (submissions || []).map((sub: any) => ({
    id: sub.id,
    type: "content_submission" as const,
    creator_name: sub.creators?.creator_name || "Unknown",
    creator_id: sub.creator_id,
    influencer_id: sub.influencer_id,
    month: sub.month,
    file_count: Array.isArray(sub.files) ? sub.files.length : 0,
    created_at: sub.created_at,
  }));

  // Pending ad drafts awaiting admin approval (Ad Launcher)
  const { data: adDrafts } = await (supabase
    .from("ad_drafts") as any)
    .select("id, ad_name, campaign_name, created_at, creator_profile:profiles!ad_drafts_created_by_fkey(display_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(20);

  const adNotifications = (adDrafts || []).map((d: any) => ({
    id: d.id,
    type: "ad_approval" as const,
    creator_name: d.creator_profile?.display_name || "A teammate",
    ad_name: d.ad_name,
    campaign_title: d.campaign_name || "",
    created_at: d.created_at,
  }));

  // Feedback on the viewer's own submitted ads — clears when they resubmit
  // or withdraw the draft.
  let adFeedbackNotifications: any[] = [];
  if (viewerId) {
    const { data: feedbackDrafts } = await (supabase
      .from("ad_drafts") as any)
      .select("id, ad_name, feedback, reviewed_at, created_at")
      .eq("created_by", viewerId)
      .eq("status", "changes_requested")
      .order("reviewed_at", { ascending: false })
      .limit(20);

    adFeedbackNotifications = (feedbackDrafts || []).map((d: any) => ({
      id: d.id,
      type: "ad_feedback" as const,
      creator_name: "Ad review",
      ad_name: d.ad_name,
      created_at: d.reviewed_at || d.created_at,
    }));
  }

  const outfitNotifications = (outfitRequests || []).map((req: any) => ({
    id: req.id,
    type: "outfit_request" as const,
    creator_name: req.creator?.creator_name || "Unknown",
    creator_id: req.creator_id,
    campaign_title: req.campaign?.title || "Unknown campaign",
    product_count: Array.isArray(req.selected_products) ? req.selected_products.length : 0,
    created_at: req.confirmed_at,
  }));

  const giftNotifications = (giftSelects || [])
    .filter((row: any) => {
      const inf = Array.isArray(row.influencers) ? row.influencers[0] : row.influencers;
      return !inf?.assigned_to || inf.assigned_to === viewerId;
    })
    .map((row: any) => {
      const inf = Array.isArray(row.influencers) ? row.influencers[0] : row.influencers;
      const camp = Array.isArray(row.campaigns) ? row.campaigns[0] : row.campaigns;
      return {
        id: row.id,
        type: "gift_selects" as const,
        creator_name: inf?.name || "Unknown",
        campaign_id: row.campaign_id,
        campaign_title: camp?.name || "Unknown campaign",
        product_count: Array.isArray(row.product_selections) ? row.product_selections.length : 0,
        created_at: row.gift_submitted_at,
      };
    });

  // Whitelisting usage terms running out. Derived live from the deals, like
  // everything else here — no sent-log to keep in sync, and the item simply
  // stops appearing once the term is marked ended or the dates are corrected.
  // Only paid whitelisting carries a term to honour; the % ad-spend
  // arrangements have no window to chase.
  const { data: wlDeals } = await (supabase
    .from("campaign_deals") as any)
    .select("id, total_deal_value, whitelisting_status, whitelisting_live_date, whitelisting_expiry_date, influencer:influencers(name, instagram_handle)")
    .in("whitelisting_status", ["live", "pending"])
    .not("whitelisting_live_date", "is", null);

  const whitelistingNotifications = (wlDeals || [])
    .filter((d: any) => isPaidWhitelisting(d))
    .map((d: any) => {
      const state = termState(d);
      if (state !== "expiring" && state !== "expired") return null;
      const left = daysRemaining(d) ?? 0;
      const expiry = termExpiry(d);
      return {
        id: `wl-${state}-${d.id}`,
        type: state === "expired" ? ("whitelisting_expired" as const) : ("whitelisting_expiring" as const),
        creator_name: d.influencer?.name || "Unknown",
        creator_handle: d.influencer?.instagram_handle || null,
        deal_id: d.id,
        days_remaining: left,
        expiry_date: expiry ? expiry.toISOString().slice(0, 10) : null,
        // Sorted with everything else by recency: the day the term turns.
        created_at: expiry ? expiry.toISOString() : new Date().toISOString(),
      };
    })
    .filter(Boolean);

  const notifications = [...contentNotifications, ...outfitNotifications, ...adNotifications, ...adFeedbackNotifications, ...giftNotifications, ...whitelistingNotifications]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);

  return NextResponse.json({ notifications });
}

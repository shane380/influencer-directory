import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

  const outfitNotifications = (outfitRequests || []).map((req: any) => ({
    id: req.id,
    type: "outfit_request" as const,
    creator_name: req.creator?.creator_name || "Unknown",
    creator_id: req.creator_id,
    campaign_title: req.campaign?.title || "Unknown campaign",
    product_count: Array.isArray(req.selected_products) ? req.selected_products.length : 0,
    created_at: req.confirmed_at,
  }));

  const notifications = [...contentNotifications, ...outfitNotifications, ...adNotifications]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 20);

  return NextResponse.json({ notifications });
}

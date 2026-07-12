import { createClient } from "@supabase/supabase-js";
import type { GiftPoolProduct } from "@/types/database";

// Server-side helpers shared by the public gift token routes. Service-role
// client: campaign_influencers has no anon RLS, and must not — callers build
// allowlisted payloads and never expose notes/compensation/approval fields.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export function giftServiceClient() {
  return supabase;
}

export async function loadGiftAssignment(token: string) {
  if (!token || token.length < 16 || token.length > 64) return null;
  const { data } = await supabase
    .from("campaign_influencers")
    .select(
      `id, campaign_id, influencer_id, gift_products_override, gift_max_selects_override,
       gift_viewed_at, gift_submitted_at, gift_shipping, product_selections,
       shopify_order_id, shopify_order_status, tracking_number, tracking_url,
       campaigns!inner(name, start_date, gift_enabled, gift_hero_image, gift_blurb, gift_products, gift_max_selects),
       influencers!inner(id, name, email, phone, mailing_address, top_size, bottoms_size, shopify_customer_id)`
    )
    .eq("gift_token", token)
    .single();
  if (!data) return null;
  const campaign = Array.isArray((data as any).campaigns) ? (data as any).campaigns[0] : (data as any).campaigns;
  const influencer = Array.isArray((data as any).influencers) ? (data as any).influencers[0] : (data as any).influencers;
  if (!campaign?.gift_enabled) return null;
  return { assignment: data as any, campaign, influencer };
}

export function effectivePool(assignment: any, campaign: any): GiftPoolProduct[] {
  const pool =
    (assignment.gift_products_override as GiftPoolProduct[] | null) ??
    (campaign.gift_products as GiftPoolProduct[] | null);
  return Array.isArray(pool) ? pool : [];
}

// gift_max_selects stores the OUTFIT allowance; an outfit is 2–3 pieces,
// so the hard piece cap is outfits × 3 (soft guidance only on minimums).
export function effectiveOutfits(assignment: any, campaign: any): number {
  return assignment.gift_max_selects_override ?? campaign.gift_max_selects ?? 1;
}

export function effectiveMaxPieces(assignment: any, campaign: any): number {
  return effectiveOutfits(assignment, campaign) * 3;
}

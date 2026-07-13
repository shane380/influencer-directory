import { createClient } from "@supabase/supabase-js";
import { fetchProductsByIds } from "@/lib/shopify-products";
import type { GiftPoolProduct, GiftShipping } from "@/types/database";

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

// Campaign-level open link (gift_generic_token) — reusable, not tied to a
// campaign_influencers row. gift_enabled stays the master switch.
export async function loadGenericCampaign(token: string) {
  if (!token || token.length < 16 || token.length > 64) return null;
  const { data } = await supabase
    .from("campaigns")
    .select(
      "id, name, start_date, gift_enabled, gift_hero_image, gift_blurb, gift_products, gift_generic_enabled, gift_generic_token, gift_generic_max_selects"
    )
    .eq("gift_generic_token", token)
    .single();
  if (!data || !(data as any).gift_enabled || !(data as any).gift_generic_enabled) return null;
  return data as any;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shared by the personal and generic submit routes. Returns either the
// normalized shipping object or a human-readable validation detail.
export function validateGiftShipping(raw: any): { shipping: GiftShipping } | { detail: string } {
  const s = raw || {};
  const shipping: GiftShipping = {
    name: String(s.name || "").trim().slice(0, 120),
    email: String(s.email || "").trim().slice(0, 200),
    phone: String(s.phone || "").trim().slice(0, 40),
    address1: String(s.address1 || "").trim().slice(0, 200),
    address2: String(s.address2 || "").trim().slice(0, 200),
    city: String(s.city || "").trim().slice(0, 100),
    province: String(s.province || "").trim().slice(0, 60),
    zip: String(s.zip || "").trim().slice(0, 20),
    country_code: String(s.country_code || "").trim().toUpperCase().slice(0, 2),
  };
  if (!shipping.name) return { detail: "name required" };
  if (!EMAIL_RE.test(shipping.email)) return { detail: "valid email required" };
  if ((shipping.phone.match(/\d/g) || []).length < 7) return { detail: "valid phone required" };
  if (!shipping.address1 || !shipping.city || !shipping.zip || !shipping.country_code) {
    return { detail: "address incomplete" };
  }
  if (["US", "CA"].includes(shipping.country_code) && !shipping.province) {
    return { detail: "province/state required" };
  }
  return { shipping };
}

// Validates picks against the pool/cap and re-resolves them from Shopify,
// building product_selections in the exact OrderDialog CartItem shape from
// SERVER data (never trusting client titles/prices).
export async function resolveGiftSelections(
  rawSelections: any,
  pool: GiftPoolProduct[],
  maxPieces: number
): Promise<{ productSelections: any[] } | { detail: string; status?: number }> {
  const selections: { product_id: string; variant_id: string }[] = Array.isArray(rawSelections)
    ? rawSelections.map((x: any) => ({
        product_id: String(x?.product_id || ""),
        variant_id: String(x?.variant_id || ""),
      }))
    : [];
  if (selections.length === 0) return { detail: "no items selected" };
  if (selections.length > maxPieces) return { detail: "too many items" };
  const variantIds = selections.map((x) => x.variant_id);
  if (new Set(variantIds).size !== variantIds.length) return { detail: "duplicate items" };

  const allowedProductIds = new Set(pool.map((p) => String(p.product_id)));
  for (const sel of selections) {
    if (!allowedProductIds.has(sel.product_id)) return { detail: "item not in this campaign" };
  }

  let resolved;
  try {
    resolved = await fetchProductsByIds([...new Set(selections.map((x) => x.product_id))]);
  } catch (err) {
    console.error("[gift] submit resolve failed:", err);
    return { detail: "products_unavailable", status: 503 };
  }
  const byProduct = new Map(resolved.map((p) => [p.product_id, p]));
  const productSelections: any[] = [];
  for (const sel of selections) {
    const product = byProduct.get(sel.product_id);
    const variant = product?.variants.find((v) => v.variant_id === sel.variant_id);
    if (!product || !variant) {
      return { detail: "please refresh your picks and try again" };
    }
    productSelections.push({
      sku: variant.sku,
      variant_id: String(variant.variant_id),
      quantity: 1,
      title: product.title,
      variant_title: variant.title || undefined,
      price: variant.price,
      image: product.image || undefined,
    });
  }
  return { productSelections };
}

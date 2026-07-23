import { NextRequest, NextResponse } from "next/server";
import { fetchProductsByIds } from "@/lib/shopify-products";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";
import { loadGiftAssignment, effectivePool, effectiveOutfits, effectiveMaxPieces } from "@/lib/gift-server";
import type { GiftShipping } from "@/types/database";

// Public tokenized gift endpoint (middleware-whitelisted under /api/gift/t/).
// The response is ALLOWLIST-BUILT — never include notes, compensation,
// approval fields, or prices. Unknown tokens get a uniform 404.

async function shopifyCustomerContact(
  customerId: string
): Promise<{ email: string; phone: string; address: Partial<GiftShipping> | null } | null> {
  try {
    const storeUrl = getShopifyStoreUrl();
    const accessToken = await getShopifyAccessToken();
    if (!storeUrl || !accessToken) return null;
    const res = await fetch(`https://${storeUrl}/admin/api/2024-01/customers/${customerId}.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    if (!res.ok) return null;
    const { customer } = await res.json();
    if (!customer) return null;
    const addr = customer.default_address || customer.addresses?.[0];
    return {
      email: customer.email || "",
      phone: customer.phone || addr?.phone || "",
      address: addr?.address1
        ? {
            address1: addr.address1 || "",
            address2: addr.address2 || "",
            city: addr.city || "",
            province: addr.province_code || addr.province || "",
            zip: addr.zip || "",
            country_code: (addr.country_code || "").toUpperCase(),
          }
        : null,
    };
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadGiftAssignment(token);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { assignment, campaign, influencer } = loaded;

  const firstName = (influencer.name || "").trim().split(/\s+/)[0] || "there";

  const base = {
    campaign: {
      name: campaign.name,
      hero_image_url: campaign.gift_hero_image?.url || null,
      hero_image_mobile_url: campaign.gift_hero_image?.mobile_url || null,
      blurb: campaign.gift_blurb || null,
      outfits: effectiveOutfits(assignment, campaign),
      max_selects: effectiveMaxPieces(assignment, campaign),
      launch_date: campaign.start_date || null,
    },
    influencer: {
      first_name: firstName,
      top_size: influencer.top_size || null,
      bottoms_size: influencer.bottoms_size || null,
    },
  };

  // Submitted (or manually ordered by the team) → status view, no pool.
  if (assignment.gift_submitted_at || assignment.shopify_order_id) {
    const selections = (assignment.product_selections || []).map((s: any) => ({
      title: s.title || "",
      variant_title: s.variant_title || null,
      quantity: s.quantity || 1,
      image: s.image || null,
    }));
    return NextResponse.json({
      state: "submitted",
      ...base,
      submitted: {
        selections,
        submitted_at: assignment.gift_submitted_at,
        order_status: assignment.shopify_order_status || (assignment.shopify_order_id ? "draft" : null),
        tracking_url: assignment.tracking_url || null,
        tracking_number: assignment.tracking_number || null,
        shipping: assignment.gift_shipping || null,
      },
    });
  }

  // Prefill precedence: prior gift_shipping → Shopify customer → free-text mailing_address.
  let prefill: any = {
    name: influencer.name || "",
    email: influencer.email || "",
    phone: influencer.phone || "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    zip: "",
    country_code: "",
    source: "none",
  };
  if (assignment.gift_shipping) {
    prefill = { ...prefill, ...assignment.gift_shipping, source: "gift_shipping" };
  } else if (influencer.shopify_customer_id) {
    // The influencer row often lacks email/phone even when the linked Shopify
    // customer has them — fill any blanks from the customer record too.
    const contact = await shopifyCustomerContact(influencer.shopify_customer_id);
    if (contact) {
      if (!prefill.email && contact.email) prefill.email = contact.email;
      if (!prefill.phone && contact.phone) prefill.phone = contact.phone;
      if (contact.address) prefill = { ...prefill, ...contact.address, source: "shopify_customer" };
    }
  }
  if (prefill.source === "none" && influencer.mailing_address) {
    prefill.address1 = influencer.mailing_address;
    prefill.source = "mailing_address";
  }

  // Resolve the pool via Shopify Admin API (drafts included), strip prices.
  const pool = effectivePool(assignment, campaign);
  let products: any[] = [];
  try {
    const resolved = await fetchProductsByIds(pool.map((p) => String(p.product_id)));
    products = resolved.map((p) => ({
      product_id: p.product_id,
      title: p.title,
      image: p.image,
      images: p.images,
      options: p.options,
      variants: p.variants.map((v) => ({
        variant_id: v.variant_id,
        title: v.title,
        selected_options: v.selected_options,
        // Pre-launch drafts have no inventory yet — gifts ship from PR stock,
        // so every size stays pickable; only ACTIVE products gate on stock.
        available: p.status === "draft" ? true : v.available,
      })),
    }));
  } catch (err) {
    console.error("[gift] product resolve failed:", err);
    return NextResponse.json({ error: "Products unavailable" }, { status: 503 });
  }

  return NextResponse.json({ state: "open", ...base, prefill, products });
}

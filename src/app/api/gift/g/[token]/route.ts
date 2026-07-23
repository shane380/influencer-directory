import { NextRequest, NextResponse } from "next/server";
import { fetchProductsByIds } from "@/lib/shopify-products";
import { loadGenericCampaign } from "@/lib/gift-server";
import type { GiftPoolProduct } from "@/types/database";

// Public campaign-level open gift link (middleware-whitelisted under
// /api/gift/g/). Reusable by many creators, so it is ALWAYS "open" — there
// is no submitted state on the token itself. Payload is allowlist-built and
// mirrors the personal route's shape so the gift page renders unchanged;
// prices stripped, unknown tokens get a uniform 404.

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const campaign = await loadGenericCampaign(token);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const outfits = campaign.gift_generic_max_selects ?? 1;

  const pool: GiftPoolProduct[] = Array.isArray(campaign.gift_products) ? campaign.gift_products : [];
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
    console.error("[gift] generic product resolve failed:", err);
    return NextResponse.json({ error: "Products unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    state: "open",
    generic: true,
    campaign: {
      name: campaign.name,
      hero_image_url: campaign.gift_hero_image?.url || null,
      hero_image_mobile_url: campaign.gift_hero_image?.mobile_url || null,
      blurb: campaign.gift_blurb || null,
      outfits,
      max_selects: outfits * 3,
      launch_date: campaign.start_date || null,
    },
    influencer: { first_name: null, top_size: null, bottoms_size: null },
    prefill: {
      name: "",
      email: "",
      phone: "",
      address1: "",
      address2: "",
      city: "",
      province: "",
      zip: "",
      country_code: "",
      source: "none",
    },
    products,
  });
}

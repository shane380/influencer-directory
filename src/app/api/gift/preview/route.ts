import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { fetchProductsByIds } from "@/lib/shopify-products";
import { poolImageOverride } from "@/lib/gift-server";
import type { GiftPoolProduct } from "@/types/database";

// Admin/manager-only: builds the selects page payload for a campaign so the
// team can preview it before (or without) enabling the link. Accepts the
// settings dialog's unsaved draft; anything missing falls back to the saved
// campaign. Same shape as the generic route, so the gift page renders as-is.
// NOT under /api/gift/t/ or /g/ — this route stays behind the auth wall.

export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await (supabase.from("profiles") as any)
    .select("is_admin, is_manager")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin && !profile?.is_manager) {
    return NextResponse.json({ error: "Admin or manager access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const campaignId = String(body?.campaign_id || "");
  if (!campaignId) return NextResponse.json({ error: "campaign_id is required" }, { status: 400 });

  const { data: campaign } = await (supabase.from("campaigns") as any)
    .select("id, name, start_date, gift_hero_image, gift_blurb, gift_products, gift_max_selects, gift_selects_deadline")
    .eq("id", campaignId)
    .single();
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const draft = body?.draft && typeof body.draft === "object" ? body.draft : {};
  const pool: GiftPoolProduct[] = Array.isArray(draft.pool)
    ? draft.pool
    : Array.isArray(campaign.gift_products)
      ? campaign.gift_products
      : [];
  const hero = "hero_image" in draft ? draft.hero_image : campaign.gift_hero_image;
  const outfits = Math.max(1, Math.min(10, Number(draft.outfits ?? campaign.gift_max_selects) || 1));

  let products: any[] = [];
  try {
    const resolved = await fetchProductsByIds(pool.map((p) => String(p.product_id)));
    // Keep pool order — that's the order creators see.
    const byId = new Map(resolved.map((p) => [p.product_id, p]));
    products = pool
      .map((entry) => byId.get(String(entry.product_id)))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({
        product_id: p.product_id,
        title: p.title,
        image: poolImageOverride(p.product_id, pool) || p.image,
        images: p.images,
        options: p.options,
        variants: p.variants.map((v) => ({
          variant_id: v.variant_id,
          title: v.title,
          selected_options: v.selected_options,
          available: p.status === "draft" ? true : v.available,
        })),
      }));
  } catch (err) {
    console.error("[gift] preview product resolve failed:", err);
    return NextResponse.json({ error: "Products unavailable" }, { status: 503 });
  }

  return NextResponse.json({
    state: "open",
    preview: true,
    campaign: {
      name: campaign.name,
      hero_image_url: hero?.url || null,
      hero_image_mobile_url: hero?.mobile_url || null,
      blurb: ("blurb" in draft ? draft.blurb : campaign.gift_blurb) || null,
      outfits,
      max_selects: outfits * 3,
      launch_date: campaign.start_date || null,
      selects_deadline: ("selects_deadline" in draft ? draft.selects_deadline : campaign.gift_selects_deadline) || null,
    },
    influencer: { first_name: "Alex", top_size: null, bottoms_size: null },
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

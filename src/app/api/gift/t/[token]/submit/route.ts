import { NextRequest, NextResponse } from "next/server";
import { fetchProductsByIds } from "@/lib/shopify-products";
import { loadGiftAssignment, effectivePool, effectiveMaxPieces, giftServiceClient } from "@/lib/gift-server";
import type { GiftShipping } from "@/types/database";

// Accepts an influencer's picks + confirmed shipping. Writes
// product_selections in the exact OrderDialog CartItem shape (from SERVER
// data, never trusting client titles/prices) so the coordinator's existing
// review → Create Order flow works unchanged. Atomic idempotency via the
// conditional UPDATE — a row can only ever be submitted once.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badRequest(error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status: 400 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const raw = await request.text();
  if (raw.length > 10_000) return badRequest("payload_too_large");
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return badRequest("invalid_json");
  }

  const loaded = await loadGiftAssignment(token);
  if (!loaded) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { assignment, campaign, influencer } = loaded;

  if (assignment.shopify_order_id) {
    return NextResponse.json({ error: "already_ordered" }, { status: 409 });
  }
  if (assignment.gift_submitted_at) {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }

  // --- Validate shipping ---
  const s = body.shipping || {};
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
  if (!shipping.name) return badRequest("shipping_invalid", "name required");
  if (!EMAIL_RE.test(shipping.email)) return badRequest("shipping_invalid", "valid email required");
  if ((shipping.phone.match(/\d/g) || []).length < 7) return badRequest("shipping_invalid", "valid phone required");
  if (!shipping.address1 || !shipping.city || !shipping.zip || !shipping.country_code) {
    return badRequest("shipping_invalid", "address incomplete");
  }
  if (["US", "CA"].includes(shipping.country_code) && !shipping.province) {
    return badRequest("shipping_invalid", "province/state required");
  }

  // --- Validate selections ---
  const selections: { product_id: string; variant_id: string }[] = Array.isArray(body.selections)
    ? body.selections.map((x: any) => ({
        product_id: String(x?.product_id || ""),
        variant_id: String(x?.variant_id || ""),
      }))
    : [];
  const maxSelects = effectiveMaxPieces(assignment, campaign);
  if (selections.length === 0) return badRequest("selections_invalid", "no items selected");
  if (selections.length > maxSelects) return badRequest("selections_invalid", "too many items");
  const variantIds = selections.map((x) => x.variant_id);
  if (new Set(variantIds).size !== variantIds.length) return badRequest("selections_invalid", "duplicate items");

  const pool = effectivePool(assignment, campaign);
  const allowedProductIds = new Set(pool.map((p) => String(p.product_id)));
  for (const sel of selections) {
    if (!allowedProductIds.has(sel.product_id)) return badRequest("selections_invalid", "item not in this campaign");
  }

  // --- Re-resolve from Shopify; build product_selections from server data ---
  let resolved;
  try {
    resolved = await fetchProductsByIds([...new Set(selections.map((x) => x.product_id))]);
  } catch (err) {
    console.error("[gift] submit resolve failed:", err);
    return NextResponse.json({ error: "products_unavailable" }, { status: 503 });
  }
  const byProduct = new Map(resolved.map((p) => [p.product_id, p]));
  const productSelections: any[] = [];
  for (const sel of selections) {
    const product = byProduct.get(sel.product_id);
    const variant = product?.variants.find((v) => v.variant_id === sel.variant_id);
    if (!product || !variant) {
      return badRequest("selections_stale", "please refresh your picks and try again");
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

  // --- Atomic write: only one submit ever wins ---
  const db = giftServiceClient();
  const { data: updated } = await db
    .from("campaign_influencers")
    .update({
      product_selections: productSelections,
      gift_shipping: shipping,
      gift_submitted_at: new Date().toISOString(),
    })
    .eq("gift_token", token)
    .is("gift_submitted_at", null)
    .select("id");
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }

  // --- Backfill influencer contact fields, only where empty ---
  try {
    const patch: Record<string, string> = {};
    if (!influencer.email && shipping.email) patch.email = shipping.email;
    if (!influencer.phone && shipping.phone) patch.phone = shipping.phone;
    if (!influencer.mailing_address) {
      patch.mailing_address = [shipping.address1, shipping.address2, shipping.city, `${shipping.province} ${shipping.zip}`.trim(), shipping.country_code]
        .filter(Boolean)
        .join(", ");
    }
    if (Object.keys(patch).length > 0) {
      await db.from("influencers").update(patch).eq("id", influencer.id);
    }
  } catch (err) {
    console.warn("[gift] influencer backfill failed:", err);
  }

  return NextResponse.json({
    ok: true,
    submitted: {
      selections: productSelections.map((p) => ({
        title: p.title,
        variant_title: p.variant_title || null,
        quantity: p.quantity,
        image: p.image || null,
      })),
      submitted_at: new Date().toISOString(),
      order_status: null,
      tracking_url: null,
      tracking_number: null,
      shipping,
    },
  });
}

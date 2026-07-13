import { NextRequest, NextResponse } from "next/server";
import {
  loadGiftAssignment,
  effectivePool,
  effectiveMaxPieces,
  giftServiceClient,
  validateGiftShipping,
  resolveGiftSelections,
} from "@/lib/gift-server";

// Accepts an influencer's picks + confirmed shipping. Writes
// product_selections in the exact OrderDialog CartItem shape (from SERVER
// data, never trusting client titles/prices) so the coordinator's existing
// review → Create Order flow works unchanged. Atomic idempotency via the
// conditional UPDATE — a row can only ever be submitted once.

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

  const shippingResult = validateGiftShipping(body.shipping);
  if (!("shipping" in shippingResult)) return badRequest("shipping_invalid", shippingResult.detail);
  const shipping = shippingResult.shipping;

  const selectionsResult = await resolveGiftSelections(
    body.selections,
    effectivePool(assignment, campaign),
    effectiveMaxPieces(assignment, campaign)
  );
  if (!("productSelections" in selectionsResult)) {
    if (selectionsResult.status === 503) {
      return NextResponse.json({ error: "products_unavailable" }, { status: 503 });
    }
    return badRequest(
      selectionsResult.detail === "please refresh your picks and try again" ? "selections_stale" : "selections_invalid",
      selectionsResult.detail
    );
  }
  const productSelections = selectionsResult.productSelections;

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

  // --- Sync influencer contact fields: email/phone fill blanks only, but the
  // freshly confirmed address always replaces the profile's mailing_address.
  try {
    const patch: Record<string, string> = {};
    if (!influencer.email && shipping.email) patch.email = shipping.email;
    if (!influencer.phone && shipping.phone) patch.phone = shipping.phone;
    patch.mailing_address = [shipping.address1, shipping.address2, shipping.city, `${shipping.province} ${shipping.zip}`.trim(), shipping.country_code]
      .filter(Boolean)
      .join(", ");
    await db.from("influencers").update(patch).eq("id", influencer.id);
  } catch (err) {
    console.warn("[gift] influencer sync failed:", err);
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

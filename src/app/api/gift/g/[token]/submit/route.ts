import { NextRequest, NextResponse } from "next/server";
import {
  loadGenericCampaign,
  giftServiceClient,
  validateGiftShipping,
  resolveGiftSelections,
} from "@/lib/gift-server";
import { generateGiftToken, giftUrl } from "@/lib/gift";
import type { GiftPoolProduct } from "@/types/database";

// Submission endpoint for the campaign-level open gift link. Unlike the
// personal route there is no pre-existing row: we MATCH the submitter to an
// existing influencer (IG handle first, then email — never name alone) or
// create a new record, then upsert their campaign_influencers row and write
// the submission with the same atomic conditional UPDATE as the personal
// route. Response includes a personal status URL for the row the submitter
// just created themselves; a 409 never echoes any existing data back.

function badRequest(error: string, detail?: string) {
  return NextResponse.json({ error, detail }, { status: 400 });
}

const PLACEHOLDER_RE = /^pending-[0-9a-f]{8}$/;

function normalizeHandle(raw: any): string | null {
  const handle = String(raw || "").trim().replace(/^@+/, "").toLowerCase();
  if (!handle) return null;
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) return null;
  if (PLACEHOLDER_RE.test(handle)) return null;
  return handle;
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

  const campaign = await loadGenericCampaign(token);
  if (!campaign) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const shippingResult = validateGiftShipping(body.shipping);
  if (!("shipping" in shippingResult)) return badRequest("shipping_invalid", shippingResult.detail);
  const shipping = shippingResult.shipping;

  const outfits = campaign.gift_generic_max_selects ?? 1;
  const pool: GiftPoolProduct[] = Array.isArray(campaign.gift_products) ? campaign.gift_products : [];
  const selectionsResult = await resolveGiftSelections(body.selections, pool, outfits * 3);
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

  const db = giftServiceClient();
  const handle = normalizeHandle(body.instagram_handle);

  // --- Match to an existing influencer: handle first, then email. Name-only
  // matching is deliberately excluded (it has attached wrong records before).
  let influencer: any = null;
  if (handle) {
    const { data } = await db
      .from("influencers")
      .select("id, name, email, phone, instagram_handle")
      .ilike("instagram_handle", handle)
      .limit(1);
    influencer = data?.[0] || null;
  }
  if (!influencer) {
    const { data } = await db
      .from("influencers")
      .select("id, name, email, phone, instagram_handle")
      .ilike("email", shipping.email)
      .limit(1);
    influencer = data?.[0] || null;
  }

  const mailingAddress = [shipping.address1, shipping.address2, shipping.city, `${shipping.province} ${shipping.zip}`.trim(), shipping.country_code]
    .filter(Boolean)
    .join(", ");

  if (influencer) {
    // Attach: fill blanks, always take the freshly confirmed address, and
    // upgrade a placeholder handle to the real one.
    try {
      const patch: Record<string, string> = { mailing_address: mailingAddress };
      if (!influencer.email && shipping.email) patch.email = shipping.email;
      if (!influencer.phone && shipping.phone) patch.phone = shipping.phone;
      if (handle && PLACEHOLDER_RE.test(String(influencer.instagram_handle || ""))) {
        patch.instagram_handle = handle;
      }
      await db.from("influencers").update(patch).eq("id", influencer.id);
    } catch (err) {
      console.warn("[gift] generic influencer sync failed:", err);
    }
  } else {
    // Create: name + instagram_handle are the only NOT NULL columns without
    // defaults; DB defaults give gifted_no_ask / tier C / prospect.
    const placeholder = `pending-${generateGiftToken().slice(0, 8)}`;
    const { data: created, error: createError } = await db
      .from("influencers")
      .insert({
        name: shipping.name,
        instagram_handle: handle || placeholder,
        email: shipping.email,
        phone: shipping.phone || null,
        mailing_address: mailingAddress,
      } as any)
      .select("id, name, email, phone, instagram_handle")
      .single();
    if (createError || !created) {
      console.error("[gift] generic influencer create failed:", createError);
      return NextResponse.json({ error: "submission_failed" }, { status: 500 });
    }
    influencer = created;
  }

  // --- Upsert the roster row (unique on campaign_id + influencer_id) ---
  let { data: row } = await db
    .from("campaign_influencers")
    .select("id, gift_token, gift_submitted_at, gift_invited_at, shopify_order_id")
    .eq("campaign_id", campaign.id)
    .eq("influencer_id", influencer.id)
    .maybeSingle();

  if (!row) {
    const { data: inserted, error: insertError } = await db
      .from("campaign_influencers")
      .insert({
        campaign_id: campaign.id,
        influencer_id: influencer.id,
        gift_token: generateGiftToken(),
        gift_max_selects_override: outfits,
        gift_invited_at: new Date().toISOString(),
      } as any)
      .select("id, gift_token, gift_submitted_at, gift_invited_at, shopify_order_id")
      .single();
    if (insertError) {
      // 23505: another submit won the pair-unique race — re-read and continue.
      const { data: existing } = await db
        .from("campaign_influencers")
        .select("id, gift_token, gift_submitted_at, gift_invited_at, shopify_order_id")
        .eq("campaign_id", campaign.id)
        .eq("influencer_id", influencer.id)
        .maybeSingle();
      if (!existing) {
        console.error("[gift] generic roster insert failed:", insertError);
        return NextResponse.json({ error: "submission_failed" }, { status: 500 });
      }
      row = existing;
    } else {
      row = inserted;
    }
  }

  if ((row as any).gift_submitted_at || (row as any).shopify_order_id) {
    // Never include existing selections or the personal link here — typing
    // someone's email must not expose their data.
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }

  const rowToken = (row as any).gift_token || generateGiftToken();

  // --- Atomic submission write: only one submit per row ever wins ---
  const { data: updated } = await db
    .from("campaign_influencers")
    .update({
      product_selections: productSelections,
      gift_shipping: shipping,
      gift_submitted_at: new Date().toISOString(),
      gift_token: rowToken,
      gift_max_selects_override: outfits,
      gift_invited_at: (row as any).gift_invited_at || new Date().toISOString(),
    })
    .eq("id", (row as any).id)
    .is("gift_submitted_at", null)
    .select("id");
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: "already_submitted" }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    personal_url: giftUrl(rowToken),
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

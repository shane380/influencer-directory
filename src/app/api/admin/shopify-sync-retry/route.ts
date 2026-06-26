import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createShopifyDiscountCode } from "@/lib/shopify-affiliate";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { creator_id } = body;

  if (!creator_id) {
    return NextResponse.json({ error: "creator_id required" }, { status: 400 });
  }

  const { data: creator } = await (supabase.from as any)("creators")
    .select("id, invite_id, creator_name, affiliate_code")
    .eq("id", creator_id)
    .single();

  if (!creator || !creator.invite_id) {
    return NextResponse.json({ error: "Creator or invite not found" }, { status: 404 });
  }

  const { data: invite } = await (supabase.from as any)("creator_invites")
    .select("has_affiliate, shopify_code_status")
    .eq("id", creator.invite_id)
    .single();

  if (!invite?.has_affiliate) {
    return NextResponse.json({ error: "Invite does not include affiliate" }, { status: 400 });
  }

  if (invite.shopify_code_status === "active") {
    return NextResponse.json({ error: "Shopify code already active" }, { status: 400 });
  }

  const result = await createShopifyDiscountCode(
    creator.affiliate_code,
    creator.creator_name,
    creator.invite_id
  );

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    price_rule_id: result.priceRuleId,
    discount_code_id: result.discountCodeId,
  });
}

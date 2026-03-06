import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET — fetch pending code change requests (with optional ?influencer_id= filter)
// Also supports ?count_only=true for sidebar badge
export async function GET(request: NextRequest) {
  const influencerId = request.nextUrl.searchParams.get("influencer_id");
  const countOnly = request.nextUrl.searchParams.get("count_only");

  let query = (supabase.from as any)("creator_code_change_requests")
    .select("*, influencer:influencers!creator_code_change_requests_influencer_id_fkey(id, name, instagram_handle)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (influencerId) {
    query = query.eq("influencer_id", influencerId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (countOnly === "true") {
    return NextResponse.json({ count: (data || []).length });
  }

  return NextResponse.json({ requests: data || [] });
}

// PATCH — approve or reject a request
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, action, admin_notes, reviewed_by } = body;

  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  // Get the request
  const { data: req } = await (supabase.from as any)("creator_code_change_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (!req) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (req.status !== "pending") {
    return NextResponse.json({ error: "Request already processed" }, { status: 400 });
  }

  if (action === "reject") {
    if (!admin_notes) {
      return NextResponse.json({ error: "Rejection reason required" }, { status: 400 });
    }

    await (supabase.from as any)("creator_code_change_requests")
      .update({
        status: "rejected",
        admin_notes,
        reviewed_by: reviewed_by || "Admin",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ success: true, status: "rejected" });
  }

  if (action === "approve") {
    const newCode = req.requested_code;

    // Get invite to find Shopify IDs
    const { data: creator } = await (supabase.from as any)("creators")
      .select("id, invite_id")
      .eq("id", req.creator_id)
      .single();

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    const { data: invite } = await (supabase.from as any)("creator_invites")
      .select("shopify_price_rule_id, shopify_discount_code_id")
      .eq("id", creator.invite_id)
      .single();

    const storeUrl = getShopifyStoreUrl();
    const accessToken = await getShopifyAccessToken();

    let newDiscountCodeId: string | null = null;
    let shopifyError: string | null = null;

    if (storeUrl && accessToken && invite?.shopify_price_rule_id) {
      try {
        // Create new discount code under existing price rule
        const createRes = await fetch(
          `https://${storeUrl}/admin/api/2024-01/price_rules/${invite.shopify_price_rule_id}/discount_codes.json`,
          {
            method: "POST",
            headers: {
              "X-Shopify-Access-Token": accessToken,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ discount_code: { code: newCode } }),
          }
        );

        if (createRes.ok) {
          const createData = await createRes.json();
          newDiscountCodeId = String(createData.discount_code.id);

          // Delete old discount code
          if (invite.shopify_discount_code_id) {
            await fetch(
              `https://${storeUrl}/admin/api/2024-01/price_rules/${invite.shopify_price_rule_id}/discount_codes/${invite.shopify_discount_code_id}.json`,
              {
                method: "DELETE",
                headers: { "X-Shopify-Access-Token": accessToken },
              }
            );
          }
        } else {
          const errText = await createRes.text();
          shopifyError = `Shopify error: ${errText}`;
          console.error("Failed to create new Shopify discount code:", errText);
        }
      } catch (err: any) {
        shopifyError = err.message;
        console.error("Shopify API error:", err);
      }
    }

    if (shopifyError && !newDiscountCodeId) {
      return NextResponse.json({ error: `Approval failed: ${shopifyError}` }, { status: 500 });
    }

    // Update creator_invites
    const inviteUpdate: any = {};
    if (newDiscountCodeId) {
      inviteUpdate.shopify_discount_code_id = newDiscountCodeId;
    }
    if (Object.keys(inviteUpdate).length > 0) {
      await (supabase.from as any)("creator_invites")
        .update(inviteUpdate)
        .eq("id", creator.invite_id);
    }

    // Update creators table
    await (supabase.from as any)("creators")
      .update({ affiliate_code: newCode.toLowerCase() })
      .eq("id", req.creator_id);

    // Mark request as approved
    await (supabase.from as any)("creator_code_change_requests")
      .update({
        status: "approved",
        reviewed_by: reviewed_by || "Admin",
        reviewed_at: new Date().toISOString(),
        admin_notes: admin_notes || null,
      })
      .eq("id", id);

    return NextResponse.json({ success: true, status: "approved", new_code: newCode });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

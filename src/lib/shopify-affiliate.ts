import { createClient } from "@supabase/supabase-js";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

export const AFFILIATE_DISCOUNT_PERCENT = 25;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type SyncResult =
  | { ok: true; priceRuleId: string; discountCodeId: string }
  | { ok: false; error: string };

export async function createShopifyDiscountCode(
  affiliateCode: string,
  creatorName: string,
  inviteId: string
): Promise<SyncResult> {
  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();

  if (!storeUrl || !accessToken) {
    await supabase
      .from("creator_invites")
      .update({ shopify_code_status: "failed" })
      .eq("id", inviteId);
    return { ok: false, error: "Shopify credentials not configured" };
  }

  try {
    // Idempotent: if the code already exists in Shopify (e.g. created earlier,
    // or via a legacy/GoAffPro setup), adopt it instead of creating a duplicate.
    // Creating would 422 on the code and leave an orphan price rule behind.
    const lookupRes = await fetch(
      `https://${storeUrl}/admin/api/2024-01/discount_codes/lookup.json?code=${encodeURIComponent(
        affiliateCode.toUpperCase(),
      )}`,
      { method: "GET", headers: { "X-Shopify-Access-Token": accessToken }, redirect: "manual" },
    );
    if (lookupRes.status === 303 || lookupRes.status === 302) {
      const loc = lookupRes.headers.get("location") || "";
      const m = loc.match(/price_rules\/(\d+)\/discount_codes\/(\d+)/);
      if (m) {
        const [, existingPriceRuleId, existingDiscountCodeId] = m;
        await supabase
          .from("creator_invites")
          .update({
            shopify_price_rule_id: existingPriceRuleId,
            shopify_discount_code_id: existingDiscountCodeId,
            shopify_code_status: "active",
          })
          .eq("id", inviteId);
        console.log(
          `Adopted existing Shopify discount code ${affiliateCode.toUpperCase()} (price_rule=${existingPriceRuleId}, discount_code=${existingDiscountCodeId})`,
        );
        return { ok: true, priceRuleId: existingPriceRuleId, discountCodeId: existingDiscountCodeId };
      }
    }

    const priceRuleRes = await fetch(
      `https://${storeUrl}/admin/api/2024-01/price_rules.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          price_rule: {
            title: `${affiliateCode.toUpperCase()} — ${creatorName}`,
            target_type: "line_item",
            target_selection: "all",
            allocation_method: "across",
            value_type: "percentage",
            value: `-${AFFILIATE_DISCOUNT_PERCENT}.0`,
            customer_selection: "all",
            starts_at: new Date().toISOString(),
            once_per_customer: false,
          },
        }),
      }
    );

    if (!priceRuleRes.ok) {
      const errBody = await priceRuleRes.text();
      console.error(`Shopify price rule creation failed for ${affiliateCode}:`, errBody);
      await supabase
        .from("creator_invites")
        .update({ shopify_code_status: "failed" })
        .eq("id", inviteId);
      return { ok: false, error: `Price rule creation failed: ${errBody}` };
    }

    const priceRuleData = await priceRuleRes.json();
    const priceRuleId = String(priceRuleData.price_rule.id);

    const discountRes = await fetch(
      `https://${storeUrl}/admin/api/2024-01/price_rules/${priceRuleId}/discount_codes.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          discount_code: { code: affiliateCode.toUpperCase() },
        }),
      }
    );

    if (!discountRes.ok) {
      const errBody = await discountRes.text();
      console.error(`Shopify discount code creation failed for ${affiliateCode}:`, errBody);
      await supabase
        .from("creator_invites")
        .update({
          shopify_price_rule_id: priceRuleId,
          shopify_code_status: "failed",
        })
        .eq("id", inviteId);
      return { ok: false, error: `Discount code creation failed: ${errBody}` };
    }

    const discountData = await discountRes.json();
    const discountCodeId = String(discountData.discount_code.id);

    await supabase
      .from("creator_invites")
      .update({
        shopify_price_rule_id: priceRuleId,
        shopify_discount_code_id: discountCodeId,
        shopify_code_status: "active",
      })
      .eq("id", inviteId);

    console.log(
      `Shopify discount code created: ${affiliateCode.toUpperCase()} (price_rule=${priceRuleId}, discount_code=${discountCodeId})`
    );
    return { ok: true, priceRuleId, discountCodeId };
  } catch (err: any) {
    console.error(`Shopify discount code creation error for ${affiliateCode}:`, err);
    await supabase
      .from("creator_invites")
      .update({ shopify_code_status: "failed" })
      .eq("id", inviteId);
    return { ok: false, error: err?.message || "Unknown error" };
  }
}

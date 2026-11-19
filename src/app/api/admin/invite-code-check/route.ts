import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";
import { normalizeAffiliateCode } from "@/lib/affiliate-code";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type CodeCheckResult = {
  code: string;
  valid: boolean;
  /** Why the code can't be used, or null when it can. */
  conflict: "format" | "creator" | "legacy" | "invite" | null;
  /** Set when the code already exists in Shopify; signup will adopt it. */
  shopify: { title: string; percent: number | null; priceRuleId: string } | null;
};

// GET ?code=ARIA15&invite_id=<optional, excluded from the pending-invite check>
//
// Pre-flight for the optional code field on the invite form. Blocks codes that
// already belong to someone (an app creator, a legacy affiliate, or another
// pending invite) and surfaces, without blocking, a code that already exists
// in Shopify so the admin can tell a pre-made partner code from a sitewide
// promo before linking it.
export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("code") || "";
  const excludeInviteId = request.nextUrl.searchParams.get("invite_id");
  const code = normalizeAffiliateCode(raw);

  const result: CodeCheckResult = { code, valid: false, conflict: null, shopify: null };

  if (!code) {
    result.conflict = "format";
    return NextResponse.json(result);
  }

  const [{ data: creatorHit }, { data: legacyHit }] = await Promise.all([
    supabase.from("creators").select("id").ilike("affiliate_code", code).limit(1),
    (supabase.from as any)("legacy_affiliates").select("id").ilike("discount_code", code).limit(1),
  ]);

  if (creatorHit && creatorHit.length > 0) {
    result.conflict = "creator";
    return NextResponse.json(result);
  }
  if (legacyHit && legacyHit.length > 0) {
    result.conflict = "legacy";
    return NextResponse.json(result);
  }

  let inviteQuery = (supabase.from as any)("creator_invites")
    .select("id")
    .ilike("requested_affiliate_code", code)
    .in("status", ["pending", "accepted"])
    .limit(1);
  if (excludeInviteId) inviteQuery = inviteQuery.neq("id", excludeInviteId);
  const { data: inviteHit, error: inviteError } = await inviteQuery;
  if (inviteError) {
    // Most likely the requested_affiliate_code migration hasn't been applied.
    console.error("invite-code-check: invite lookup failed", inviteError.message);
    return NextResponse.json({ error: "Code check unavailable" }, { status: 500 });
  }
  if (inviteHit && inviteHit.length > 0) {
    result.conflict = "invite";
    return NextResponse.json(result);
  }

  result.valid = true;

  // Shopify lookup is advisory only — a failure here must not block the form.
  try {
    const storeUrl = getShopifyStoreUrl();
    const accessToken = await getShopifyAccessToken();
    if (storeUrl && accessToken) {
      const lookupRes = await fetch(
        `https://${storeUrl}/admin/api/2024-01/discount_codes/lookup.json?code=${encodeURIComponent(code.toUpperCase())}`,
        { method: "GET", headers: { "X-Shopify-Access-Token": accessToken }, redirect: "manual" }
      );
      if (lookupRes.status === 303 || lookupRes.status === 302) {
        const m = (lookupRes.headers.get("location") || "").match(/price_rules\/(\d+)\/discount_codes\/(\d+)/);
        if (m) {
          const priceRuleId = m[1];
          const ruleRes = await fetch(
            `https://${storeUrl}/admin/api/2024-01/price_rules/${priceRuleId}.json`,
            { headers: { "X-Shopify-Access-Token": accessToken } }
          );
          const rule = ruleRes.ok ? (await ruleRes.json()).price_rule : null;
          const percent =
            rule?.value_type === "percentage" && rule?.value != null
              ? Math.abs(Number(rule.value))
              : null;
          result.shopify = { title: rule?.title || code.toUpperCase(), percent, priceRuleId };
        }
      }
    }
  } catch (err) {
    console.error("invite-code-check: Shopify lookup failed", err);
  }

  return NextResponse.json(result);
}

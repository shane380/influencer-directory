/**
 * Updates every active affiliate price rule in Shopify to AFFILIATE_DISCOUNT_PERCENT (25%).
 *
 * Historical bug: signup/route.ts set the Shopify discount value to the creator's
 * commission_rate (e.g. 10%) instead of the customer-facing discount (25%).
 * This script fixes all existing active price rules to -25%.
 *
 * Usage:
 *   npx tsx scripts/backfill-affiliate-discount-percent.ts           # dry-run (default)
 *   npx tsx scripts/backfill-affiliate-discount-percent.ts --apply   # actually PUT to Shopify
 */

import { createClient } from "@supabase/supabase-js";
import { AFFILIATE_DISCOUNT_PERCENT } from "../src/lib/shopify-affiliate";

const APPLY = process.argv.includes("--apply");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const STORE_URL = process.env.SHOPIFY_STORE_URL;

async function getAccessToken(): Promise<string | null> {
  if (process.env.SHOPIFY_ACCESS_TOKEN && process.env.SHOPIFY_ACCESS_TOKEN !== "shpat_xxxxx") {
    return process.env.SHOPIFY_ACCESS_TOKEN;
  }
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "shopify_access_token")
    .single();
  if (error || !data) return null;
  return (data as any).value;
}

async function main() {
  const ACCESS_TOKEN = await getAccessToken();
  if (!STORE_URL || !ACCESS_TOKEN) {
    console.error("Missing SHOPIFY_STORE_URL env var or shopify_access_token in app_settings");
    process.exit(1);
  }

  const { data: invites, error } = await (supabase.from as any)("creator_invites")
    .select("id, creator_name, shopify_price_rule_id, shopify_discount_code_id")
    .eq("shopify_code_status", "active")
    .not("shopify_price_rule_id", "is", null);

  if (error) {
    console.error("Supabase query failed:", error.message);
    process.exit(1);
  }

  console.log(
    `${APPLY ? "APPLYING" : "DRY-RUN"}: Found ${invites.length} active price rules to set to -${AFFILIATE_DISCOUNT_PERCENT}.0%\n`
  );

  for (const inv of invites) {
    const url = `https://${STORE_URL}/admin/api/2024-01/price_rules/${inv.shopify_price_rule_id}.json`;

    if (!APPLY) {
      console.log(`  [dry-run] ${inv.creator_name.padEnd(30)} price_rule=${inv.shopify_price_rule_id}`);
      continue;
    }

    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          price_rule: {
            id: Number(inv.shopify_price_rule_id),
            value: `-${AFFILIATE_DISCOUNT_PERCENT}.0`,
          },
        }),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.log(`  FAIL ${inv.creator_name.padEnd(30)} ${res.status}: ${errBody}`);
        continue;
      }

      const data = await res.json();
      console.log(
        `  OK   ${inv.creator_name.padEnd(30)} price_rule=${inv.shopify_price_rule_id} value=${data.price_rule.value}`
      );
    } catch (err: any) {
      console.log(`  ERR  ${inv.creator_name.padEnd(30)} ${err.message}`);
    }

    // Be gentle on Shopify API rate limits
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(
    `\n${APPLY ? "Done." : "Dry-run complete. Re-run with --apply to execute."}`
  );
}

main();

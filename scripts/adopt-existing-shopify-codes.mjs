// One-off: for creator_invites marked shopify_code_status="failed" whose code
// already exists in Shopify, adopt the existing price_rule_id + discount_code_id
// and mark the invite active. Dry-run by default; pass --apply to write.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const APPLY = process.argv.includes("--apply");
let token = process.env.SHOPIFY_ACCESS_TOKEN;
if (!token || token === "shpat_xxxxx") {
  const { data } = await db.from("app_settings").select("value").eq("key", "shopify_access_token").single();
  token = data?.value;
}
const store = process.env.SHOPIFY_STORE_URL;

const { data: failed } = await db
  .from("creator_invites")
  .select("id")
  .eq("shopify_code_status", "failed");
const ids = (failed || []).map((f) => f.id);
const { data: creators } = await db
  .from("creators")
  .select("creator_name, affiliate_code, invite_id")
  .in("invite_id", ids);

for (const c of creators || []) {
  const code = String(c.affiliate_code || "").toUpperCase();
  const r = await fetch(`https://${store}/admin/api/2024-01/discount_codes/lookup.json?code=${encodeURIComponent(code)}`, {
    headers: { "X-Shopify-Access-Token": token }, redirect: "manual",
  });
  if (r.status !== 303) { console.log(`${c.creator_name} (${code}): not found in Shopify (HTTP ${r.status}) — needs real creation, skipping`); continue; }
  const m = (r.headers.get("location") || "").match(/price_rules\/(\d+)\/discount_codes\/(\d+)/);
  if (!m) { console.log(`${c.creator_name} (${code}): could not parse IDs — skipping`); continue; }
  const [, priceRuleId, discountCodeId] = m;
  if (!APPLY) {
    console.log(`WOULD ADOPT ${c.creator_name} (${code}) -> price_rule=${priceRuleId} discount_code=${discountCodeId}`);
    continue;
  }
  const { error } = await db
    .from("creator_invites")
    .update({ shopify_price_rule_id: priceRuleId, shopify_discount_code_id: discountCodeId, shopify_code_status: "active" })
    .eq("id", c.invite_id);
  console.log(error ? `FAIL ${code}: ${error.message}` : `ADOPTED ${c.creator_name} (${code}) -> active`);
}
console.log(APPLY ? "\nDone." : "\nDry run. Re-run with --apply to write.");

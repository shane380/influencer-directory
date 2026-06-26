import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const storeUrl = process.env.SHOPIFY_STORE_URL;
let token = process.env.SHOPIFY_ACCESS_TOKEN;
if (!token || token === "shpat_xxxxx") {
  const { data } = await db.from("app_settings").select("value").eq("key", "shopify_access_token").single();
  token = data?.value;
}
const H = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

// All orders via GraphQL searching her name + email broadly (any customer record).
const q = `{
  orders(first: 50, query: "Molly Dalton OR mollydalton512@gmail.com", sortKey: CREATED_AT, reverse: true) {
    edges { node { name createdAt displayFulfillmentStatus tags
      totalPriceSet { shopMoney { amount } }
      customer { id displayName email } } }
  }
}`;
const res = await fetch(`https://${storeUrl}/admin/api/2024-01/graphql.json`, {
  method: "POST", headers: H, body: JSON.stringify({ query: q }),
});
const j = await res.json();
const nodes = j.data?.orders?.edges?.map((e) => e.node) || [];
console.log(`Broad search returned ${nodes.length} orders:`);
for (const n of nodes) {
  console.log(`  ${n.createdAt.slice(0,10)} | ${n.name} | $${n.totalPriceSet.shopMoney.amount} | tags=[${n.tags}] | cust=${n.customer?.id?.split("/").pop()} (${n.customer?.email})`);
}

// Distinct tags seen on her $0 orders — tells us what tag(s) reliably mark gifts.
const giftTags = new Set();
for (const n of nodes) if (Number(n.totalPriceSet.shopMoney.amount) === 0) n.tags.forEach((t) => giftTags.add(t));
console.log(`\nTags seen on her $0 orders:`, [...giftTags]);

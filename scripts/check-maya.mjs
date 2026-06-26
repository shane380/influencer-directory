import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const storeUrl = process.env.SHOPIFY_STORE_URL;
let token = process.env.SHOPIFY_ACCESS_TOKEN;
if (!token || token === "shpat_xxxxx") { const { data } = await db.from("app_settings").select("value").eq("key", "shopify_access_token").single(); token = data?.value; }
const H = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

// Our influencer record(s).
const { data: infs } = await db.from("influencers").select("id, name, instagram_handle, email, shopify_customer_id, partnership_type").or("name.ilike.%maya pei%,name.ilike.%maya dunn%,instagram_handle.eq.mayadunn");
console.log("Our influencer record(s):", JSON.stringify(infs, null, 2));

for (const inf of infs || []) {
  const { data: go } = await db.from("gift_orders").select("order_number, order_date, order_status, shopify_customer_id").eq("influencer_id", inf.id).order("order_date", { ascending: false });
  console.log(`\ngift_orders for ${inf.name}: ${go?.length || 0}`);
  for (const r of go || []) console.log(`  ${r.order_number} | ${r.order_date} | ${r.order_status} | cust=${r.shopify_customer_id}`);
}

// All Shopify orders matching "Maya Dunn" — show their customer id + email + tags.
const q = `{ orders(first: 25, query: "Maya Dunn", sortKey: CREATED_AT, reverse: true) {
  edges { node { name createdAt tags totalPriceSet{shopMoney{amount}} customer { id email displayName } } } } }`;
const res = await fetch(`https://${storeUrl}/admin/api/2024-01/graphql.json`, { method: "POST", headers: H, body: JSON.stringify({ query: q }) });
const j = await res.json();
console.log(`\nShopify orders matching "Maya Dunn":`);
for (const e of j.data?.orders?.edges || []) {
  const n = e.node;
  console.log(`  ${n.createdAt.slice(0,10)} | ${n.name} | $${n.totalPriceSet.shopMoney.amount} | tags=[${n.tags}] | cust=${n.customer?.id?.split("/").pop()} (${n.customer?.email})`);
}

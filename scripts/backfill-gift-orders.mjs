import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const storeUrl = process.env.SHOPIFY_STORE_URL;
let accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
if (!accessToken || accessToken === "shpat_xxxxx") {
  const { data } = await db.from("app_settings").select("value").eq("key", "shopify_access_token").single();
  accessToken = data?.value;
}
if (!storeUrl || !accessToken) {
  console.error("Shopify not configured (need SHOPIFY_STORE_URL + token)");
  process.exit(1);
}

const numericId = (gid) => (gid ? String(gid).split("/").pop() : null);

// Map customer id -> influencer id.
const { data: influencers } = await db
  .from("influencers")
  .select("id, shopify_customer_id")
  .not("shopify_customer_id", "is", null);
const customerToInfluencer = new Map();
for (const inf of influencers || []) {
  for (const cid of String(inf.shopify_customer_id || "").split(",")) {
    const t = cid.trim();
    if (t) customerToInfluencer.set(t, inf.id);
  }
}
console.log(`Loaded ${customerToInfluencer.size} customer->influencer mappings`);

const QUERY = `
  query GiftOrders($cursor: String, $query: String!) {
    orders(first: 50, after: $cursor, query: $query, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id name createdAt cancelledAt tags
        totalPriceSet { shopMoney { amount } }
        customer { id }
        lineItems(first: 50) { edges { node { title quantity sku variantTitle } } }
      } }
    }
  }`;

const endpoint = `https://${storeUrl}/admin/api/2024-01/graphql.json`;
const searchQuery = `tag:influencer created_at:>=2024-01-01`;
const rows = [];
let cursor = null;
let hasNext = true;
let matched = 0;
let unmatched = 0;
const nowISO = new Date().toISOString();

while (hasNext) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { cursor, query: searchQuery } }),
  });
  if (!res.ok) {
    console.error("GraphQL HTTP error", res.status, await res.text());
    process.exit(1);
  }
  const json = await res.json();
  if (json.errors) {
    console.error("GraphQL errors", JSON.stringify(json.errors));
    process.exit(1);
  }
  const conn = json.data?.orders;
  for (const edge of conn?.edges || []) {
    const n = edge.node;
    if (n.cancelledAt) continue;
    const customerId = numericId(n.customer?.id);
    const influencerId = customerId ? customerToInfluencer.get(customerId) || null : null;
    if (influencerId) matched++; else unmatched++;
    const total = parseFloat(n.totalPriceSet?.shopMoney?.amount || "0");
    rows.push({
      shopify_order_id: numericId(n.id),
      shopify_customer_id: customerId,
      influencer_id: influencerId,
      order_number: n.name || "",
      order_date: n.createdAt,
      total_amount: total,
      is_gift: total === 0,
      line_items: (n.lineItems?.edges || []).map((li) => ({
        product_name: li.node.title,
        variant_title: li.node.variantTitle || null,
        sku: li.node.sku || "",
        quantity: li.node.quantity,
      })),
      tags: Array.isArray(n.tags) ? n.tags.join(", ") : String(n.tags || ""),
      synced_at: nowISO,
    });
  }
  hasNext = !!conn?.pageInfo?.hasNextPage;
  cursor = conn?.pageInfo?.endCursor || null;
  process.stdout.write(`\rFetched ${rows.length} tagged orders...`);
}
console.log(`\nDone fetching. ${rows.length} orders (matched ${matched}, unmatched ${unmatched}).`);

let upserted = 0;
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500);
  const { error } = await db.from("gift_orders").upsert(chunk, { onConflict: "shopify_order_id" });
  if (error) { console.error("upsert error", error); process.exit(1); }
  upserted += chunk.length;
}
console.log(`Upserted ${upserted} rows into gift_orders.`);

// Quick monthly breakdown of gifts.
const byMonth = {};
for (const r of rows) {
  if (!r.is_gift) continue;
  const m = r.order_date.slice(0, 7);
  byMonth[m] = (byMonth[m] || 0) + 1;
}
console.log("\nGifts ($0 tagged orders) per month:");
for (const m of Object.keys(byMonth).sort()) console.log(`  ${m}: ${byMonth[m]}`);

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

const CUSTOMER_ID = "8909406634287";

// 1) Customer record + email.
const custRes = await fetch(`https://${storeUrl}/admin/api/2024-01/customers/${CUSTOMER_ID}.json`, { headers: H });
const cust = (await custRes.json()).customer;
console.log(`Customer: ${cust?.first_name} ${cust?.last_name} | ${cust?.email} | orders_count=${cust?.orders_count}`);

// 2) Orders by customer_id (REST, status=any).
const byId = await fetch(
  `https://${storeUrl}/admin/api/2024-01/orders.json?customer_id=${CUSTOMER_ID}&status=any&limit=250&created_at_min=2024-01-01T00:00:00Z`,
  { headers: H },
);
const idOrders = (await byId.json()).orders || [];
console.log(`\nOrders by customer_id: ${idOrders.length}`);
for (const o of idOrders)
  console.log(`  ${o.created_at} | ${o.name} | $${o.total_price} | tags="${o.tags}" | cust=${o.customer?.id}`);

// 3) Orders by email (in case recent orders used a different customer id).
if (cust?.email) {
  const byEmail = await fetch(
    `https://${storeUrl}/admin/api/2024-01/orders.json?email=${encodeURIComponent(cust.email)}&status=any&limit=250&created_at_min=2024-01-01T00:00:00Z`,
    { headers: H },
  );
  const emOrders = (await byEmail.json()).orders || [];
  console.log(`\nOrders by email (${cust.email}): ${emOrders.length}`);
  for (const o of emOrders)
    console.log(`  ${o.created_at} | ${o.name} | $${o.total_price} | tags="${o.tags}" | cust=${o.customer?.id}`);
}

// 4) Search any order whose tags include "molly" or by name search, recent.
const search = await fetch(
  `https://${storeUrl}/admin/api/2024-01/graphql.json`,
  {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      query: `{ orders(first: 25, query: "email:${cust?.email}", sortKey: CREATED_AT, reverse: true) {
        edges { node { name createdAt tags totalPriceSet { shopMoney { amount } } customer { id displayName } } } } }`,
    }),
  },
);
const sj = await search.json();
console.log(`\nGraphQL email search:`, JSON.stringify(sj.data?.orders?.edges?.map((e) => e.node) || sj.errors, null, 2));

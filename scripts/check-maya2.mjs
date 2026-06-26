import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const storeUrl = process.env.SHOPIFY_STORE_URL;
let token = process.env.SHOPIFY_ACCESS_TOKEN;
if (!token || token === "shpat_xxxxx") { const { data } = await db.from("app_settings").select("value").eq("key", "shopify_access_token").single(); token = data?.value; }
const H = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
const get = async (url) => (await fetch(url, { headers: H })).json();

const KNOWN_CUST = "9420194447663";
const EMAIL = "mmpeidunn@gmail.com";

console.log("=== Orders by KNOWN customer_id 9420194447663 ===");
let r = await get(`https://${storeUrl}/admin/api/2024-01/orders.json?customer_id=${KNOWN_CUST}&status=any&limit=250&created_at_min=2024-01-01T00:00:00Z`);
for (const o of r.orders || []) console.log(`  ${o.created_at.slice(0,10)} | ${o.name} | $${o.total_price} | tags=[${o.tags}] | cust=${o.customer?.id} | email=${o.email}`);

console.log("\n=== Orders by email mmpeidunn@gmail.com ===");
r = await get(`https://${storeUrl}/admin/api/2024-01/orders.json?email=${encodeURIComponent(EMAIL)}&status=any&limit=250&created_at_min=2024-01-01T00:00:00Z`);
for (const o of r.orders || []) console.log(`  ${o.created_at.slice(0,10)} | ${o.name} | $${o.total_price} | tags=[${o.tags}] | cust=${o.customer?.id} | email=${o.email}`);

console.log("\n=== Look up each specific order by name ===");
for (const name of ["#171259", "#165518", "#157200"]) {
  r = await get(`https://${storeUrl}/admin/api/2024-01/orders.json?name=${encodeURIComponent(name)}&status=any&limit=10`);
  for (const o of r.orders || [])
    console.log(`  ${o.name} | ${o.created_at.slice(0,10)} | cust=${o.customer?.id} | email=${o.email} | tags=[${o.tags}]`);
  if (!(r.orders || []).length) console.log(`  ${name}: not found via name lookup`);
}

console.log("\n=== Customers named like Maya Dunn / mayadunn / mmpeidunn ===");
for (const term of ["mmpeidunn@gmail.com", "Maya Dunn"]) {
  const cr = await get(`https://${storeUrl}/admin/api/2024-01/customers/search.json?query=${encodeURIComponent(term)}`);
  for (const c of cr.customers || [])
    console.log(`  cust=${c.id} | ${c.first_name} ${c.last_name} | ${c.email} | orders_count=${c.orders_count}`);
  if (!(cr.customers || []).length) console.log(`  "${term}": no customers`);
}

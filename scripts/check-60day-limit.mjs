import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const storeUrl = process.env.SHOPIFY_STORE_URL;
let token = process.env.SHOPIFY_ACCESS_TOKEN;
if (!token || token === "shpat_xxxxx") { const { data } = await db.from("app_settings").select("value").eq("key", "shopify_access_token").single(); token = data?.value; }
const H = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
const get = async (url) => { const r = await fetch(url, { headers: H }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

const now = Date.now();
const daysAgo = (d) => new Date(now - d * 864e5).toISOString();

console.log("Today:", new Date(now).toISOString().slice(0, 10), "| 60d ago:", daysAgo(60).slice(0, 10));

// 1. Recent window (last 30 days) — should return orders if API works at all.
let r = await get(`https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=5&created_at_min=${daysAgo(30)}`);
console.log(`\n[A] Orders in last 30 days: ${r.body.orders?.length ?? "ERR"} (HTTP ${r.status})`);
for (const o of r.body.orders || []) console.log(`   ${o.created_at?.slice(0,10)} ${o.name}`);

// 2. Old window (90-120 days ago) — the real test. If 0 store-wide, 60-day cap is real.
r = await get(`https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=5&created_at_min=${daysAgo(120)}&created_at_max=${daysAgo(90)}`);
console.log(`\n[B] Orders 90-120 days ago: ${r.body.orders?.length ?? "ERR"} (HTTP ${r.status})`);
for (const o of r.body.orders || []) console.log(`   ${o.created_at?.slice(0,10)} ${o.name}`);

// 3. Direct GET of a KNOWN old order by id (one we already have stored, dated >60d ago).
const { data: oldRows } = await db.from("gift_orders").select("shopify_order_id, order_number, order_date").lt("order_date", daysAgo(70)).order("order_date", { ascending: false }).limit(3);
console.log(`\n[C] Direct GET of known old orders (>70 days old, already in our DB):`);
for (const row of oldRows || []) {
  const res = await get(`https://${storeUrl}/admin/api/2024-01/orders/${row.shopify_order_id}.json`);
  console.log(`   ${row.order_number} (${String(row.order_date).slice(0,10)}) -> HTTP ${res.status} ${res.body.order ? "RETURNED" : "(not returned: " + JSON.stringify(res.body).slice(0,80) + ")"}`);
}

// 4. Count total orders accessible store-wide (paginate count via count endpoint).
r = await get(`https://${storeUrl}/admin/api/2024-01/orders/count.json?status=any`);
console.log(`\n[D] orders/count.json (status=any): ${JSON.stringify(r.body)} (HTTP ${r.status})`);

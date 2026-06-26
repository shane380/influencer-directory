// Recipient-based backfill: pull each influencer's Shopify orders by customer id
// (+ email fallback) and upsert $0 ones as gifts into gift_orders. Mirrors
// src/lib/sync-gift-orders.ts so the data matches what the nightly cron produces.
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
const API = "2024-01";
const FIELDS = "id,name,created_at,cancelled_at,total_price,tags,customer,line_items,fulfillment_status,fulfillments";
const deriveStatus = (o) => {
  const ff = o.fulfillments || [];
  if (ff.some((f) => f.shipment_status === "delivered")) return "delivered";
  if (o.fulfillment_status === "fulfilled" || ff.length > 0) return "shipped";
  return "placed";
};
const SINCE = "2024-01-01T00:00:00Z";
const base = `https://${storeUrl}/admin/api/${API}/orders.json`;
const common = `status=any&limit=250&fields=${FIELDS}&created_at_min=${encodeURIComponent(SINCE)}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextUrl = (h) => { const m = h && h.match(/<([^>]+)>;\s*rel="next"/); return m ? m[1] : null; };
async function shopFetch(url, attempt = 0) {
  try {
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" } });
    if (res.status === 429 && attempt < 8) { await sleep((Number(res.headers.get("Retry-After") || "2")) * 1000); return shopFetch(url, attempt + 1); }
    return res;
  } catch (e) {
    if (attempt < 8) { await sleep(2000); return shopFetch(url, attempt + 1); }
    throw e;
  }
}
async function fetchAll(url) {
  const out = []; let u = url;
  while (u) { const res = await shopFetch(u); if (!res.ok) break; const d = await res.json(); out.push(...(d.orders || [])); u = nextUrl(res.headers.get("Link")); }
  return out;
}

const { data: influencers } = await db
  .from("influencers").select("id, shopify_customer_id, email").not("shopify_customer_id", "is", null);

const rowsById = new Map();
const nowISO = new Date().toISOString();
let processed = 0;
for (const inf of influencers || []) {
  processed++;
  const cids = String(inf.shopify_customer_id || "").split(",").map((s) => s.trim()).filter(Boolean);
  const collected = [];
  for (const cid of cids) { collected.push(...(await fetchAll(`${base}?customer_id=${cid}&${common}`))); await sleep(120); }
  if (collected.length === 0 && inf.email) { collected.push(...(await fetchAll(`${base}?email=${encodeURIComponent(inf.email)}&${common}`))); await sleep(120); }
  for (const o of collected) {
    if (o.cancelled_at) continue;
    const total = parseFloat(o.total_price);
    rowsById.set(String(o.id), {
      shopify_order_id: String(o.id),
      shopify_customer_id: o.customer?.id ? String(o.customer.id) : null,
      influencer_id: inf.id,
      order_number: o.name || "",
      order_date: o.created_at,
      total_amount: total,
      is_gift: total === 0,
      line_items: (o.line_items || []).map((li) => ({ product_name: li.title, variant_title: li.variant_title || null, sku: li.sku || "", quantity: li.quantity })),
      tags: o.tags || "",
      order_status: deriveStatus(o),
      fulfillment_status: o.fulfillment_status || null,
      delivery_status: o.fulfillments?.[0]?.shipment_status || null,
      tracking_url: o.fulfillments?.[0]?.tracking_url || null,
      tracking_number: o.fulfillments?.[0]?.tracking_number || null,
      synced_at: nowISO,
    });
  }
  if (processed % 25 === 0) process.stdout.write(`\r${processed}/${(influencers || []).length} influencers, ${rowsById.size} orders...`);
}
const rows = [...rowsById.values()];
console.log(`\nProcessed ${processed} influencers. ${rows.length} orders, ${rows.filter((r) => r.is_gift).length} gifts.`);

let up = 0;
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db.from("gift_orders").upsert(rows.slice(i, i + 500), { onConflict: "shopify_order_id" });
  if (error) { console.error(error); process.exit(1); }
  up += Math.min(500, rows.length - i);
}
console.log(`Upserted ${up} rows.`);

const { data: all } = await db.from("gift_orders").select("order_date, is_gift");
const byMonth = {};
for (const r of all || []) { if (!r.is_gift) continue; const m = String(r.order_date).slice(0, 7); byMonth[m] = (byMonth[m] || 0) + 1; }
console.log("\ngift_orders — gifts ($0) per month:");
for (const m of Object.keys(byMonth).sort()) console.log(`  ${m}: ${byMonth[m]}`);

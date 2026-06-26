// Backfill the influencer_orders cache (powers the profile Orders tab) the same
// way we did gift_orders — pull each influencer's full Shopify history by
// customer id (read_all_orders is now granted) and upsert.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const storeUrl = process.env.SHOPIFY_STORE_URL;
let token = process.env.SHOPIFY_ACCESS_TOKEN;
if (!token || token === "shpat_xxxxx") { const { data } = await db.from("app_settings").select("value").eq("key", "shopify_access_token").single(); token = data?.value; }

const FIELDS = "id,name,created_at,cancelled_at,total_price,customer,line_items";
const SINCE = "2024-01-01T00:00:00Z";
const base = `https://${storeUrl}/admin/api/2024-01/orders.json`;
const common = `status=any&limit=250&fields=${FIELDS}&created_at_min=${encodeURIComponent(SINCE)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextUrl = (h) => { const m = h && h.match(/<([^>]+)>;\s*rel="next"/); return m ? m[1] : null; };
async function shopFetch(url, a = 0) {
  try {
    const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" } });
    if (res.status === 429 && a < 8) { await sleep((Number(res.headers.get("Retry-After") || "2")) * 1000); return shopFetch(url, a + 1); }
    return res;
  } catch (e) {
    if (a < 8) { await sleep(2000); return shopFetch(url, a + 1); } // retry transient network errors
    throw e;
  }
}
async function fetchAll(url) { const out = []; let u = url; while (u) { const res = await shopFetch(u); if (!res.ok) break; const d = await res.json(); out.push(...(d.orders || [])); u = nextUrl(res.headers.get("Link")); } return out; }

const { data: influencers } = await db.from("influencers").select("id, shopify_customer_id, email").not("shopify_customer_id", "is", null);
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
      influencer_id: inf.id,
      shopify_order_id: String(o.id),
      shopify_customer_id: o.customer?.id ? String(o.customer.id) : cids[0],
      order_number: o.name || "",
      order_date: o.created_at,
      total_amount: total,
      is_gift: total === 0,
      line_items: (o.line_items || []).map((li) => ({ product_name: li.title, variant_title: li.variant_title || null, sku: li.sku || "", quantity: li.quantity })),
      synced_at: nowISO,
    });
  }
  if (processed % 25 === 0) process.stdout.write(`\r${processed}/${(influencers || []).length}, ${rowsById.size} orders...`);
}
const rows = [...rowsById.values()];
console.log(`\nProcessed ${processed} influencers. ${rows.length} orders.`);
let up = 0;
for (let i = 0; i < rows.length; i += 500) {
  const { error } = await db.from("influencer_orders").upsert(rows.slice(i, i + 500), { onConflict: "shopify_order_id" });
  if (error) { console.error(error); process.exit(1); }
  up += Math.min(500, rows.length - i);
}
console.log(`Upserted ${up} rows into influencer_orders.`);
const { data: maya } = await db.from("influencer_orders").select("order_number, order_date").eq("influencer_id", "30f90587-4083-46d9-89e4-7a0e95d7bd99").order("order_date", { ascending: false });
console.log("Maya influencer_orders now:", (maya || []).map((r) => `${r.order_number} (${String(r.order_date).slice(0,10)})`).join(", "));

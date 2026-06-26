// One-time: seed gift_orders with historical rows from influencer_orders.
// The "influencer" Shopify tag was only added recently, so tag-based sync misses
// pre-April gifts. influencer_orders (per-influencer synced) holds that history.
// Insert with ignoreDuplicates so tag-sourced rows (already present) win on overlap.
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

const { data: orders, error } = await db
  .from("influencer_orders")
  .select("influencer_id, shopify_order_id, shopify_customer_id, order_number, order_date, total_amount, is_gift, line_items");
if (error) { console.error(error); process.exit(1); }

const nowISO = new Date().toISOString();
const rows = (orders || []).map((o) => ({
  shopify_order_id: String(o.shopify_order_id),
  shopify_customer_id: o.shopify_customer_id ? String(o.shopify_customer_id) : null,
  influencer_id: o.influencer_id,
  order_number: o.order_number || "",
  order_date: o.order_date,
  total_amount: Number(o.total_amount || 0),
  is_gift: !!o.is_gift,
  line_items: o.line_items || [],
  tags: null,
  synced_at: nowISO,
}));

let inserted = 0;
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500);
  const { error: upErr } = await db
    .from("gift_orders")
    .upsert(chunk, { onConflict: "shopify_order_id", ignoreDuplicates: true });
  if (upErr) { console.error("upsert error", upErr); process.exit(1); }
  inserted += chunk.length;
}
console.log(`Seeded ${inserted} influencer_orders rows into gift_orders (existing kept).`);

// Final monthly gift breakdown from gift_orders.
const { data: all } = await db.from("gift_orders").select("order_date, is_gift");
const byMonth = {};
for (const r of all || []) {
  if (!r.is_gift) continue;
  const mk = String(r.order_date).slice(0, 7);
  byMonth[mk] = (byMonth[mk] || 0) + 1;
}
console.log("\ngift_orders — gifts ($0) per month:");
for (const m of Object.keys(byMonth).sort()) console.log(`  ${m}: ${byMonth[m]}`);

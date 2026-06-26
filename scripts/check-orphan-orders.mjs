// Safety check before dropping influencer_orders: find any orders that exist in
// influencer_orders but NOT in gift_orders (by shopify_order_id). Those would be
// lost if we dropped the table, so they must be migrated first.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function allRows(table, cols) {
  const out = [];
  let from = 0;
  const page = 1000;
  while (true) {
    const { data, error } = await db.from(table).select(cols).range(from, from + page - 1);
    if (error) { console.error(table, error); process.exit(1); }
    out.push(...data);
    if (data.length < page) break;
    from += page;
  }
  return out;
}

const io = await allRows("influencer_orders", "shopify_order_id, influencer_id, order_number, order_date, total_amount");
const go = await allRows("gift_orders", "shopify_order_id");
const goSet = new Set(go.map((r) => String(r.shopify_order_id)));

console.log(`influencer_orders rows: ${io.length}`);
console.log(`gift_orders rows: ${go.length}`);

const orphans = io.filter((r) => !goSet.has(String(r.shopify_order_id)));
console.log(`\nOrders in influencer_orders but MISSING from gift_orders: ${orphans.length}`);
for (const o of orphans.slice(0, 30))
  console.log(`  ${o.order_number} | ${String(o.order_date).slice(0,10)} | $${o.total_amount} | inf=${o.influencer_id} | order_id=${o.shopify_order_id}`);
if (orphans.length > 30) console.log(`  ... and ${orphans.length - 30} more`);

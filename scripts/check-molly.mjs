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

// Find Molly.
const { data: infs } = await db
  .from("influencers")
  .select("id, name, instagram_handle, shopify_customer_id, partnership_type")
  .ilike("name", "%molly dalton%");
console.log("Influencer matches:", JSON.stringify(infs, null, 2));

for (const inf of infs || []) {
  console.log(`\n===== ${inf.name} (${inf.id}) cust=${inf.shopify_customer_id} =====`);

  const { data: go } = await db
    .from("gift_orders")
    .select("order_date, total_amount, is_gift, order_number, tags, shopify_customer_id, influencer_id")
    .eq("influencer_id", inf.id)
    .order("order_date", { ascending: false });
  console.log(`gift_orders rows: ${go?.length || 0}`);
  for (const r of (go || []).slice(0, 10))
    console.log(`  ${r.order_date} | $${r.total_amount} gift=${r.is_gift} | ${r.order_number} | tags="${r.tags}"`);

  const { data: io } = await db
    .from("influencer_orders")
    .select("order_date, total_amount, is_gift, order_number")
    .eq("influencer_id", inf.id)
    .order("order_date", { ascending: false });
  console.log(`influencer_orders rows: ${io?.length || 0}`);
  for (const r of (io || []).slice(0, 10))
    console.log(`  ${r.order_date} | $${r.total_amount} gift=${r.is_gift} | ${r.order_number}`);

  // Any gift_orders by her customer id but NOT linked to her influencer_id?
  if (inf.shopify_customer_id) {
    const cids = String(inf.shopify_customer_id).split(",").map((s) => s.trim()).filter(Boolean);
    const { data: byCust } = await db
      .from("gift_orders")
      .select("order_date, total_amount, order_number, influencer_id, shopify_customer_id")
      .in("shopify_customer_id", cids)
      .order("order_date", { ascending: false });
    console.log(`gift_orders by her customer id(s) ${JSON.stringify(cids)}: ${byCust?.length || 0}`);
    for (const r of (byCust || []).slice(0, 10))
      console.log(`  ${r.order_date} | $${r.total_amount} | ${r.order_number} | inf=${r.influencer_id}`);
  }
}

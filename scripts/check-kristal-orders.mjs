import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
let token = process.env.SHOPIFY_ACCESS_TOKEN;
if (!token || token === "shpat_xxxxx") {
  const { data } = await db.from("app_settings").select("value").eq("key", "shopify_access_token").single();
  token = data?.value;
}
const store = process.env.SHOPIFY_STORE_URL;

const url =
  `https://${store}/admin/api/2024-01/orders.json?status=any&limit=250` +
  `&created_at_min=2026-06-01T00:00:00Z&created_at_max=${new Date().toISOString()}` +
  `&fields=id,name,created_at,subtotal_price,total_price,total_tax,total_shipping_price_set,discount_codes,landing_site,referring_site`;
const res = await fetch(url, { headers: { "X-Shopify-Access-Token": token } });
const { orders } = await res.json();

let sub = 0, tot = 0;
const kris = orders.filter((o) =>
  (o.discount_codes || []).some((d) => d.code?.toUpperCase() === "KRISTAL")
);
console.log(`Orders with KRISTAL coupon in June: ${kris.length}\n`);
for (const o of kris) {
  const ship = o.total_shipping_price_set?.shop_money?.amount ?? "?";
  sub += parseFloat(o.subtotal_price || 0);
  tot += parseFloat(o.total_price || 0);
  console.log(
    `${o.name} ${o.created_at.slice(0, 10)} | subtotal $${o.subtotal_price} | total $${o.total_price} | tax $${o.total_tax} | ship $${ship}`
  );
  console.log(`   landing_site: ${(o.landing_site || "").slice(0, 80)}`);
}
console.log(`\nSUM subtotal_price (what app counts): $${sub.toFixed(2)}`);
console.log(`SUM total_price (incl tax+shipping):  $${tot.toFixed(2)}`);

// Is there any June order whose landing_site shows ?ref=KRISTAL but NO coupon? (link-only)
const linkOnly = orders.filter((o) => {
  const hasCoupon = (o.discount_codes || []).some((d) => d.code?.toUpperCase() === "KRISTAL");
  const fromLink = (o.landing_site || "").toLowerCase().includes("ref=kristal") ||
                   (o.referring_site || "").toLowerCase().includes("kristal");
  return fromLink && !hasCoupon;
});
console.log(`\nJune orders from ?ref=KRISTAL link but WITHOUT the coupon (invisible to app): ${linkOnly.length}`);
for (const o of linkOnly) console.log(`   ${o.name} landing: ${(o.landing_site||"").slice(0,80)}`);

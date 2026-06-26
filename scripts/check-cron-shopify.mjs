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

// resolve token exactly like getShopifyAccessToken()
let token = process.env.SHOPIFY_ACCESS_TOKEN;
if (!token || token === "shpat_xxxxx") {
  const { data } = await db.from("app_settings").select("value").eq("key", "shopify_access_token").single();
  token = data?.value;
}
const storeUrl = process.env.SHOPIFY_STORE_URL;
console.log("storeUrl:", storeUrl, "| token present:", !!token, token ? `(…${token.slice(-4)})` : "");

// Replicate listBulkAffiliateOrdersGrossByDay window the cron used: today-400d .. today
const today = new Date();
today.setUTCHours(23, 59, 59, 999);
const start = new Date(today);
start.setUTCDate(start.getUTCDate() - 400);
start.setUTCHours(0, 0, 0, 0);

// But to isolate June, just query June 1 -> now
const juneStart = new Date("2026-06-01T00:00:00.000Z");

for (const [label, min, max] of [
  ["JUNE window", juneStart, today],
]) {
  let url =
    `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250` +
    `&created_at_min=${min.toISOString()}&created_at_max=${max.toISOString()}` +
    `&fields=id,created_at,subtotal_price,discount_codes`;
  let totalOrders = 0;
  let kristalOrders = 0;
  let kristalGross = 0;
  let firstStatus = null;
  let page = 0;
  while (url) {
    const res = await fetch(url, {
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
    });
    if (firstStatus === null) firstStatus = res.status;
    if (!res.ok) {
      console.log(`${label}: Shopify returned HTTP ${res.status} ${res.statusText} — body:`, (await res.text()).slice(0, 300));
      break;
    }
    const data = await res.json();
    const orders = data.orders || [];
    totalOrders += orders.length;
    for (const o of orders) {
      const codes = (o.discount_codes || []).map((dc) => dc.code?.toUpperCase()).filter(Boolean);
      if (codes.includes("KRISTAL")) {
        kristalOrders++;
        kristalGross += parseFloat(o.subtotal_price || "0");
      }
    }
    page++;
    const link = res.headers.get("Link");
    if (link && link.includes('rel="next"')) {
      const m = link.match(/<([^>]+)>;\s*rel="next"/);
      url = m ? m[1] : null;
    } else url = null;
    if (page > 50) break;
  }
  console.log(`${label}: HTTP ${firstStatus}, pages=${page}, totalOrders=${totalOrders}, KRISTAL orders=${kristalOrders}, KRISTAL gross=$${kristalGross.toFixed(2)}`);
}

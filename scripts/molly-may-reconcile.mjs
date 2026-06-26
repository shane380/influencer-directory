// Reconcile MOLLYDALTON May 2026: list each discount-code order's post-discount
// product subtotal, and itemize every refund (product-return value vs tax vs
// shipping vs manual/non-return) so we can pinpoint why the app's refund total
// differs from Shopify's "Returns" column.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const storeUrl = process.env.SHOPIFY_STORE_URL;
let token = process.env.SHOPIFY_ACCESS_TOKEN;
if (!token || token === "shpat_xxxxx") { const { data } = await db.from("app_settings").select("value").eq("key", "shopify_access_token").single(); token = data?.value; }
const H = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };
const API = `https://${storeUrl}/admin/api/2024-01`;
const CODE = "MOLLYDALTON";
const MIN = "2026-05-01T00:00:00-00:00", MAX = "2026-06-01T00:00:00-00:00";

async function getAll(url) {
  const out = [];
  let next = url;
  while (next) {
    const res = await fetch(next, { headers: H });
    const j = await res.json();
    out.push(...(j.orders || []));
    const link = res.headers.get("link") || "";
    const m = link.match(/<([^>]+)>;\s*rel="next"/);
    next = m ? m[1] : null;
  }
  return out;
}

// Orders placed in May, then keep only those using the MOLLYDALTON code.
const orders = (await getAll(`${API}/orders.json?status=any&limit=250&created_at_min=${MIN}&created_at_max=${MAX}`))
  .filter((o) => (o.discount_codes || []).some((d) => (d.code || "").toUpperCase() === CODE));

let grossPostDiscount = 0, refundProduct = 0, refundTax = 0, refundShip = 0, refundAdjust = 0, refundTxnTotal = 0;
console.log(`\nMOLLYDALTON — orders placed in May 2026: ${orders.length}\n`);
for (const o of orders) {
  const sub = Number(o.subtotal_price); // post-discount product subtotal, pre-tax/shipping
  grossPostDiscount += sub;
  const refunds = o.refunds || [];
  let oProd = 0, oTax = 0, oShip = 0, oAdj = 0, oTxn = 0;
  for (const r of refunds) {
    for (const li of r.refund_line_items || []) { oProd += Number(li.subtotal || 0); oTax += Number(li.total_tax || 0); }
    for (const adj of r.order_adjustments || []) {
      const amt = Math.abs(Number(adj.amount || 0)) + Math.abs(Number(adj.tax_amount || 0));
      if (adj.kind === "shipping_refund") oShip += amt; else oAdj += amt;
    }
    for (const t of r.transactions || []) if (t.kind === "refund" && t.status === "success") oTxn += Number(t.amount || 0);
  }
  refundProduct += oProd; refundTax += oTax; refundShip += oShip; refundAdjust += oAdj; refundTxnTotal += oTxn;
  const refundNote = refunds.length ? ` | REFUND product=$${oProd.toFixed(2)} tax=$${oTax.toFixed(2)} ship=$${oShip.toFixed(2)} adj=$${oAdj.toFixed(2)} txnTotal=$${oTxn.toFixed(2)}` : "";
  console.log(`  ${o.created_at.slice(0,10)} ${o.name}  sub=$${sub.toFixed(2)}  total=$${Number(o.total_price).toFixed(2)} fin=${o.financial_status}${refundNote}`);
}

console.log(`\n— TOTALS —`);
console.log(`Gross (post-discount product subtotal): $${grossPostDiscount.toFixed(2)}`);
console.log(`Refund · product-return value:          $${refundProduct.toFixed(2)}   (≈ Shopify 'Returns' column)`);
console.log(`Refund · tax:                           $${refundTax.toFixed(2)}`);
console.log(`Refund · shipping:                      $${refundShip.toFixed(2)}`);
console.log(`Refund · manual/non-return adjustments: $${refundAdjust.toFixed(2)}`);
console.log(`Refund · actual $ returned to customer: $${refundTxnTotal.toFixed(2)}   (transactions)`);
console.log(`\nCommission @25%:`);
console.log(`  on (gross − product-return):  $${((grossPostDiscount - refundProduct) * 0.25).toFixed(2)}`);
console.log(`  on (gross − txnTotal):        $${((grossPostDiscount - refundTxnTotal) * 0.25).toFixed(2)}`);

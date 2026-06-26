// Read-only reconstruction of monthly affiliate commission OWED for two legacy
// affiliates (Molly Dalton / MOLLYDALTON, Monica / MONICA25) from live Shopify
// data, for months the app never produced payout records for.
//
// Mirrors src/lib/affiliate.ts calculateAffiliateCommission():
//   net = subtotal_price - sum(refund_line_items.subtotal); commission = net * rate.
//
// "Owed" is what the app would have calculated. Whether each month was actually
// PAID lived in GoAffPro / bank records and must be confirmed by a human.
//
// Usage: node scripts/reconstruct-molly-monica.mjs

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
const H = { "X-Shopify-Access-Token": token, "Content-Type": "application/json" };

const round2 = (n) => Math.round(n * 100) / 100;

// fetch with retry — Shopify/network occasionally drops the connection.
async function fetchRetry(url, opts, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// Page all orders in a month matching a discount code.
async function ordersForMonth(code, month) {
  const [y, mo] = month.split("-").map(Number);
  const startDate = new Date(y, mo - 1, 1).toISOString();
  const endDate = new Date(y, mo, 1).toISOString();
  const codeUpper = code.toUpperCase();

  const matched = [];
  let pageUrl = `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${startDate}&created_at_max=${endDate}`;
  while (pageUrl) {
    const res = await fetchRetry(pageUrl, { headers: H });
    if (!res.ok) break;
    const data = await res.json();
    for (const order of data.orders || []) {
      const codes = (order.discount_codes || []).map((dc) => dc.code?.toUpperCase());
      if (codes.includes(codeUpper)) matched.push(order);
    }
    const link = res.headers.get("Link");
    if (link && link.includes('rel="next"')) {
      const m = link.match(/<([^>]+)>;\s*rel="next"/);
      pageUrl = m ? m[1] : null;
    } else pageUrl = null;
  }
  return matched;
}

async function refundForOrder(orderId) {
  try {
    const res = await fetchRetry(`https://${storeUrl}/admin/api/2024-01/orders/${orderId}/refunds.json`, { headers: H });
    if (!res.ok) return 0;
    const data = await res.json();
    let amt = 0;
    for (const refund of data.refunds || []) {
      for (const li of refund.refund_line_items || []) amt += parseFloat(li.subtotal || "0");
    }
    return round2(amt);
  } catch {
    return 0;
  }
}

async function monthSummary(code, month, rateDec) {
  const orders = await ordersForMonth(code, month);
  let gross = 0;
  let refunds = 0;
  for (let i = 0; i < orders.length; i += 10) {
    const batch = orders.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(async (o) => ({ gross: parseFloat(o.subtotal_price || "0"), refund: await refundForOrder(o.id) }))
    );
    for (const r of results) {
      gross += r.gross;
      refunds += r.refund;
    }
  }
  const net = round2(gross - refunds);
  return {
    month,
    orders: orders.length,
    gross: round2(gross),
    refunds: round2(refunds),
    net,
    rate: rateDec,
    owed: round2(net * rateDec),
  };
}

const PEOPLE = [
  { label: "Molly Dalton", code: "MOLLYDALTON", rate: 0.25 },
  { label: "Monica", code: "MONICA25", rate: 0.25 },
];
const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];

for (const p of PEOPLE) {
  console.log(`\n================ ${p.label} (${p.code}, ${p.rate * 100}%) ================`);
  console.log("month    | orders | gross      | refunds   | net        | owed");
  let totalOwed = 0;
  for (const month of MONTHS) {
    const s = await monthSummary(p.code, month, p.rate);
    totalOwed += s.owed;
    console.log(
      `${s.month} | ${String(s.orders).padStart(6)} | $${s.gross.toFixed(2).padStart(9)} | $${s.refunds
        .toFixed(2)
        .padStart(8)} | $${s.net.toFixed(2).padStart(9)} | $${s.owed.toFixed(2)}`
    );
  }
  console.log(`Total owed Jan–May: $${round2(totalOwed).toFixed(2)}`);
}

console.log("\nNote: 'owed' = app-calculated commission. Confirm which months were actually PAID via GoAffPro/bank records.");

// One-page yearly payout statement for a single creator/affiliate, to reconcile
// against what was actually sent (bank/PayPal).
//
// For each month it shows:
//   Earned  = net-exact commission from live Shopify (gross - refunds) x rate
//             — the source of truth for what they should get.
//   Recorded= what creator_payments says was paid (status=paid).
//   Status  = the app's status for that month.
//
// Usage:
//   node scripts/creator-statement.mjs MOLLYDALTON
//   node scripts/creator-statement.mjs MONICA25 2026

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const CODE = (process.argv[2] || "MOLLYDALTON").toUpperCase();
const YEAR = Number(process.argv[3] || 2026);

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

async function fetchRetry(url, opts, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000 * (i + 1))); continue; }
      return res;
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 1000 * (i + 1))); }
  }
}
async function refundForOrder(id) {
  try {
    const res = await fetchRetry(`https://${storeUrl}/admin/api/2024-01/orders/${id}/refunds.json`, { headers: H });
    if (!res.ok) return 0;
    const d = await res.json();
    let a = 0;
    for (const r of d.refunds || []) for (const li of r.refund_line_items || []) a += parseFloat(li.subtotal || "0");
    return round2(a);
  } catch { return 0; }
}
async function earnedForMonth(month, rate) {
  const [y, mo] = month.split("-").map(Number);
  const start = new Date(y, mo - 1, 1).toISOString();
  const end = new Date(y, mo, 1).toISOString();
  const orders = [];
  let url = `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${start}&created_at_max=${end}`;
  while (url) {
    const res = await fetchRetry(url, { headers: H });
    if (!res.ok) break;
    const d = await res.json();
    for (const o of d.orders || []) {
      if ((o.discount_codes || []).some((dc) => dc.code?.toUpperCase() === CODE)) orders.push(o);
    }
    const link = res.headers.get("Link");
    const m = link && link.includes('rel="next"') ? link.match(/<([^>]+)>;\s*rel="next"/) : null;
    url = m ? m[1] : null;
  }
  let gross = 0, refunds = 0;
  for (let i = 0; i < orders.length; i += 10) {
    const batch = orders.slice(i, i + 10);
    const rfs = await Promise.all(batch.map((o) => refundForOrder(o.id)));
    batch.forEach((o, j) => { gross += parseFloat(o.subtotal_price || "0"); refunds += rfs[j]; });
  }
  const net = round2(gross - refunds);
  return { orders: orders.length, net, earned: round2(net * rate) };
}

// --- resolve rate + recorded payments ---
const { data: la } = await db.from("legacy_affiliates").select("id, name, commission_rate").ilike("discount_code", CODE).maybeSingle();
const rate = (la?.commission_rate || 25) / 100;
const name = la?.name || CODE;

const { data: pays } = await db
  .from("creator_payments")
  .select("month, payment_type, amount_owed, amount_paid, status, paid_at")
  .eq("legacy_affiliate_id", la?.id || "00000000-0000-0000-0000-000000000000");
const recByMonth = new Map();
for (const p of pays || []) {
  const r = recByMonth.get(p.month) || { paid: 0, status: new Set(), paidAt: null };
  if (p.status === "paid") r.paid += Number(p.amount_paid != null ? p.amount_paid : p.amount_owed || 0);
  r.status.add(p.status);
  if (p.paid_at && (!r.paidAt || p.paid_at > r.paidAt)) r.paidAt = p.paid_at;
  recByMonth.set(p.month, r);
}

console.log(`\n  PAYOUT STATEMENT — ${name} (${CODE}, ${rate * 100}%) — ${YEAR}\n`);
console.log("  Month     | Orders | Earned (Shopify) | Recorded paid | Paid date  | Status");
console.log("  " + "-".repeat(80));
let totEarned = 0, totPaid = 0;
const today = new Date();
const lastMonth = today.getFullYear() === YEAR ? today.getMonth() + 1 : 12;
for (let mo = 1; mo <= lastMonth; mo++) {
  const month = `${YEAR}-${String(mo).padStart(2, "0")}`;
  const e = await earnedForMonth(month, rate);
  const rec = recByMonth.get(month);
  const paid = rec ? round2(rec.paid) : 0;
  const status = rec ? [...rec.status].join("/") : "no record";
  totEarned += e.earned; totPaid += paid;
  if (e.orders === 0 && !rec) continue;
  console.log(
    `  ${month}  | ${String(e.orders).padStart(6)} | $${e.earned.toFixed(2).padStart(15)} | $${paid.toFixed(2).padStart(12)} | ${(rec?.paidAt ? rec.paidAt.slice(0, 10) : "—").padEnd(10)} | ${status}`
  );
}
console.log("  " + "-".repeat(80));
console.log(`  TOTALS    |        | $${round2(totEarned).toFixed(2).padStart(15)} | $${round2(totPaid).toFixed(2).padStart(12)} |`);
console.log(`\n  Earned this year:        $${round2(totEarned).toFixed(2)}`);
console.log(`  Recorded as paid:        $${round2(totPaid).toFixed(2)}`);
console.log(`  Difference (still owed):  $${round2(totEarned - totPaid).toFixed(2)}`);
console.log(`\n  "Earned" = Shopify truth. Compare "Recorded paid" to what actually left your account.\n`);

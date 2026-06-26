// Reconcile legacy-affiliate payout data:
//   1. Re-home the stranded pending refund_adjustment rows (filed in a month
//      that's already been paid) to each creator's next UNPAID commission month,
//      so they carry into the next payout and settle there (new settle-on-pay
//      logic in /api/admin/payments PATCH).
//   2. Re-verify every PAID legacy commission row against net-exact Shopify and
//      classify owed≠paid gaps as STALE-OWED (owed overstated, paid is correct →
//      safe to true up) vs UNDERPAID (paid materially below what was owed →
//      FLAG for a human, never auto-change).
//
// Usage:
//   node scripts/reconcile-payouts.mjs           (dry run — report only)
//   node scripts/reconcile-payouts.mjs --apply    (re-home clawbacks + true up STALE only)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");

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
async function refundForOrder(orderId) {
  try {
    const res = await fetchRetry(`https://${storeUrl}/admin/api/2024-01/orders/${orderId}/refunds.json`, { headers: H });
    if (!res.ok) return 0;
    const data = await res.json();
    let amt = 0;
    for (const refund of data.refunds || []) for (const li of refund.refund_line_items || []) amt += parseFloat(li.subtotal || "0");
    return round2(amt);
  } catch { return 0; }
}
// Net-exact gross/refunds per code for a month (single scan).
async function scanMonth(month, codeSet) {
  const [y, mo] = month.split("-").map(Number);
  const startDate = new Date(y, mo - 1, 1).toISOString();
  const endDate = new Date(y, mo, 1).toISOString();
  const matched = [];
  let pageUrl = `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${startDate}&created_at_max=${endDate}`;
  while (pageUrl) {
    const res = await fetchRetry(pageUrl, { headers: H });
    if (!res.ok) break;
    const data = await res.json();
    for (const order of data.orders || []) for (const dc of order.discount_codes || []) {
      const c = dc.code?.toUpperCase();
      if (c && codeSet.has(c)) matched.push({ code: c, order });
    }
    const link = res.headers.get("Link");
    const m = link && link.includes('rel="next"') ? link.match(/<([^>]+)>;\s*rel="next"/) : null;
    pageUrl = m ? m[1] : null;
  }
  const byCode = new Map();
  for (let i = 0; i < matched.length; i += 10) {
    const batch = matched.slice(i, i + 10);
    const refunds = await Promise.all(batch.map(({ order }) => refundForOrder(order.id)));
    batch.forEach(({ code, order }, j) => {
      const acc = byCode.get(code) || { gross: 0, refunds: 0 };
      acc.gross += parseFloat(order.subtotal_price || "0");
      acc.refunds += refunds[j];
      byCode.set(code, acc);
    });
  }
  return byCode;
}

// --- load legacy affiliates + their payment rows ---
const { data: legacy } = await db.from("legacy_affiliates").select("id, name, discount_code, commission_rate, status").eq("status", "active");
const laById = new Map((legacy || []).map((l) => [l.id, l]));
const codeSet = new Set((legacy || []).map((l) => l.discount_code.toUpperCase()));

const { data: pays } = await db.from("creator_payments").select("id, legacy_affiliate_id, month, payment_type, amount_owed, amount_paid, status").not("legacy_affiliate_id", "is", null).order("month");

// ===== 1. Stranded clawbacks → re-home target =====
console.log("======== 1. Stranded refund clawbacks ========");
const stranded = (pays || []).filter((p) => p.payment_type === "refund_adjustment" && p.status === "pending");
const rehomes = [];
for (const adj of stranded) {
  const la = laById.get(adj.legacy_affiliate_id);
  // Earliest UNPAID commission month for this affiliate; else current month.
  const unpaid = (pays || [])
    .filter((p) => p.legacy_affiliate_id === adj.legacy_affiliate_id && p.payment_type === "legacy_affiliate_commission" && p.status !== "paid" && p.status !== "skipped")
    .map((p) => p.month)
    .sort();
  const target = unpaid[0] || "2026-06";
  rehomes.push({ id: adj.id, from: adj.month, to: target, amt: adj.amount_owed, name: la?.name });
  console.log(`  ${la?.name}: $${adj.amount_owed} ${adj.month} → ${target}${target === adj.month ? " (unchanged)" : ""}`);
}

// ===== 2. Re-verify PAID commission rows (owed vs paid vs net-exact) =====
console.log("\n======== 2. Paid commission rows with owed≠paid ========");
const paidRows = (pays || []).filter((p) => p.payment_type === "legacy_affiliate_commission" && p.status === "paid" && Math.abs(Number(p.amount_owed || 0) - Number(p.amount_paid || 0)) > 0.01);
const months = [...new Set(paidRows.map((p) => p.month))];
const netByMonth = new Map();
for (const month of months) netByMonth.set(month, await scanMonth(month, codeSet));

const trueUps = []; // safe: owed overstated, paid == net-exact
const underpaid = []; // FLAG: paid materially below net-exact
for (const p of paidRows) {
  const la = laById.get(p.legacy_affiliate_id);
  const acc = netByMonth.get(p.month)?.get(la.discount_code.toUpperCase());
  const net = acc ? round2(acc.gross - acc.refunds) : 0;
  const exact = round2(net * ((la.commission_rate || 25) / 100));
  const owed = Number(p.amount_owed), paid = Number(p.amount_paid);
  const tag = Math.abs(paid - exact) <= 1 ? "STALE-OWED (paid≈net-exact)" : Math.abs(owed - exact) <= 1 && paid < exact - 1 ? "UNDERPAID" : "REVIEW";
  console.log(`  ${la.name} ${p.month}: owed $${owed.toFixed(2)} | paid $${paid.toFixed(2)} | net-exact $${exact.toFixed(2)} → ${tag}`);
  if (tag === "STALE-OWED") trueUps.push({ id: p.id, owed, to: exact });
  else underpaid.push({ name: la.name, month: p.month, owed, paid, exact, gap: round2(exact - paid) });
}

console.log("\n======== Summary ========");
console.log(`Re-home clawbacks: ${rehomes.filter((r) => r.to !== r.from).length}`);
console.log(`Safe true-ups (STALE-OWED → set owed=net-exact): ${trueUps.length}`);
if (underpaid.length) {
  console.log(`\n⚠️  UNDERPAID / REVIEW — NOT auto-changed, needs your decision:`);
  for (const u of underpaid) console.log(`    ${u.name} ${u.month}: paid $${u.paid.toFixed(2)} vs net-exact $${u.exact.toFixed(2)} → short $${u.gap.toFixed(2)}`);
}

if (APPLY) {
  for (const r of rehomes.filter((x) => x.to !== x.from)) {
    await db.from("creator_payments").update({ month: r.to }).eq("id", r.id);
  }
  for (const t of trueUps) {
    await db.from("creator_payments").update({ amount_owed: t.to }).eq("id", t.id);
  }
  console.log(`\nApplied: re-homed ${rehomes.filter((x) => x.to !== x.from).length} clawbacks, trued up ${trueUps.length} stale rows. (Underpaid rows left untouched.)`);
} else {
  console.log("\nDry run only. Re-run with --apply to re-home clawbacks + true up STALE rows (underpaid rows are never auto-changed).");
}

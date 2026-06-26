// Backfill missing legacy-affiliate payout records for the GoAffPro-era months
// (Jan–Apr 2026) so the payments page + creator dashboard show full history
// instead of starting at May (when these affiliates were first tracked).
//
// Inserts rows as status='pending' (column default) — i.e. OUTSTANDING — each
// tagged "[Backfill] … verify vs GoAffPro before paying" so nobody double-pays
// a month GoAffPro already settled. Skips months that already have a row and
// months with $0 owed.
//
// Scans Shopify once per month for ALL active legacy codes (mirrors
// calculateBulkAffiliateCommissions), then computes net-exact commission.
//
// Usage:
//   node scripts/backfill-legacy-payouts.mjs           (dry run — prints plan)
//   node scripts/backfill-legacy-payouts.mjs --apply    (writes rows)

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

const MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04"];
const round2 = (n) => Math.round(n * 100) / 100;

async function fetchRetry(url, opts, tries = 5) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 2000 * (i + 1))); continue; }
      return res;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
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
  } catch { return 0; }
}

// One month scan, binning matching orders by uppercased code.
async function scanMonth(month, codeSet) {
  const [y, mo] = month.split("-").map(Number);
  const startDate = new Date(y, mo - 1, 1).toISOString();
  const endDate = new Date(y, mo, 1).toISOString();

  const byCode = new Map(); // codeUpper -> { gross, refunds, orders }
  const matched = []; // { code, order }
  let pageUrl = `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${startDate}&created_at_max=${endDate}`;
  while (pageUrl) {
    const res = await fetchRetry(pageUrl, { headers: H });
    if (!res.ok) break;
    const data = await res.json();
    for (const order of data.orders || []) {
      for (const dc of order.discount_codes || []) {
        const c = dc.code?.toUpperCase();
        if (c && codeSet.has(c)) matched.push({ code: c, order });
      }
    }
    const link = res.headers.get("Link");
    const m = link && link.includes('rel="next"') ? link.match(/<([^>]+)>;\s*rel="next"/) : null;
    pageUrl = m ? m[1] : null;
  }

  // Refunds per matched order (batched).
  for (let i = 0; i < matched.length; i += 10) {
    const batch = matched.slice(i, i + 10);
    const refunds = await Promise.all(batch.map(({ order }) => refundForOrder(order.id)));
    batch.forEach(({ code, order }, j) => {
      const acc = byCode.get(code) || { gross: 0, refunds: 0, orders: 0 };
      acc.gross += parseFloat(order.subtotal_price || "0");
      acc.refunds += refunds[j];
      acc.orders += 1;
      byCode.set(code, acc);
    });
  }
  return byCode;
}

// --- main ---
const { data: legacy } = await db
  .from("legacy_affiliates")
  .select("id, name, discount_code, commission_rate, status, influencer_id, payment_method, payment_detail")
  .eq("status", "active");

const codeSet = new Set((legacy || []).map((l) => l.discount_code.toUpperCase()));
console.log(`${legacy?.length || 0} active legacy affiliates; backfilling months ${MONTHS.join(", ")}`);
console.log(APPLY ? ">>> APPLY MODE — rows will be inserted\n" : ">>> DRY RUN — no writes (pass --apply to write)\n");

// Existing legacy rows for these months, to skip duplicates.
const { data: existing } = await db
  .from("creator_payments")
  .select("legacy_affiliate_id, month")
  .eq("payment_type", "legacy_affiliate_commission")
  .in("month", MONTHS);
const existingKey = new Set((existing || []).map((r) => `${r.legacy_affiliate_id}|${r.month}`));

const toInsert = [];
for (const month of MONTHS) {
  const byCode = await scanMonth(month, codeSet);
  for (const la of legacy || []) {
    const key = `${la.id}|${month}`;
    if (existingKey.has(key)) continue; // already tracked — never touch
    const acc = byCode.get(la.discount_code.toUpperCase());
    if (!acc || acc.orders === 0) continue;
    const rate = la.commission_rate || 25;
    const gross = round2(acc.gross);
    const refunds = round2(acc.refunds);
    const net = round2(gross - refunds);
    const owed = round2(net * (rate / 100));
    if (owed <= 0) continue;
    const note = `[Backfill] ${acc.orders} orders, $${gross.toFixed(2)} gross, -$${refunds.toFixed(2)} refunds, $${net.toFixed(2)} net × ${rate}% — verify vs GoAffPro before paying`;
    toInsert.push({
      row: {
        legacy_affiliate_id: la.id,
        influencer_id: la.influencer_id || null,
        month,
        payment_type: "legacy_affiliate_commission",
        amount_owed: owed,
        status: "pending",
        payment_method: la.payment_method || null,
        payment_detail: la.payment_detail || null,
        notes: note,
        calculation_details: { order_count: acc.orders, total_gross: gross, total_refunds: refunds, total_net: net, commission_rate: rate / 100, commission_owed: owed },
      },
      label: `${la.name} (${la.discount_code}) ${month}: $${owed.toFixed(2)}`,
    });
  }
}

console.log(`Rows to insert: ${toInsert.length}`);
let total = 0;
for (const t of toInsert) { console.log("  " + t.label); total += t.row.amount_owed; }
console.log(`Total owed across backfilled rows: $${round2(total).toFixed(2)}`);

if (APPLY && toInsert.length > 0) {
  const { error } = await db.from("creator_payments").insert(toInsert.map((t) => t.row));
  if (error) { console.error("Insert failed:", error.message); process.exit(1); }
  console.log(`\nInserted ${toInsert.length} pending rows.`);
} else if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to insert.");
}

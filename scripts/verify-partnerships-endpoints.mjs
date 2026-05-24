// Reconciliation check for the /api/partnerships aggregate routes — runs the same queries server-side and prints totals so they can be compared against per-creator detail pages. Run: `node scripts/verify-partnerships-endpoints.mjs` (loads .env.local automatically).

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

const dayOnly = (d) => d.toISOString().slice(0, 10);
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const todayDay = dayOnly(today);

console.log(`=== Verification run @ ${todayDay} ===\n`);

// ── 1. /aggregate-revenue?range=90d ─────────────────────────────────────────
{
  const lengthDays = 90;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (lengthDays - 1));
  const startDay = dayOnly(start);

  const { data: creators } = await db.from("creators").select("affiliate_code").not("affiliate_code", "is", null);
  const codes = [...new Set((creators || []).map((c) => String(c.affiliate_code).toUpperCase()))];

  const { data: rows } = await db
    .from("creator_code_revenue_daily")
    .select("affiliate_code, date, gross_amount, order_count")
    .in("affiliate_code", codes)
    .gte("date", startDay)
    .lte("date", todayDay);

  let rev = 0, ord = 0;
  const codesSeen = new Set();
  for (const r of rows || []) {
    rev += Number(r.gross_amount || 0);
    ord += Number(r.order_count || 0);
    codesSeen.add(r.affiliate_code);
  }
  console.log(`/aggregate-revenue?range=90d:`);
  console.log(`  window: ${startDay} → ${todayDay}`);
  console.log(`  totals.revenue: $${rev.toFixed(2)}`);
  console.log(`  totals.orders:  ${ord}`);
  console.log(`  codes contributing: ${codesSeen.size} / ${codes.length} active`);
  console.log(`  rows scanned: ${(rows || []).length}\n`);
}

// ── 2. /whitelisting-stats ──────────────────────────────────────────────────
{
  const cmStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const cmStartDay = dayOnly(cmStart);

  const { data: dailyRows } = await db
    .from("creator_ad_performance_daily")
    .select("date, spend, purchase_value")
    .gte("date", cmStartDay)
    .lte("date", todayDay);

  let spend = 0, pv = 0;
  for (const r of dailyRows || []) {
    spend += Number(r.spend || 0);
    pv += Number(r.purchase_value || 0);
  }
  const roas = spend > 0 ? pv / spend : null;

  const { data: perfRows } = await db.from("creator_ad_performance").select("instagram_handle, ads");
  let adsLive = 0, partners = 0;
  for (const row of perfRows || []) {
    const ads = Array.isArray(row.ads) ? row.ads : [];
    const active = ads.filter((a) => a?.effective_status === "ACTIVE").length;
    if (active > 0) {
      adsLive += active;
      partners += 1;
    }
  }
  console.log(`/whitelisting-stats:`);
  console.log(`  current month: ${cmStartDay} → ${todayDay}`);
  console.log(`  ad_spend_mtd:                $${spend.toFixed(2)}`);
  console.log(`  purchase_value_mtd (denom):  $${pv.toFixed(2)}`);
  console.log(`  roas:                        ${roas == null ? "—" : roas.toFixed(2) + "x"}`);
  console.log(`  ads_live (jsonb scan):       ${adsLive}`);
  console.log(`  whitelisted_partners_count:  ${partners}`);
  console.log(`  creator_ad_performance rows: ${(perfRows || []).length}\n`);
}

// ── 3. /top-partners (current month, top 5) ────────────────────────────────
{
  const cmStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const cmStartDay = dayOnly(cmStart);

  const { data: creators } = await db.from("creators")
    .select("id, creator_name, affiliate_code, invite_id")
    .not("affiliate_code", "is", null);
  const list = (creators || []).map((c) => ({ ...c, affiliate_code: String(c.affiliate_code).toUpperCase() }));
  const codes = [...new Set(list.map((c) => c.affiliate_code))];

  const { data: rev } = await db
    .from("creator_code_revenue_daily")
    .select("affiliate_code, gross_amount, order_count")
    .in("affiliate_code", codes)
    .gte("date", cmStartDay)
    .lte("date", todayDay);

  const byCode = new Map();
  for (const r of rev || []) {
    const acc = byCode.get(r.affiliate_code) || { revenue: 0, orders: 0 };
    acc.revenue += Number(r.gross_amount || 0);
    acc.orders += Number(r.order_count || 0);
    byCode.set(r.affiliate_code, acc);
  }
  const ranked = list
    .map((c) => ({ ...c, ...(byCode.get(c.affiliate_code) || { revenue: 0, orders: 0 }) }))
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  console.log(`/top-partners?month=${cmStartDay.slice(0, 7)}&limit=5:`);
  for (const [i, c] of ranked.entries()) {
    console.log(`  ${i + 1}. ${c.creator_name || "(no name)"} (${c.affiliate_code}) — $${c.revenue.toFixed(2)} / ${c.orders} orders`);
  }
  if (ranked.length === 0) console.log(`  (no partners with sales this month)`);
  console.log("");
}

// ── 4. /active-partners (count + top 3 rows by revenue_30d) ────────────────
{
  const thirtyAgo = new Date(today);
  thirtyAgo.setUTCDate(thirtyAgo.getUTCDate() - 29);
  const thirtyAgoDay = dayOnly(thirtyAgo);

  const { data: creators } = await db.from("creators")
    .select("id, creator_name, affiliate_code, invite_id, commission_rate")
    .order("onboarded_at", { ascending: false });
  const list = creators || [];
  const codes = [...new Set(list.map((c) => c.affiliate_code).filter(Boolean).map((c) => String(c).toUpperCase()))];

  const { data: rev } = await db
    .from("creator_code_revenue_daily")
    .select("affiliate_code, gross_amount, order_count")
    .in("affiliate_code", codes)
    .gte("date", thirtyAgoDay)
    .lte("date", todayDay);
  const byCode = new Map();
  for (const r of rev || []) {
    const acc = byCode.get(r.affiliate_code) || { revenue_30d: 0, orders_30d: 0 };
    acc.revenue_30d += Number(r.gross_amount || 0);
    acc.orders_30d += Number(r.order_count || 0);
    byCode.set(r.affiliate_code, acc);
  }

  const enriched = list.map((c) => ({
    ...c,
    affiliate_code: c.affiliate_code ? String(c.affiliate_code).toUpperCase() : null,
    ...(byCode.get(c.affiliate_code ? String(c.affiliate_code).toUpperCase() : "") || { revenue_30d: 0, orders_30d: 0 }),
  }));
  console.log(`/active-partners:`);
  console.log(`  total partners: ${enriched.length}`);
  const top3 = [...enriched].sort((a, b) => b.revenue_30d - a.revenue_30d).slice(0, 3);
  for (const [i, c] of top3.entries()) {
    console.log(`  top ${i + 1}: ${c.creator_name || "(no name)"} (${c.affiliate_code}) — 30d: $${c.revenue_30d.toFixed(2)} / ${c.orders_30d} orders`);
  }
  console.log("");
}

// ── 5. Reconciliation check: sum-per-creator code revenue 90d == cross-creator 90d total ──
{
  const lengthDays = 90;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - (lengthDays - 1));
  const startDay = dayOnly(start);

  const { data: creators } = await db.from("creators").select("id, affiliate_code").not("affiliate_code", "is", null);
  const codes = [...new Set((creators || []).map((c) => String(c.affiliate_code).toUpperCase()))];

  const { data: rev } = await db
    .from("creator_code_revenue_daily")
    .select("affiliate_code, gross_amount, order_count")
    .in("affiliate_code", codes)
    .gte("date", startDay)
    .lte("date", todayDay);

  const byCode = new Map();
  for (const r of rev || []) {
    const acc = byCode.get(r.affiliate_code) || { revenue: 0, orders: 0 };
    acc.revenue += Number(r.gross_amount || 0);
    acc.orders += Number(r.order_count || 0);
    byCode.set(r.affiliate_code, acc);
  }
  const sumPerCreator = [...byCode.values()].reduce((s, v) => s + v.revenue, 0);
  const sumOrdersPerCreator = [...byCode.values()].reduce((s, v) => s + v.orders, 0);
  const aggrTotal = (rev || []).reduce((s, r) => s + Number(r.gross_amount || 0), 0);
  const aggrOrders = (rev || []).reduce((s, r) => s + Number(r.order_count || 0), 0);
  console.log(`Reconciliation (90d code revenue):`);
  console.log(`  Σ per-creator revenue: $${sumPerCreator.toFixed(2)} (${sumOrdersPerCreator} orders)`);
  console.log(`  Cross-creator total:   $${aggrTotal.toFixed(2)} (${aggrOrders} orders)`);
  console.log(`  Δ: $${Math.abs(sumPerCreator - aggrTotal).toFixed(2)}  ${Math.abs(sumPerCreator - aggrTotal) < 0.01 ? "✓ reconciles" : "✗ MISMATCH"}\n`);
}

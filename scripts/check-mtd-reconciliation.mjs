// Reconciliation: Σ per-partner MTD revenue should equal aggregate-revenue
// current_month.revenue. Σ per-partner MTD ad spend should equal
// whitelisting-stats ad_spend_mtd.
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
const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
const monthStartDay = dayOnly(monthStart);
const todayDay = dayOnly(today);

console.log(`MTD window: ${monthStartDay} → ${todayDay}\n`);

// --- Per-partner aggregations (mimics what /api/partnerships/active-partners now returns)
const { data: creators } = await db.from("creators")
  .select("id, creator_name, affiliate_code, invite_id");
const list = (creators || []).map(c => ({ ...c, affiliate_code: c.affiliate_code ? String(c.affiliate_code).toUpperCase() : null }));
const codes = [...new Set(list.map(c => c.affiliate_code).filter(Boolean))];

const inviteIds = list.map(c => c.invite_id).filter(Boolean);
const { data: invites } = await db.from("creator_invites").select("id, influencer_id").in("id", inviteIds);
const invMap = new Map(invites.map(i => [i.id, i.influencer_id]));
const influencerIds = [...new Set([...invMap.values()].filter(Boolean))];

const { data: revRows } = await db.from("creator_code_revenue_daily")
  .select("affiliate_code, gross_amount, order_count").in("affiliate_code", codes)
  .gte("date", monthStartDay).lte("date", todayDay);
const revByCode = new Map();
for (const r of revRows || []) {
  const acc = revByCode.get(r.affiliate_code) || { revenue: 0, orders: 0 };
  acc.revenue += Number(r.gross_amount || 0);
  acc.orders += Number(r.order_count || 0);
  revByCode.set(r.affiliate_code, acc);
}

const { data: spendRows } = await db.from("creator_ad_performance_daily")
  .select("influencer_id, spend").in("influencer_id", influencerIds)
  .gte("date", monthStartDay).lte("date", todayDay);
const spendByInf = new Map();
for (const r of spendRows || []) {
  spendByInf.set(r.influencer_id, (spendByInf.get(r.influencer_id) || 0) + Number(r.spend || 0));
}

let sumRev = 0, sumSpend = 0;
for (const c of list) {
  const rev = c.affiliate_code ? revByCode.get(c.affiliate_code) : null;
  const infId = c.invite_id ? invMap.get(c.invite_id) : null;
  const spend = infId ? spendByInf.get(infId) || 0 : 0;
  sumRev += rev?.revenue || 0;
  sumSpend += spend;
}

console.log(`Sum of per-partner revenue_mtd:    $${sumRev.toFixed(2)}`);
console.log(`Sum of per-partner ad_spend_mtd:   $${sumSpend.toFixed(2)}\n`);

// --- Cross-creator MTD revenue (matches /aggregate-revenue current_month.revenue)
const { data: allRev } = await db.from("creator_code_revenue_daily")
  .select("gross_amount").in("affiliate_code", codes)
  .gte("date", monthStartDay).lte("date", todayDay);
const crossRev = (allRev || []).reduce((s, r) => s + Number(r.gross_amount || 0), 0);

// --- Cross-creator MTD ad spend (matches /whitelisting-stats ad_spend_mtd)
const { data: allSpend } = await db.from("creator_ad_performance_daily")
  .select("spend").gte("date", monthStartDay).lte("date", todayDay);
const crossSpend = (allSpend || []).reduce((s, r) => s + Number(r.spend || 0), 0);

console.log(`/aggregate-revenue current_month.revenue: $${crossRev.toFixed(2)}`);
console.log(`/whitelisting-stats ad_spend_mtd:         $${crossSpend.toFixed(2)}\n`);

console.log(`Revenue Δ:    $${Math.abs(sumRev - crossRev).toFixed(2)}  ${Math.abs(sumRev - crossRev) < 0.01 ? "✓ reconciles" : "✗ mismatch"}`);
console.log(`Ad spend Δ:   $${Math.abs(sumSpend - crossSpend).toFixed(2)}  ${Math.abs(sumSpend - crossSpend) < 0.01 ? "✓ reconciles" : "(see note)"}`);
if (Math.abs(sumSpend - crossSpend) >= 0.01) {
  console.log(`  Note: ad-spend mismatch is expected if some creator_ad_performance_daily rows`);
  console.log(`  have influencer_ids that aren't linked to any current creator via creator_invites.`);
}

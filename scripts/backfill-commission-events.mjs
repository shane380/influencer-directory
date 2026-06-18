// Backfill the append-only commission_events ledger from source data.
// Idempotent: upserts on (creator_key, event_type, source_id), so re-running is
// safe. Affiliate = per-order (+gross×rate) + per-refund (−refund×rate) straight
// from Shopify; ad-spend from creator_ad_performance.monthly; retainer from
// creator_invites. Verify: SUM(events) per creator/month vs the live net-exact
// (Shopify truth) — NOT vs the old creator_payments (those were the bug).
//
// Usage:
//   node scripts/backfill-commission-events.mjs                 (dry run, default months)
//   node scripts/backfill-commission-events.mjs 2026-01,2026-02 (dry run, specific months)
//   node scripts/backfill-commission-events.mjs 2026-03 --apply (write events)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const monthsArg = args.find((a) => /^\d{4}-\d{2}/.test(a));
const MONTHS = monthsArg ? monthsArg.split(",") : ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05"];

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

async function fetchRetry(url, opts, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** i, 8000))); continue; }
      return res;
    } catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** i, 8000))); }
  }
}
async function refundForOrder(id) {
  const res = await fetchRetry(`https://${storeUrl}/admin/api/2024-01/orders/${id}/refunds.json`, { headers: H });
  if (!res.ok) return 0;
  const d = await res.json();
  let a = 0;
  for (const r of d.refunds || []) for (const li of r.refund_line_items || []) a += parseFloat(li.subtotal || "0");
  return round2(a);
}
// Scan a month once for all codes → { codeUpper -> [{order_id, order_number, created_at, gross, refund}] }
async function scanMonth(month, codeSet) {
  const [y, mo] = month.split("-").map(Number);
  const start = new Date(y, mo - 1, 1).toISOString();
  const end = new Date(y, mo, 1).toISOString();
  const matched = [];
  let url = `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${start}&created_at_max=${end}`;
  while (url) {
    const res = await fetchRetry(url, { headers: H });
    if (!res.ok) throw new Error(`orders page ${res.status} for ${month}`);
    const data = await res.json();
    for (const o of data.orders || []) {
      for (const dc of o.discount_codes || []) {
        const c = dc.code?.toUpperCase();
        if (c && codeSet.has(c)) matched.push({ code: c, order: o });
      }
    }
    const link = res.headers.get("Link");
    const m = link && link.includes('rel="next"') ? link.match(/<([^>]+)>;\s*rel="next"/) : null;
    url = m ? m[1] : null;
  }
  const byCode = new Map();
  for (let i = 0; i < matched.length; i += 10) {
    const batch = matched.slice(i, i + 10);
    const refunds = await Promise.all(batch.map(({ order }) => refundForOrder(order.id)));
    batch.forEach(({ code, order }, j) => {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push({
        order_id: order.id, order_number: order.order_number || order.name,
        created_at: order.created_at, gross: parseFloat(order.subtotal_price || "0"), refund: refunds[j],
      });
    });
  }
  return byCode;
}

// --- load owners (affiliate codes + rates, ad-spend, retainer) ---
const { data: legacy } = await db.from("legacy_affiliates").select("id, name, discount_code, commission_rate, influencer_id").eq("status", "active");
const { data: creators } = await db.from("creators").select("id, creator_name, affiliate_code, commission_rate, invite_id");
const inviteIds = (creators || []).map((c) => c.invite_id).filter(Boolean);
const { data: invites } = await db.from("creator_invites").select("id, influencer_id, has_affiliate, has_ad_spend, has_retainer, retainer_amount, ad_spend_percentage, commission_rate, influencer:influencers(id, instagram_handle)").in("id", inviteIds.length ? inviteIds : ["x"]);
const inviteMap = new Map((invites || []).map((i) => [i.id, i]));
const { data: adPerf } = await db.from("creator_ad_performance").select("instagram_handle, monthly");
const adByHandle = new Map((adPerf || []).map((a) => [a.instagram_handle, typeof a.monthly === "string" ? JSON.parse(a.monthly) : a.monthly]));

// affiliate code set (partner + legacy)
const codeSet = new Set();
for (const la of legacy || []) codeSet.add(la.discount_code.toUpperCase());
for (const c of creators || []) {
  const inv = inviteMap.get(c.invite_id);
  if (inv?.has_affiliate && c.affiliate_code) codeSet.add(c.affiliate_code.toUpperCase());
}

const allEvents = [];
console.log(`Months: ${MONTHS.join(", ")} · ${codeSet.size} affiliate codes · ${APPLY ? "APPLY" : "DRY RUN"}\n`);

for (const period of MONTHS) {
  const byCode = await scanMonth(period, codeSet);

  // Legacy affiliate events (25% etc.)
  for (const la of legacy || []) {
    const orders = byCode.get(la.discount_code.toUpperCase()) || [];
    const rate = (la.commission_rate || 25) / 100;
    const key = `legacy:${la.id}`;
    for (const o of orders) {
      if (o.gross > 0) allEvents.push(ev(key, null, la.id, "affiliate", "shopify_order", String(o.order_id), period, o.created_at, round2(o.gross * rate), rate, o.gross, { order_number: o.order_number, gross: o.gross }));
      if (o.refund > 0) allEvents.push(ev(key, null, la.id, "refund", "shopify_refund", String(o.order_id), period, o.created_at, round2(-o.refund * rate), rate, o.refund, { order_number: o.order_number, refund: o.refund }));
    }
  }

  // Partner affiliate + ad spend + retainer
  for (const c of creators || []) {
    const inv = inviteMap.get(c.invite_id);
    if (!inv?.influencer?.id) continue;
    const infId = inv.influencer.id;
    const key = `inf:${infId}`;
    if (inv.has_affiliate && c.affiliate_code) {
      const orders = byCode.get(c.affiliate_code.toUpperCase()) || [];
      const rate = (c.commission_rate || inv.ad_spend_percentage || 10) / 100;
      for (const o of orders) {
        if (o.gross > 0) allEvents.push(ev(key, infId, null, "affiliate", "shopify_order", String(o.order_id), period, o.created_at, round2(o.gross * rate), rate, o.gross, { order_number: o.order_number, gross: o.gross }));
        if (o.refund > 0) allEvents.push(ev(key, infId, null, "refund", "shopify_refund", String(o.order_id), period, o.created_at, round2(-o.refund * rate), rate, o.refund, { order_number: o.order_number, refund: o.refund }));
      }
    }
    if (inv.has_ad_spend) {
      const spend = (adByHandle.get(inv.influencer.instagram_handle) || []).find((m) => m.month === period)?.spend || 0;
      const rate = (inv.ad_spend_percentage || 10) / 100;
      if (spend > 0) allEvents.push(ev(key, infId, null, "ad_spend", "meta_monthly", period, period, null, round2(spend * rate), rate, round2(spend), { spend: round2(spend) }));
    }
    if (inv.has_retainer && inv.retainer_amount > 0) {
      allEvents.push(ev(key, infId, null, "retainer", "retainer", period, period, null, round2(inv.retainer_amount), null, null, null));
    }
  }
}

function ev(creator_key, influencer_id, legacy_affiliate_id, event_type, source_type, source_id, period, occurred_at, amount, rate, basis, detail) {
  return { creator_key, influencer_id, legacy_affiliate_id, event_type, source_type, source_id, period, occurred_at, amount, rate, basis, detail };
}

// Per-owner/period earned summary (for the human eyeball)
const byOwnerPeriod = new Map();
for (const e of allEvents) {
  const k = `${e.creator_key}|${e.period}`;
  byOwnerPeriod.set(k, round2((byOwnerPeriod.get(k) || 0) + e.amount));
}
console.log(`Built ${allEvents.length} events. Earned by owner/month (sum of events):`);
const laName = new Map((legacy || []).map((l) => [`legacy:${l.id}`, l.name]));
const infName = new Map((creators || []).map((c) => [`inf:${inviteMap.get(c.invite_id)?.influencer?.id}`, c.creator_name]));
for (const [k, v] of [...byOwnerPeriod.entries()].sort()) {
  const [owner, period] = k.split("|");
  if (Math.abs(v) < 0.01) continue;
  console.log(`  ${(laName.get(owner) || infName.get(owner) || owner).padEnd(22)} ${period}  $${v.toFixed(2)}`);
}

if (APPLY) {
  for (let i = 0; i < allEvents.length; i += 500) {
    const { error } = await db.from("commission_events").upsert(allEvents.slice(i, i + 500), { onConflict: "creator_key,event_type,source_id" });
    if (error) { console.error("upsert error:", error.message); process.exit(1); }
  }
  console.log(`\nApplied: upserted ${allEvents.length} events into commission_events.`);
} else {
  console.log(`\nDry run. Re-run with --apply to write. Verify a creator with: node scripts/creator-statement.mjs <CODE> 2026`);
}

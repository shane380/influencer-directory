import { getAdminClient } from "./admin-auth";
import { getShopifyAccessToken, getShopifyStoreUrl } from "./shopify";
import { CommissionEvent, upsertEvents } from "./commission-ledger";

// Keeps the affiliate side of the commission_events ledger fresh. The ledger
// was seeded by scripts/backfill-commission-events.mjs (one-time, Jun 2026);
// this sync appends/updates events on a rolling window so payments-v2 stops
// decaying as new orders and late refunds come in.
//
// The Shopify scan filters on UPDATED_AT, not created_at: a refund bumps the
// order's updated_at, so a short window still catches a refund issued months
// after the order (e.g. a July return on a March order). Events are keyed to
// the ORDER's month (period = created_at month), matching the backfill — a
// late refund claws back commission from the month it was earned in.
//
// Upserts on (creator_key, event_type, source_id=order_id) are idempotent, so
// re-scanning the same orders every day just rewrites the same rows, and the
// refund event always reflects the order's latest cumulative refund total.

const round2 = (n: number) => Math.round(n * 100) / 100;

interface CodeOwner {
  creatorKey: string;
  influencerId: string | null;
  legacyAffiliateId: string | null;
  rate: number; // decimal
}

async function fetchRetry(url: string, opts: RequestInit, tries = 6): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** i, 8000)));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, Math.min(500 * 2 ** i, 8000)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Shopify fetch failed after retries");
}

// Affiliate code -> owner(s), mirroring the backfill: active legacy affiliates
// at their commission_rate, partner creators (invite.has_affiliate) at
// creators.commission_rate || invite.ad_spend_percentage || 10.
async function loadCodeOwners(db: any): Promise<Map<string, CodeOwner[]>> {
  const owners = new Map<string, CodeOwner[]>();
  const add = (code: string, o: CodeOwner) => {
    const k = code.toUpperCase();
    if (!owners.has(k)) owners.set(k, []);
    owners.get(k)!.push(o);
  };

  const { data: legacy } = await (db.from("legacy_affiliates") as any)
    .select("id, discount_code, commission_rate, influencer_id")
    .eq("status", "active")
    .not("discount_code", "is", null);
  for (const la of legacy || []) {
    add(la.discount_code, {
      creatorKey: `legacy:${la.id}`,
      influencerId: la.influencer_id || null,
      legacyAffiliateId: la.id,
      rate: (Number(la.commission_rate) || 25) / 100,
    });
  }

  const { data: creators } = await (db.from("creators") as any)
    .select("affiliate_code, commission_rate, invite_id")
    .not("affiliate_code", "is", null);
  const inviteIds = (creators || []).map((c: any) => c.invite_id).filter(Boolean);
  const { data: invites } = inviteIds.length
    ? await (db.from("creator_invites") as any)
        .select("id, influencer_id, has_affiliate, ad_spend_percentage")
        .in("id", inviteIds)
    : { data: [] };
  const inviteMap = new Map<string, any>((invites || []).map((i: any) => [i.id, i]));
  for (const c of creators || []) {
    const inv = inviteMap.get(c.invite_id);
    if (!inv?.has_affiliate || !inv.influencer_id) continue;
    add(c.affiliate_code, {
      creatorKey: `inf:${inv.influencer_id}`,
      influencerId: inv.influencer_id,
      legacyAffiliateId: null,
      rate: (Number(c.commission_rate) || Number(inv.ad_spend_percentage) || 10) / 100,
    });
  }
  return owners;
}

// YYYY-MM strings for every month [since, today] touches.
function monthsInWindow(since: Date): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), 1));
  const now = new Date();
  while (cur.getTime() <= now.getTime()) {
    out.push(cur.toISOString().slice(0, 7));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

// Ad-spend events for the window's months, rebuilt from the DAILY ad table
// (creator_ad_performance_daily — the monthly blob decays; see backfill).
// Each month's event sums the FULL month, so a mid-month run just overwrites
// the running total and the final run of the month settles it.
async function buildAdSpendEvents(db: any, months: string[]): Promise<CommissionEvent[]> {
  const { data: invites } = await (db.from("creator_invites") as any)
    .select("influencer_id, has_ad_spend, ad_spend_percentage, influencer:influencers(id, instagram_handle)")
    .eq("has_ad_spend", true);
  const byHandle = new Map<string, { influencerId: string; rate: number }>();
  for (const inv of invites || []) {
    const handle = (Array.isArray(inv.influencer) ? inv.influencer[0] : inv.influencer)?.instagram_handle;
    if (!handle || !inv.influencer_id) continue;
    byHandle.set(handle, { influencerId: inv.influencer_id, rate: (Number(inv.ad_spend_percentage) || 10) / 100 });
  }
  if (!byHandle.size || !months.length) return [];

  const sorted = [...months].sort();
  const lo = `${sorted[0]}-01`;
  const [ly, lm] = sorted[sorted.length - 1].split("-").map(Number);
  const hi = new Date(Date.UTC(ly, lm, 1)).toISOString().slice(0, 10);
  const spend = new Map<string, number>(); // "<handle>|YYYY-MM" -> spend
  for (let from = 0; ; from += 1000) {
    const { data: rows } = await (db.from("creator_ad_performance_daily") as any)
      .select("instagram_handle, date, spend")
      .gte("date", lo)
      .lt("date", hi)
      .order("id")
      .range(from, from + 999);
    for (const r of rows || []) {
      const k = `${r.instagram_handle}|${String(r.date).slice(0, 7)}`;
      spend.set(k, (spend.get(k) || 0) + Number(r.spend || 0));
    }
    if (!rows || rows.length < 1000) break;
  }

  const events: CommissionEvent[] = [];
  for (const [handle, o] of byHandle) {
    for (const period of months) {
      const s = spend.get(`${handle}|${period}`) || 0;
      if (s <= 0) continue;
      events.push({
        creator_key: `inf:${o.influencerId}`,
        influencer_id: o.influencerId,
        legacy_affiliate_id: null,
        event_type: "ad_spend",
        source_type: "meta_monthly",
        source_id: period,
        period,
        occurred_at: null,
        amount: round2(s * o.rate),
        rate: o.rate,
        basis: round2(s),
        detail: { spend: round2(s) },
      });
    }
  }
  return events;
}

// Paid collabs: one event per confirmed deal, keyed to the campaign's start
// month — only for the window's months, same shape as the backfill.
async function buildPaidCollabEvents(db: any, months: string[]): Promise<CommissionEvent[]> {
  const { data: deals } = await (db.from("campaign_deals") as any)
    .select("id, influencer_id, total_deal_value, campaign:campaigns!campaign_deals_campaign_id_fkey(start_date)")
    .eq("deal_status", "confirmed");
  const monthSet = new Set(months);
  const events: CommissionEvent[] = [];
  for (const d of deals || []) {
    const sd = (Array.isArray(d.campaign) ? d.campaign[0] : d.campaign)?.start_date;
    const period = sd ? String(sd).slice(0, 7) : null;
    if (!period || !monthSet.has(period)) continue;
    if (!d.influencer_id || !(Number(d.total_deal_value) > 0)) continue;
    events.push({
      creator_key: `inf:${d.influencer_id}`,
      influencer_id: d.influencer_id,
      legacy_affiliate_id: null,
      event_type: "paid_collab",
      source_type: "campaign_deal",
      source_id: String(d.id),
      period,
      occurred_at: null,
      amount: round2(Number(d.total_deal_value)),
      rate: null,
      basis: null,
      detail: null,
    });
  }
  return events;
}

export async function syncCommissionEvents(days: number): Promise<{
  ordersScanned: number;
  ordersMatched: number;
  eventsUpserted: number;
  durationMs: number;
}> {
  const t0 = Date.now();
  const db = getAdminClient();
  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();
  if (!storeUrl || !accessToken) throw new Error("Shopify credentials missing");

  const owners = await loadCodeOwners(db);
  if (owners.size === 0) return { ordersScanned: 0, ordersMatched: 0, eventsUpserted: 0, durationMs: Date.now() - t0 };

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  since.setUTCHours(0, 0, 0, 0);

  const events: CommissionEvent[] = [];
  let scanned = 0;
  let matched = 0;
  let pageUrl: string | null =
    `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250` +
    `&updated_at_min=${since.toISOString()}` +
    `&fields=id,order_number,created_at,subtotal_price,discount_codes,refunds`;
  while (pageUrl) {
    const res = await fetchRetry(pageUrl, {
      headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`Shopify orders page failed: ${res.status}`);
    const data = await res.json();
    for (const order of data.orders || []) {
      scanned++;
      const codes = (order.discount_codes || [])
        .map((dc: any) => dc.code?.toUpperCase())
        .filter((c: string) => c && owners.has(c));
      if (!codes.length) continue;
      matched++;
      const period = (order.created_at || "").slice(0, 7);
      if (!period) continue;
      const gross = round2(parseFloat(order.subtotal_price || "0"));
      let refund = 0;
      for (const r of order.refunds || [])
        for (const li of r.refund_line_items || []) refund += parseFloat(li.subtotal || "0");
      refund = round2(refund);
      for (const code of codes) {
        for (const o of owners.get(code)!) {
          const base = {
            creator_key: o.creatorKey,
            influencer_id: o.influencerId,
            legacy_affiliate_id: o.legacyAffiliateId,
            period,
            occurred_at: order.created_at,
            rate: o.rate,
          };
          if (gross > 0) {
            events.push({
              ...base,
              event_type: "affiliate",
              source_type: "shopify_order",
              source_id: String(order.id),
              amount: round2(gross * o.rate),
              basis: gross,
              detail: { order_number: order.order_number, gross },
            });
          }
          if (refund > 0) {
            events.push({
              ...base,
              event_type: "refund",
              source_type: "shopify_refund",
              source_id: String(order.id), // upserts to the order's latest total refund
              amount: round2(-refund * o.rate),
              basis: refund,
              detail: { order_number: order.order_number, refund },
            });
          }
        }
      }
    }
    const link = res.headers.get("Link");
    const m = link && link.includes('rel="next"') ? link.match(/<([^>]+)>;\s*rel="next"/) : null;
    pageUrl = m ? m[1] : null;
  }

  const months = monthsInWindow(since);
  events.push(...(await buildAdSpendEvents(db, months)));
  events.push(...(await buildPaidCollabEvents(db, months)));

  const eventsUpserted = await upsertEvents(events);
  return { ordersScanned: scanned, ordersMatched: matched, eventsUpserted, durationMs: Date.now() - t0 };
}

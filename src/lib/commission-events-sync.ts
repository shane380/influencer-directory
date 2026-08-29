import { getAdminClient } from "./admin-auth";
import { getShopifyAccessToken, getShopifyStoreUrl } from "./shopify";
import { CommissionEvent, upsertEvents } from "./commission-ledger";
import { loadCommissionRateSchedule, type RateSubject } from "./affiliate-program";
import { buildDealMilestoneEvents, DEAL_MILESTONE_SOURCE } from "./deal-milestones";

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
  // The rate is NOT a property of the owner — it depends on the month the order
  // fell in. `subject` identifies whose schedule to read; the scalar is only the
  // fallback for months before any scheduled rate.
  subject: RateSubject;
  fallbackRatePercent: number;
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
      subject: { legacyAffiliateId: la.id },
      fallbackRatePercent: Number(la.commission_rate) || 25,
    });
  }

  const { data: creators } = await (db.from("creators") as any)
    .select("id, affiliate_code, commission_rate, invite_id")
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
      subject: { creatorId: c.id },
      fallbackRatePercent: Number(c.commission_rate) || Number(inv.ad_spend_percentage) || 10,
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
  // Deliberately NOT on the affiliate rate schedule: ad-spend percentage is a
  // separate commercial term, and wiring it here would make an affiliate rate
  // change silently move someone's ad-spend earnings too.
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

// Deal milestones: one event per earned installment, in the month it earned.
// Replaces the old one-lump-per-deal shape, which could not represent a 50/50
// split and pinned the whole amount to the campaign's start month. Covers both
// one-off collabs and retainers — the old retainer exclusion existed only to
// avoid double-counting against the lump, which no longer exists.
async function buildDealEvents(db: any): Promise<CommissionEvent[]> {
  const { data: deals } = await (db.from("campaign_deals") as any)
    .select("id, influencer_id, deal_kind, deal_status, whitelisting_status, total_deal_value, starts_on, payment_terms")
    // Committed deals: active AND closed. A closed deal was still delivered and
    // still earned — filtering it out would silently drop its earnings.
    .in("deal_status", ["active", "closed"]);
  return buildDealMilestoneEvents(deals || []);
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
  const rateSchedule = await loadCommissionRateSchedule(db);

  // Orders an admin has excluded from commission — coupon-site redemptions,
  // self-referrals, fraud (Creator Terms s13.5/s13.8). The audit tool wrote
  // these but the ledger never read them, so an excluded order kept paying on
  // the surface payments actually run from. Keyed by influencer, matching how
  // the audit records them.
  const { data: exclRows } = await (db.from("excluded_affiliate_orders") as any)
    .select("influencer_id, order_id");
  const excluded = new Set<string>((exclRows || []).map((r: any) => `${r.influencer_id}:${r.order_id}`));
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
    `&fields=id,order_number,created_at,cancelled_at,taxes_included,total_tax,subtotal_price,discount_codes,refunds`;
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
      // The ledger starts 2026-01; earlier months were settled in the GoAffPro
      // era with no payouts recorded here, so importing them (e.g. via a
      // wide-window manual run) would show long-paid money as outstanding.
      if (period < "2026-01") continue;

      // A cancelled order earns nothing (Creator Terms s13.8). Refunded
      // cancellations already claw back through the refund event, but a
      // voided-payment cancellation has no refund object and would keep its
      // commission forever. Retract whatever this order already wrote and move
      // on — cancelling bumps updated_at, so the order is guaranteed to pass
      // through this scan.
      if (order.cancelled_at) {
        await (db.from("commission_events") as any)
          .delete()
          .in("event_type", ["affiliate", "refund"])
          .eq("source_type", "shopify_order")
          .eq("source_id", String(order.id));
        await (db.from("commission_events") as any)
          .delete()
          .eq("event_type", "refund")
          .eq("source_type", "shopify_refund")
          .eq("source_id", String(order.id));
        continue;
      }

      // subtotal_price excludes shipping always, and excludes tax only while
      // the store prices tax-exclusive. Guard the basis so a change to that
      // Shopify setting cannot silently put sales tax into commissions.
      let gross = round2(parseFloat(order.subtotal_price || "0"));
      if (order.taxes_included) {
        gross = round2(Math.max(0, gross - parseFloat(order.total_tax || "0")));
      }
      let refund = 0;
      for (const r of order.refunds || [])
        for (const li of r.refund_line_items || []) refund += parseFloat(li.subtotal || "0");
      refund = round2(refund);
      for (const code of codes) {
        for (const o of owners.get(code)!) {
          if (o.influencerId && excluded.has(`${o.influencerId}:${order.id}`)) continue;
          // Rate in force for the ORDER's month, not today's. This is what makes
          // a re-sync of an old order idempotent: (subject, period) is a pure
          // function, so the upsert rewrites an identical rate and amount
          // instead of quietly repricing history.
          const rate = rateSchedule.rateForMonth(o.subject, period, o.fallbackRatePercent) / 100;
          const base = {
            creator_key: o.creatorKey,
            influencer_id: o.influencerId,
            legacy_affiliate_id: o.legacyAffiliateId,
            period,
            occurred_at: order.created_at,
            rate,
          };
          if (gross > 0) {
            events.push({
              ...base,
              event_type: "affiliate",
              source_type: "shopify_order",
              source_id: String(order.id),
              amount: round2(gross * rate),
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
              amount: round2(-refund * rate),
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
  // Deal-milestone pass is delete-then-insert rather than upsert: a cleared
  // delivery tick must REMOVE its event, which an upsert can never do. Also
  // sweeps the retired campaign_deal lumps the milestone events replace. Build
  // BEFORE deleting so a failed read leaves the existing events untouched.
  events.push(...(await buildDealEvents(db)));
  await (db.from("commission_events") as any).delete().in("source_type", ["campaign_deal", DEAL_MILESTONE_SOURCE]);

  // Retract ledger events for orders excluded since they were written. The
  // upsert cannot remove a row, and an old order outside the scan window would
  // never be revisited at all.
  for (const r of exclRows || []) {
    if (!r.influencer_id || !r.order_id) continue;
    await (db.from("commission_events") as any)
      .delete()
      .eq("influencer_id", r.influencer_id)
      .in("event_type", ["affiliate", "refund"])
      .eq("source_id", String(r.order_id));
  }

  const eventsUpserted = await upsertEvents(events);
  return { ordersScanned: scanned, ordersMatched: matched, eventsUpserted, durationMs: Date.now() - t0 };
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";
import { isTestEnv } from "@/lib/payout-env";
import { fetchAllRows } from "@/lib/partnerships/paginate";
import { allocatePayments } from "@/lib/payout-allocation";
import { dueDateForPeriod, dueState } from "@/lib/payment-due";
import { milestonePayments } from "@/lib/deal-milestones";

// Consolidated per-creator payments for a period, derived from the ledgers:
//   earned  = SUM(commission_events.amount) in the period (refunds are negative)
//   paid    = the slice of the creator's payouts FIFO-allocated to the period
//             (same allocation as the History drawer — pinned covers_period
//             payments settle their month first, pooled payments fill oldest
//             unpaid months first), NOT just payouts tagged with the period
//   balance = earned − paid
// One row per creator: a creator's partner (inf:) and legacy (legacy:) streams
// merge by influencer_id; legacy affiliates with no influencer stand alone.
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const period = request.nextUrl.searchParams.get("period");
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: "period required (YYYY-MM)" }, { status: 400 });
  }
  const db = getAdminClient();

  const events = await fetchAllRows<any>((from, to) =>
    (db.from("commission_events") as any)
      .select("influencer_id, legacy_affiliate_id, event_type, source_type, amount, basis, rate, detail")
      .eq("period", period)
      .order("id")
      .range(from, to),
  );

  // Group by consolidation key: influencer_id, else legacy:<id>.
  type Grp = {
    key: string; influencerId: string | null; legacyAffiliateId: string | null;
    retainer: number; adSpend: number; affiliate: number; oneOff: number; usageFees: number;
    adBasis: number; affGross: number; affRefunds: number; affOrders: number;
    adRate: number; affRate: number;
    adRates: Set<number>; affRates: Set<number>;
    adjustments: { amount: number; description: string }[];
  };
  const groups = new Map<string, Grp>();
  for (const e of events || []) {
    const key = e.influencer_id ? `inf:${e.influencer_id}` : `legacy:${e.legacy_affiliate_id}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, influencerId: e.influencer_id || null, legacyAffiliateId: e.legacy_affiliate_id || null,
        retainer: 0, adSpend: 0, affiliate: 0, oneOff: 0, usageFees: 0, adBasis: 0, affGross: 0, affRefunds: 0, affOrders: 0, adRate: 0, affRate: 0,
        adRates: new Set<number>(), affRates: new Set<number>(), adjustments: [] };
      groups.set(key, g);
    }
    // a group may pick up legacy_affiliate_id from legacy events even when keyed by influencer
    if (e.legacy_affiliate_id) g.legacyAffiliateId = e.legacy_affiliate_id;
    const amt = Number(e.amount) || 0;
    if (e.event_type === "retainer") {
      // Usage-rights whitelisting fees share the Whitelisting column with the
      // ad-spend commission, but stay a separate figure: the breakdown modal
      // proves the commission as spend × rate, and a flat fee has no rate.
      if (e.detail?.category === "whitelisting") g.usageFees += amt;
      else g.retainer += amt;
    }
    // One-off fees (paid collabs, whitelisting buyouts). Previously fell through
    // every branch, so the money existed in the ledger but appeared nowhere on
    // this page and was missing from Earned.
    else if (e.event_type === "paid_collab") g.oneOff += amt;
    else if (e.event_type === "ad_spend") { g.adSpend += amt; g.adBasis += Number(e.basis) || 0; if (e.rate != null) g.adRates.add(Number(e.rate)); }
    else if (e.event_type === "affiliate") { g.affiliate += amt; g.affGross += Number(e.basis) || 0; g.affOrders += 1; if (e.rate != null) g.affRates.add(Number(e.rate)); }
    else if (e.event_type === "refund") {
      g.affiliate += amt;
      if (e.source_type === "manual_adjustment") {
        g.adjustments.push({ amount: amt, description: e.detail?.description || "Manual adjustment" });
      } else {
        g.affRefunds += Number(e.basis) || 0;
      }
    }
  }

  // Paid for this period = FIFO allocation over each creator's FULL history
  // (all periods' earnings + all payouts), then take this period's slice.
  // Most payouts are recorded from the History drawer as a pool with no
  // covers_period, so matching on the tag alone shows creators as unpaid
  // forever — the double-payment bug this replaces.
  const allEvents = await fetchAllRows<any>((from, to) =>
    (db.from("commission_events") as any)
      .select("influencer_id, legacy_affiliate_id, period, amount")
      .order("id")
      .range(from, to),
  );
  const allPayouts = await fetchAllRows<any>((from, to) =>
    (db.from("creator_payouts") as any)
      .select("influencer_id, legacy_affiliate_id, amount, covers_period")
      .eq("is_test", isTestEnv())
      .order("id")
      .range(from, to),
  );
  // Deal payments live on the deal (the paid tick on the collabs page), not in
  // creator_payouts — without them every milestone-paid deal reads as unpaid.
  const { data: dealRows } = await (db.from("campaign_deals") as any)
    .select("id, influencer_id, deal_kind, deal_status, whitelisting_status, total_deal_value, starts_on, payment_terms")
    .in("deal_status", ["active", "closed"]);
  const dealPays = milestonePayments(dealRows || []);

  // Promised payments (invoice received, pay date agreed). Intentions, never
  // counted as paid — shown so a planned row doesn't read as bare overdue.
  let schedulesByKey = new Map<string, any>();
  try {
    const { data: scheds } = await (db.from("payment_schedules") as any)
      .select("id, influencer_id, legacy_affiliate_id, amount, scheduled_for, note")
      .is("cleared_at", null);
    for (const sc of scheds || []) {
      const key = sc.influencer_id ? `inf:${sc.influencer_id}` : `legacy:${sc.legacy_affiliate_id}`;
      schedulesByKey.set(key, sc);
    }
  } catch { /* table not migrated yet — feature no-ops */ }

  const keyOf = (r: any) => (r.influencer_id ? `inf:${r.influencer_id}` : `legacy:${r.legacy_affiliate_id}`);
  const payoutsByKeyExtra = new Map<string, any[]>();
  for (const dp of dealPays) {
    const key = `inf:${dp.influencer_id}`;
    if (!payoutsByKeyExtra.has(key)) payoutsByKeyExtra.set(key, []);
    payoutsByKeyExtra.get(key)!.push({ amount: dp.amount, covers_period: dp.covers_period });
  }
  const earnedByKeyMonth = new Map<string, Map<string, number>>();
  for (const e of allEvents) {
    const key = keyOf(e);
    let m = earnedByKeyMonth.get(key);
    if (!m) { m = new Map(); earnedByKeyMonth.set(key, m); }
    m.set(e.period, (m.get(e.period) || 0) + (Number(e.amount) || 0));
  }
  const payoutsByKey = new Map<string, any[]>();
  for (const p of allPayouts) {
    const key = keyOf(p);
    if (!payoutsByKey.has(key)) payoutsByKey.set(key, []);
    payoutsByKey.get(key)!.push(p);
  }
  const paidByKey = new Map<string, number>();
  for (const g of groups.values()) {
    // merge the group's inf: and legacy: streams, same as the history endpoint
    const keys = [...new Set([g.influencerId && `inf:${g.influencerId}`, g.legacyAffiliateId && `legacy:${g.legacyAffiliateId}`].filter(Boolean))] as string[];
    const monthTotals = new Map<string, number>();
    const payments: any[] = [];
    for (const k of keys) {
      for (const [p, amt] of earnedByKeyMonth.get(k) || []) monthTotals.set(p, (monthTotals.get(p) || 0) + amt);
      payments.push(...(payoutsByKey.get(k) || []), ...(payoutsByKeyExtra.get(k) || []));
    }
    const earnedByMonth = [...monthTotals.entries()].map(([p, amount]) => ({ period: p, amount }));
    const { paidByMonth } = allocatePayments(earnedByMonth, payments);
    paidByKey.set(g.key, paidByMonth[period] || 0);
  }

  // Names / handles / payment info.
  const infIds = [...new Set([...groups.values()].map((g) => g.influencerId).filter(Boolean))] as string[];
  const legIds = [...new Set([...groups.values()].map((g) => g.legacyAffiliateId).filter(Boolean))] as string[];
  const { data: infs } = await (db.from("influencers") as any)
    .select("id, name, instagram_handle, profile_photo_url").in("id", infIds.length ? infIds : ["x"]);
  const infMap = new Map<string, any>((infs || []).map((i: any) => [i.id, i]));
  const { data: legs } = await (db.from("legacy_affiliates") as any)
    .select("id, name, discount_code, payment_method, payment_detail").in("id", legIds.length ? legIds : ["x"]);
  const legMap = new Map<string, any>((legs || []).map((l: any) => [l.id, l]));
  // payment info for partner influencers (via invite → creator)
  const { data: invites } = infIds.length
    ? await (db.from("creator_invites") as any).select("influencer_id, creators:creators!creators_invite_id_fkey(payment_method, paypal_email, bank_institution)").in("influencer_id", infIds)
    : { data: [] };
  const payByInf = new Map<string, any>();
  for (const inv of invites || []) {
    const c = Array.isArray(inv.creators) ? inv.creators[0] : inv.creators;
    if (!c) continue;
    // Multi-invite influencers: keep the record the creator maintains, not
    // whichever invite iterated last.
    const prev = payByInf.get(inv.influencer_id);
    const better = !prev
      || (!prev.payment_method && c.payment_method)
      || (c.payment_method && String(c.payment_updated_at || "") > String(prev.payment_updated_at || ""));
    if (better) payByInf.set(inv.influencer_id, c);
  }

  // Every method value the creator portal can save, not just the first two.
  // e_transfer rendering as "Bank" was a lie to whoever runs the payment.
  const METHOD_LABEL: Record<string, string> = {
    paypal: "PayPal", e_transfer: "E-Transfer", bank: "Bank",
    us_ach: "Bank (US ACH)", ca_eft: "Bank (CA EFT)", intl_wire: "Wire",
  };

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const maskPay = (g: Grp): string => {
    // Partner creator payment method first…
    if (g.influencerId) {
      const c = payByInf.get(g.influencerId);
      if (c?.payment_method) {
        const label = METHOD_LABEL[c.payment_method] || c.payment_method;
        const detail = (c.payment_method === "paypal" || c.payment_method === "e_transfer") ? c.paypal_email : c.bank_institution;
        return detail ? `${label} · ${detail}` : label;
      }
    }
    // …else fall back to the legacy affiliate's payment info.
    const l = g.legacyAffiliateId ? legMap.get(g.legacyAffiliateId) : null;
    if (l?.payment_method) {
      return l.payment_method === "paypal" ? `PayPal · ${l.payment_detail || "—"}` : `Bank · ${l.payment_detail || ""}`;
    }
    return "No payment method";
  };

  const creators = [...groups.values()].map((g) => {
    const inf = g.influencerId ? infMap.get(g.influencerId) : null;
    const leg = g.legacyAffiliateId ? legMap.get(g.legacyAffiliateId) : null;
    const earned = round2(g.retainer + g.adSpend + g.affiliate + g.oneOff + g.usageFees);
    const paid = round2(paidByKey.get(g.key) || 0);
    return {
      key: g.key,
      influencerId: g.influencerId,
      legacyAffiliateId: g.legacyAffiliateId,
      name: (inf as any)?.name || (leg as any)?.name || "Unknown",
      handle: (inf as any)?.instagram_handle || (leg as any)?.discount_code || "",
      photo: (inf as any)?.profile_photo_url || null,
      payInfo: maskPay(g),
      retainer: round2(g.retainer),
      oneOff: round2(g.oneOff),
      usageFees: round2(g.usageFees),
      adjustments: g.adjustments,
      schedule: schedulesByKey.get(g.key) || null,
      adSpend: round2(g.adSpend),
      affiliate: round2(g.affiliate),
      earned,
      paid,
      balance: round2(earned - paid),
      // verify-the-math detail. Where a group carries more than one rate — a
      // person holding both a partner code and a legacy code — report the
      // blended rate, which reconciles against the commission shown next to it.
      // Reporting one of the two would not.
      adRate: g.adRates.size === 1 ? [...g.adRates][0] : (g.adBasis > 0 ? g.adSpend / g.adBasis : 0),
      adRateMixed: g.adRates.size > 1,
      adBasis: round2(g.adBasis),
      affRate: g.affRates.size === 1
        ? [...g.affRates][0]
        : ((g.affGross - g.affRefunds) > 0 ? g.affiliate / (g.affGross - g.affRefunds) : 0),
      affRateMixed: g.affRates.size > 1,
      affOrders: g.affOrders, affGross: round2(g.affGross), affRefunds: round2(g.affRefunds),
    };
  }).filter((c) => Math.abs(c.earned) > 0.005 || c.paid > 0)
    .sort((a, b) => b.balance - a.balance);

  const totalOwed = round2(creators.reduce((s, c) => s + c.earned, 0));
  const totalPaid = round2(creators.reduce((s, c) => s + c.paid, 0));

  // Deadline for this period, per Creator Terms s6. Server-side so every viewer
  // sees the same date regardless of their clock.
  const dueDate = dueDateForPeriod(period);
  const overdueCount = creators.filter((c) => dueState(period, c.balance) === "overdue").length;

  // Did a scheduled commission change land at the start of this period? Asked of
  // the data rather than hardcoding a date, so the note appears for any future
  // change too — and so a month where amounts drop reads as intended rather
  // than as a bug.
  const { data: startingRates } = await (db.from("affiliate_commission_rates") as any)
    .select("commission_rate")
    .eq("effective_from", `${period}-01`);
  const changedRates: number[] = [...new Set<number>((startingRates || []).map((r: any) => Number(r.commission_rate)))];
  const rateChange = changedRates.length
    ? { count: (startingRates || []).length, rates: changedRates.sort((a, b) => a - b) }
    : null;

  return NextResponse.json({
    creators,
    totalOwed,
    totalPaid,
    outstanding: round2(totalOwed - totalPaid),
    period,
    dueDate,
    overdueCount,
    rateChange,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";
import { isTestEnv } from "@/lib/payout-env";
import { fetchAllRows } from "@/lib/partnerships/paginate";
import { allocatePayments } from "@/lib/payout-allocation";

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
      .select("influencer_id, legacy_affiliate_id, event_type, amount, basis, rate, detail")
      .eq("period", period)
      .order("id")
      .range(from, to),
  );

  // Group by consolidation key: influencer_id, else legacy:<id>.
  type Grp = {
    key: string; influencerId: string | null; legacyAffiliateId: string | null;
    retainer: number; adSpend: number; affiliate: number;
    adBasis: number; affGross: number; affRefunds: number; affOrders: number;
    adRate: number; affRate: number;
  };
  const groups = new Map<string, Grp>();
  for (const e of events || []) {
    const key = e.influencer_id ? `inf:${e.influencer_id}` : `legacy:${e.legacy_affiliate_id}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, influencerId: e.influencer_id || null, legacyAffiliateId: e.legacy_affiliate_id || null,
        retainer: 0, adSpend: 0, affiliate: 0, adBasis: 0, affGross: 0, affRefunds: 0, affOrders: 0, adRate: 0, affRate: 0 };
      groups.set(key, g);
    }
    // a group may pick up legacy_affiliate_id from legacy events even when keyed by influencer
    if (e.legacy_affiliate_id) g.legacyAffiliateId = e.legacy_affiliate_id;
    const amt = Number(e.amount) || 0;
    if (e.event_type === "retainer") g.retainer += amt;
    else if (e.event_type === "ad_spend") { g.adSpend += amt; g.adBasis += Number(e.basis) || 0; g.adRate = Number(e.rate) || g.adRate; }
    else if (e.event_type === "affiliate") { g.affiliate += amt; g.affGross += Number(e.basis) || 0; g.affOrders += 1; g.affRate = Number(e.rate) || g.affRate; }
    else if (e.event_type === "refund") { g.affiliate += amt; g.affRefunds += Number(e.basis) || 0; }
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
  const keyOf = (r: any) => (r.influencer_id ? `inf:${r.influencer_id}` : `legacy:${r.legacy_affiliate_id}`);
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
      payments.push(...(payoutsByKey.get(k) || []));
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
    if (c) payByInf.set(inv.influencer_id, c);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const maskPay = (g: Grp): string => {
    // Partner creator payment method first…
    if (g.influencerId) {
      const c = payByInf.get(g.influencerId);
      if (c?.payment_method) {
        return c.payment_method === "paypal" ? `PayPal · ${c.paypal_email || "—"}` : `Bank${c.bank_institution ? " · " + c.bank_institution : ""}`;
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
    const earned = round2(g.retainer + g.adSpend + g.affiliate);
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
      adSpend: round2(g.adSpend),
      affiliate: round2(g.affiliate),
      earned,
      paid,
      balance: round2(earned - paid),
      // verify-the-math detail
      adRate: g.adRate, adBasis: round2(g.adBasis),
      affRate: g.affRate, affOrders: g.affOrders, affGross: round2(g.affGross), affRefunds: round2(g.affRefunds),
    };
  }).filter((c) => Math.abs(c.earned) > 0.005 || c.paid > 0)
    .sort((a, b) => b.balance - a.balance);

  const totalOwed = round2(creators.reduce((s, c) => s + c.earned, 0));
  const totalPaid = round2(creators.reduce((s, c) => s + c.paid, 0));
  return NextResponse.json({ creators, totalOwed, totalPaid, outstanding: round2(totalOwed - totalPaid) });
}

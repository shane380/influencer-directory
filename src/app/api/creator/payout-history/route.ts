import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/admin-auth";
import { resolveAffiliateContext } from "@/lib/affiliate-context";
import { fetchAllRows } from "@/lib/partnerships/paginate";
import { allocatePayments } from "@/lib/payout-allocation";
import { milestoneAmount, milestoneEarnedOn, isCommittedDeal } from "@/lib/deal-milestones";
import { reconstructReceipts, periodLabel } from "@/lib/payout-receipt";

// GET /api/creator/payout-history[?creator_id=...]
// Payments the creator has ACTUALLY received: transfers from the
// creator_payouts ledger plus deal installments paid on the deal itself. Each
// carries a receipt — what the money settled. Deliberately does NOT show a
// balance or anything owed: paid money is settled fact; owed money is a moving
// claim we do not hand creators as a screenshot.
export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const isAdmin = user.user_metadata?.role !== "creator";
  const creatorId = request.nextUrl.searchParams.get("creator_id");

  const ctx = await resolveAffiliateContext({ userId: user.id, creatorId, isAdmin });
  if (!ctx || (!ctx.influencerId && !ctx.legacyAffiliateId)) {
    return NextResponse.json({ payments: [], totalPaid: 0 });
  }

  const db = getAdminClient();

  // Legacy payouts are keyed by legacy_affiliate_id, partner payouts by
  // influencer_id — match on either identity.
  const orFilters: string[] = [];
  if (ctx.influencerId) orFilters.push(`influencer_id.eq.${ctx.influencerId}`);
  if (ctx.legacyAffiliateId) orFilters.push(`legacy_affiliate_id.eq.${ctx.legacyAffiliateId}`);

  // The receipt column may not be migrated yet — fall back to the bare list.
  let rows: any[] | null = null;
  {
    const withReceipt = await (db.from("creator_payouts") as any)
      .select("amount, sent_at, method, reference, covers_period, receipt")
      .or(orFilters.join(","))
      .eq("is_test", false) // creators only ever see real payments
      .order("sent_at", { ascending: false });
    if (!withReceipt.error) rows = withReceipt.data;
    else {
      const bare = await (db.from("creator_payouts") as any)
        .select("amount, sent_at, method, reference, covers_period")
        .or(orFilters.join(","))
        .eq("is_test", false)
        .order("sent_at", { ascending: false });
      rows = bare.data;
    }
  }

  // Deal installments are paid on the deal (the milestone tick), not in
  // creator_payouts — without them the list omits real money received.
  const dealEntries: any[] = [];
  const dealPayments: { amount: number; covers_period: string }[] = [];
  if (ctx.influencerId) {
    const { data: deals } = await (db.from("campaign_deals") as any)
      .select("id, influencer_id, deal_kind, deal_status, whitelisting_status, total_deal_value, starts_on, payment_terms")
      .eq("influencer_id", ctx.influencerId)
      .in("deal_status", ["active", "closed"]);
    for (const d of deals || []) {
      if (!isCommittedDeal(d)) continue;
      for (const m of d.payment_terms || []) {
        if (!m.is_paid) continue;
        const amount = milestoneAmount(m, d);
        if (amount <= 0) continue;
        const earned = milestoneEarnedOn(m, d);
        if (earned) dealPayments.push({ amount, covers_period: earned.slice(0, 7) });
        dealEntries.push({
          kind: "deal",
          amount,
          sent_at: m.paid_date || null,
          method: null,
          reference: null,
          receipt: {
            version: 1,
            lines: [{
              period: earned ? earned.slice(0, 7) : null,
              label: `${d.deal_kind === "retainer" ? "Deal installment" : "Collaboration"} — ${m.description || "installment"}${earned ? ` (${periodLabel(earned.slice(0, 7))})` : ""}`,
              amount,
            }],
          },
        });
      }
    }
  }

  // Payouts recorded before receipts existed get a reconstruction from the
  // current allocation, labelled as such — the same replay both admin views use.
  const needsReconstruction = (rows || []).some((r: any) => !r.receipt);
  if (needsReconstruction) {
    const events = await fetchAllRows<any>((from, to) =>
      (db.from("commission_events") as any)
        .select("period, amount")
        .or(orFilters.join(","))
        .order("id")
        .range(from, to));
    const totals = new Map<string, number>();
    for (const e of events) totals.set(e.period, (totals.get(e.period) || 0) + (Number(e.amount) || 0));
    const earnedByMonth = [...totals.entries()].map(([period, amount]) => ({ period, amount: Math.round(amount * 100) / 100 }));
    // Reserve the deal-settled months first so pooled payouts do not claim them.
    const { paidByMonth } = allocatePayments(earnedByMonth, dealPayments);
    const commissionMonths = earnedByMonth
      .map((m) => ({ period: m.period, amount: Math.round((m.amount - (paidByMonth[m.period] || 0)) * 100) / 100 }))
      .filter((m) => m.amount > 0.005);
    const receipts = reconstructReceipts(commissionMonths, rows || []);
    (rows || []).forEach((r: any, i: number) => { if (!r.receipt) r.receipt = receipts[i]; });
  }

  const payments = [
    ...(rows || []).map((r: any) => ({
      kind: "transfer",
      amount: Number(r.amount) || 0,
      sent_at: r.sent_at,
      method: r.method || null,
      reference: r.reference || null,
      receipt: r.receipt || null,
    })),
    ...dealEntries,
  ].sort((a, b) => String(b.sent_at || "").localeCompare(String(a.sent_at || "")));

  const totalPaid = payments.reduce((s: number, p: any) => s + p.amount, 0);

  return NextResponse.json({
    payments,
    totalPaid: Math.round(totalPaid * 100) / 100,
  });
}

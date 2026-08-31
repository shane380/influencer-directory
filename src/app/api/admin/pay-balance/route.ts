import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";
import { isTestEnv } from "@/lib/payout-env";
import {
  isCommittedDeal,
  milestoneAmount,
  milestoneEarnedOn,
} from "@/lib/deal-milestones";

// One transfer, recorded once. Deal money settles on the deal (milestone
// ticks) and commission money settles in creator_payouts — recording a mixed
// transfer in either place alone under- or double-counts it. This endpoint is
// the single entry point: it ticks every unpaid earned milestone the amount
// fully covers (oldest earned first) and books only the remainder as a payout
// row, so each dollar lands in exactly one ledger.
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  const { influencer_id, legacy_affiliate_id, amount, sent_at, method, reference, note } = body;
  if (!influencer_id && !legacy_affiliate_id) {
    return NextResponse.json({ error: "influencer_id or legacy_affiliate_id required" }, { status: 400 });
  }
  if (influencer_id && legacy_affiliate_id) {
    return NextResponse.json({ error: "Provide only one of influencer_id / legacy_affiliate_id" }, { status: 400 });
  }
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: "amount must be a positive number" }, { status: 400 });
  }
  if (!sent_at) return NextResponse.json({ error: "sent_at required" }, { status: 400 });

  const db = getAdminClient();
  const round2 = (n: number) => Math.round(n * 100) / 100;

  let remaining = amt;
  const ticked: { deal_id: string; milestone_id: string; amount: number }[] = [];

  if (influencer_id) {
    const { data: deals } = await (db.from("campaign_deals") as any)
      .select("id, influencer_id, deal_kind, deal_status, whitelisting_status, total_deal_value, starts_on, payment_terms")
      .eq("influencer_id", influencer_id)
      .in("deal_status", ["active", "closed"]);

    // Every unpaid milestone that has actually earned, oldest earned first —
    // unearned milestones are not owed and never consume the payment.
    const candidates: { deal: any; m: any; earned: string; amount: number }[] = [];
    for (const d of deals || []) {
      if (!isCommittedDeal(d)) continue;
      for (const m of d.payment_terms || []) {
        if (m.is_paid) continue;
        const earned = milestoneEarnedOn(m, d);
        if (!earned) continue;
        const mAmt = milestoneAmount(m, d);
        if (mAmt <= 0) continue;
        candidates.push({ deal: d, m, earned, amount: mAmt });
      }
    }
    candidates.sort((a, b) => a.earned.localeCompare(b.earned));

    const tickedByDeal = new Map<string, Set<string>>();
    for (const c of candidates) {
      if (c.amount > remaining + 0.005) continue; // a milestone is paid whole or not at all
      remaining = round2(remaining - c.amount);
      if (!tickedByDeal.has(c.deal.id)) tickedByDeal.set(c.deal.id, new Set());
      tickedByDeal.get(c.deal.id)!.add(c.m.id);
      ticked.push({ deal_id: c.deal.id, milestone_id: c.m.id, amount: c.amount });
    }

    for (const [dealId, milestoneIds] of tickedByDeal) {
      const deal = (deals || []).find((d: any) => d.id === dealId);
      const newTerms = (deal.payment_terms || []).map((m: any) =>
        milestoneIds.has(m.id) ? { ...m, is_paid: true, paid_date: sent_at, paid_by: admin.id } : m
      );
      const allPaid = newTerms.every((m: any) => m.is_paid);
      const somePaid = newTerms.some((m: any) => m.is_paid);
      const { error } = await (db.from("campaign_deals") as any)
        .update({
          payment_terms: newTerms,
          payment_status: allPaid ? "paid_in_full" : somePaid ? "deposit_paid" : "not_paid",
          updated_by: admin.id,
        })
        .eq("id", dealId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Whatever the milestones did not absorb is commission money (affiliate,
  // ad-spend share, usage fees) — one pooled payout row; FIFO allocation
  // spreads it over the oldest unpaid months.
  let payout: any = null;
  if (remaining > 0.005) {
    const { data, error } = await (db.from("creator_payouts") as any)
      .insert({
        influencer_id: influencer_id || null,
        legacy_affiliate_id: legacy_affiliate_id || null,
        amount: remaining,
        sent_at,
        method: method || null,
        reference: reference || null,
        note: note || null,
        covers_period: null,
        recorded_by: admin.email || null,
        is_test: isTestEnv(),
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    payout = data;
  }

  // Money moved — retire any active schedule chip.
  try {
    const subj = influencer_id
      ? { col: "influencer_id", val: influencer_id }
      : { col: "legacy_affiliate_id", val: legacy_affiliate_id };
    await (db.from("payment_schedules") as any)
      .update({ cleared_at: new Date().toISOString() })
      .eq(subj.col, subj.val).is("cleared_at", null);
  } catch { /* schedules table optional */ }

  await (db.from("payment_audit_log") as any).insert({
    user_id: admin.id,
    user_email: admin.email,
    action: "pay_balance",
    target_influencer_id: influencer_id || null,
    metadata: {
      amount: amt,
      sent_at,
      method: method || null,
      reference: reference || null,
      milestones: ticked,
      payout_id: payout?.id || null,
      payout_amount: payout ? Number(payout.amount) : 0,
      legacy_affiliate_id: legacy_affiliate_id || null,
    },
  });

  return NextResponse.json({
    success: true,
    milestonesPaid: ticked.length,
    milestoneTotal: round2(ticked.reduce((s, t) => s + t.amount, 0)),
    payoutAmount: payout ? Number(payout.amount) : 0,
  });
}

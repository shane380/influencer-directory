import { NextRequest, NextResponse } from "next/server";
import { calculateAffiliateCommission } from "@/lib/affiliate";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";
import { loadCommissionRateSchedule } from "@/lib/affiliate-program";
import { buildAffiliateEvents, upsertEvents } from "@/lib/commission-ledger";

// GET: Fetch affiliate orders with attribution for audit
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const influencerId = request.nextUrl.searchParams.get("influencer_id");
  const legacyAffiliateId = request.nextUrl.searchParams.get("legacy_affiliate_id");
  const month = request.nextUrl.searchParams.get("month");

  if ((!influencerId && !legacyAffiliateId) || !month) {
    return NextResponse.json({ error: "influencer_id or legacy_affiliate_id, and month required" }, { status: 400 });
  }

  const supabase = getAdminClient();

  let affiliateCode: string;
  let rate: number;
  // The audited month must price at the rate that was in force THEN — quoting
  // today's scalar would show 25% against orders the ledger paid at 10%.
  const schedule = await loadCommissionRateSchedule(supabase);

  if (legacyAffiliateId) {
    // Legacy affiliate: look up code/rate directly
    const { data: la } = await (supabase.from as any)("legacy_affiliates")
      .select("id, discount_code, commission_rate")
      .eq("id", legacyAffiliateId)
      .single();

    if (!la) {
      return NextResponse.json({ error: "Legacy affiliate not found" }, { status: 404 });
    }

    affiliateCode = la.discount_code;
    rate = schedule.rateForMonth({ legacyAffiliateId: la.id }, month, la.commission_rate || 25);
  } else {
    // Partner affiliate. Search ALL the influencer's invites — picking one
    // arbitrarily resolved multi-invite creators to the wrong record.
    const { data: inviteRows } = await (supabase.from as any)("creator_invites")
      .select("id, commission_rate")
      .eq("influencer_id", influencerId);
    const inviteIds = (inviteRows || []).map((i: any) => i.id);
    if (!inviteIds.length) {
      return NextResponse.json({ error: "No invite found for influencer" }, { status: 404 });
    }

    const { data: creatorRows } = await (supabase.from as any)("creators")
      .select("id, affiliate_code, commission_rate, invite_id")
      .in("invite_id", inviteIds);
    const creator = (creatorRows || []).find((c: any) => c.affiliate_code);

    if (!creator?.affiliate_code) {
      return NextResponse.json({ error: "No affiliate code found" }, { status: 404 });
    }

    const inviteRate = (inviteRows || []).find((i: any) => i.id === creator.invite_id)?.commission_rate;
    affiliateCode = creator.affiliate_code;
    rate = schedule.rateForMonth({ creatorId: creator.id }, month, creator.commission_rate || inviteRate || 10);
  }

  // Get excluded order IDs (only for partner affiliates with influencer_id)
  const excludedOrderIds: number[] = [];
  const excludedReasons = new Map<number, string>();

  if (influencerId) {
    const { data: excluded } = await (supabase.from as any)("excluded_affiliate_orders")
      .select("order_id, reason")
      .eq("influencer_id", influencerId);

    for (const e of excluded || []) {
      excludedOrderIds.push(e.order_id);
      excludedReasons.set(e.order_id, e.reason);
    }
  }

  // Calculate with exclusions
  const result = await calculateAffiliateCommission(affiliateCode, month, rate / 100, excludedOrderIds);

  // Add exclusion reasons to orders
  const orders = result.orders.map((o) => ({
    ...o,
    exclusion_reason: excludedReasons.get(o.order_id) || null,
  }));

  return NextResponse.json({
    orders,
    summary: result.summary,
    affiliate_code: affiliateCode,
    commission_rate: rate,
  });
}

// POST: Exclude or include an order
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  const { influencer_id, order_id, action, reason, month, legacy_affiliate_id } = body;

  if (!influencer_id || !order_id || !action) {
    return NextResponse.json({ error: "influencer_id, order_id, and action required" }, { status: 400 });
  }

  const supabase = getAdminClient();

  if (action === "exclude") {
    const { error } = await (supabase.from as any)("excluded_affiliate_orders")
      .upsert({
        influencer_id,
        order_id,
        reason: reason || null,
        excluded_at: new Date().toISOString(),
      }, { onConflict: "influencer_id,order_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Take effect NOW, not at tomorrow's sync: retract the order's ledger
    // events so the payments page and accrual stop counting it immediately.
    await (supabase.from("commission_events") as any)
      .delete()
      .eq("influencer_id", influencer_id)
      .in("event_type", ["affiliate", "refund"])
      .eq("source_id", String(order_id));

    return NextResponse.json({ success: true });
  }

  if (action === "include") {
    const { error } = await (supabase.from as any)("excluded_affiliate_orders")
      .delete()
      .eq("influencer_id", influencer_id)
      .eq("order_id", order_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Restore the order's ledger events. The daily sync cannot do this for an
    // old order — it only rescans the recent window — so rebuild the month's
    // affiliate events here and keep just this order's.
    if (month) {
      try {
        const schedule = await loadCommissionRateSchedule(supabase);
        let owner: { creatorKey: string; influencerId: string | null; legacyAffiliateId: string | null };
        let code: string | null = null;
        let ratePct: number;
        if (legacy_affiliate_id) {
          const { data: la } = await (supabase.from as any)("legacy_affiliates")
            .select("id, discount_code, commission_rate").eq("id", legacy_affiliate_id).single();
          if (!la?.discount_code) throw new Error("legacy affiliate not found");
          owner = { creatorKey: `legacy:${la.id}`, influencerId: influencer_id, legacyAffiliateId: la.id };
          code = la.discount_code;
          ratePct = schedule.rateForMonth({ legacyAffiliateId: la.id }, month, la.commission_rate || 25);
        } else {
          const { data: inviteRows } = await (supabase.from as any)("creator_invites")
            .select("id").eq("influencer_id", influencer_id);
          const { data: creatorRows } = await (supabase.from as any)("creators")
            .select("id, affiliate_code, commission_rate")
            .in("invite_id", (inviteRows || []).map((i: any) => i.id));
          const creator = (creatorRows || []).find((c: any) => c.affiliate_code);
          if (!creator) throw new Error("no affiliate code");
          owner = { creatorKey: `inf:${influencer_id}`, influencerId: influencer_id, legacyAffiliateId: null };
          code = creator.affiliate_code;
          ratePct = schedule.rateForMonth({ creatorId: creator.id }, month, creator.commission_rate || 10);
        }
        const { data: stillExcluded } = await (supabase.from as any)("excluded_affiliate_orders")
          .select("order_id").eq("influencer_id", influencer_id);
        const events = await buildAffiliateEvents(
          owner, code!, ratePct / 100, month,
          (stillExcluded || []).map((e: any) => Number(e.order_id))
        );
        await upsertEvents(events.filter((e) => e.source_id === String(order_id)));
      } catch (e) {
        // The exclusion row is already removed; the daily sync will restore a
        // recent order even if this rebuild failed. Report it rather than hide it.
        return NextResponse.json({ success: true, warning: `re-included, but ledger rebuild failed: ${e instanceof Error ? e.message : "unknown"}` });
      }
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

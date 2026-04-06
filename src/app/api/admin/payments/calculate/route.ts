import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateAffiliateCommission, checkRefundAdjustments } from "@/lib/affiliate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET /api/admin/payments/calculate?month=2026-03
// Returns live-calculated payments merged with existing DB records
export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Determine if this is a past month (skip live Shopify for past months)
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isPastMonth = month < currentMonth;

  // 1. Fetch existing payment records (approved/paid/skipped are locked in)
  const { data: existingPayments } = await (supabase.from as any)("creator_payments")
    .select("*")
    .eq("month", month);

  // Build lookup: key = "{influencerId}-{type}[-{dealId}]" → existing row
  const existingMap = new Map<string, any>();
  for (const p of existingPayments || []) {
    const key = p.deal_id
      ? `${p.influencer_id}-${p.payment_type}-${p.deal_id}`
      : `${p.influencer_id}-${p.payment_type}`;
    existingMap.set(key, p);
  }

  // 2. Fetch all creators with invites
  const { data: creators } = await (supabase.from as any)("creators")
    .select("id, creator_name, invite_id, affiliate_code, commission_rate, payment_method, paypal_email, bank_institution, bank_account_number");

  if (!creators || creators.length === 0) {
    return NextResponse.json({ payments: [] });
  }

  // 3. Batch fetch invite data
  const inviteIds = creators.map((c: any) => c.invite_id).filter(Boolean);
  const { data: invites } = await (supabase.from as any)("creator_invites")
    .select("*, influencer:influencers!creator_invites_influencer_id_fkey(id, name, instagram_handle, profile_photo_url)")
    .in("id", inviteIds);

  const inviteMap = new Map<string, any>();
  for (const inv of invites || []) {
    inviteMap.set(inv.id, inv);
  }

  // 4. Batch fetch ad performance for all handles
  const handles = (invites || []).map((i: any) => i.influencer?.instagram_handle).filter(Boolean);
  const { data: adPerformance } = await (supabase.from("creator_ad_performance") as any)
    .select("instagram_handle, monthly")
    .in("instagram_handle", handles.length > 0 ? handles : ["__none__"]);

  const adSpendMap = new Map<string, number>();
  for (const ap of adPerformance || []) {
    const monthly = typeof ap.monthly === "string" ? JSON.parse(ap.monthly) : ap.monthly;
    const monthData = (monthly || []).find((m: any) => m.month === month);
    adSpendMap.set(ap.instagram_handle, monthData?.spend || 0);
  }

  // 5. Fetch paid collab deals for the month
  const { data: deals } = await supabase
    .from("campaign_deals")
    .select("id, influencer_id, total_deal_value, notes, campaign:campaigns!campaign_deals_campaign_id_fkey(id, name, start_date)")
    .eq("deal_status", "confirmed");

  const dealsByInfluencer = new Map<string, any[]>();
  for (const deal of deals || []) {
    const campaign = (deal as any).campaign;
    if (!campaign?.start_date) continue;
    const dealMonth = campaign.start_date.substring(0, 7);
    if (dealMonth !== month) continue;
    const arr = dealsByInfluencer.get(deal.influencer_id) || [];
    arr.push(deal);
    dealsByInfluencer.set(deal.influencer_id, arr);
  }

  // 6. Fetch excluded orders for all influencers
  const { data: allExcluded } = await (supabase.from as any)("excluded_affiliate_orders")
    .select("influencer_id, order_id");

  const excludedByInfluencer = new Map<string, number[]>();
  for (const e of allExcluded || []) {
    const arr = excludedByInfluencer.get(e.influencer_id) || [];
    arr.push(e.order_id);
    excludedByInfluencer.set(e.influencer_id, arr);
  }

  // 7. Calculate affiliate commissions
  // Past months: use stored calculation_details; only call Shopify if no existing row
  // Current month: always call Shopify live
  const affiliateResults = new Map<string, { amount: number; notes: string; details: any }>();
  const rowsToAutoInsert: any[] = []; // For persisting first-view past-month calculations

  const affiliateCreators = creators.filter((c: any) => {
    const invite = inviteMap.get(c.invite_id);
    if (!invite?.has_affiliate || !c.affiliate_code) return false;
    const key = `${invite.influencer?.id}-affiliate_commission`;
    const existing = existingMap.get(key);
    // Skip if already locked (non-pending) — regardless of past/current month
    if (existing && existing.status !== "pending") return false;
    return true;
  });

  const affiliatePromises = affiliateCreators.map(async (c: any) => {
    const invite = inviteMap.get(c.invite_id);
    const influencerId = invite.influencer.id;
    const rate = c.commission_rate || invite?.ad_spend_percentage || 10;
    const key = `${influencerId}-affiliate_commission`;
    const existing = existingMap.get(key);

    // Past month with existing row: use stored data, skip Shopify
    if (isPastMonth && existing?.calculation_details) {
      const details = existing.calculation_details;
      affiliateResults.set(influencerId, {
        amount: details.commission_owed ?? existing.amount_owed ?? 0,
        notes: existing.notes || "",
        details,
      });
      return;
    }

    // Past month with NO existing row, or current month: calculate live
    const excluded = excludedByInfluencer.get(influencerId) || [];
    try {
      const result = await calculateAffiliateCommission(c.affiliate_code, month, rate / 100, excluded);
      const detailsWithOrders = { ...result.summary, orders: result.orders };
      affiliateResults.set(influencerId, {
        amount: result.summary.commission_owed,
        notes: result.summary.order_count > 0
          ? `${result.summary.order_count} orders, $${result.summary.total_gross.toFixed(2)} gross, -$${result.summary.total_refunds.toFixed(2)} refunds, $${result.summary.total_net.toFixed(2)} net × ${rate}%`
          : "No orders this month",
        details: detailsWithOrders,
      });

      // Past month first-view: persist to DB so future loads are instant
      if (isPastMonth && !existing) {
        const paymentMethod = c.payment_method || null;
        let paymentDetail = null;
        if (paymentMethod === "paypal") paymentDetail = c.paypal_email || null;
        else if (paymentMethod) {
          const acct = c.bank_account_number || "";
          paymentDetail = acct ? `···${acct.slice(-4)}` : null;
        }
        rowsToAutoInsert.push({
          influencer_id: influencerId,
          month,
          payment_type: "affiliate_commission",
          amount_owed: result.summary.commission_owed,
          payment_method: paymentMethod,
          payment_detail: paymentDetail,
          notes: result.summary.order_count > 0
            ? `${result.summary.order_count} orders, $${result.summary.total_gross.toFixed(2)} gross, -$${result.summary.total_refunds.toFixed(2)} refunds, $${result.summary.total_net.toFixed(2)} net × ${rate}%`
            : "No orders this month",
          calculation_details: detailsWithOrders,
        });
      }
    } catch {
      affiliateResults.set(influencerId, {
        amount: 0,
        notes: "Failed to calculate — enter manually",
        details: null,
      });
    }
  });

  await Promise.all(affiliatePromises);

  // Persist first-view past-month calculations
  if (rowsToAutoInsert.length > 0) {
    const { data: inserted } = await (supabase.from as any)("creator_payments")
      .insert(rowsToAutoInsert)
      .select("*");
    // Update existingMap so the rows below get real IDs
    for (const row of inserted || []) {
      const key = `${row.influencer_id}-affiliate_commission`;
      existingMap.set(key, row);
    }
  }

  // 7b. Calculate legacy affiliate commissions
  const { data: legacyAffiliates } = await (supabase.from as any)("legacy_affiliates")
    .select("*")
    .eq("status", "active");

  const legacyResults = new Map<string, { amount: number; notes: string; details: any }>();
  const legacyRowsToInsert: any[] = [];

  const legacyPromises = (legacyAffiliates || []).map(async (la: any) => {
    const key = `${la.id}-legacy_affiliate_commission`;
    // Check existing map using legacy key format
    const existingLegacy = [...existingMap.values()].find(
      (p) => p.legacy_affiliate_id === la.id && p.payment_type === "legacy_affiliate_commission"
    );

    if (existingLegacy && existingLegacy.status !== "pending") return;

    // Past month with existing row: use stored data
    if (isPastMonth && existingLegacy?.calculation_details) {
      const details = existingLegacy.calculation_details;
      legacyResults.set(la.id, {
        amount: details.commission_owed ?? existingLegacy.amount_owed ?? 0,
        notes: existingLegacy.notes || "",
        details,
      });
      return;
    }

    // Calculate live from Shopify
    const rate = la.commission_rate || 25;
    try {
      const result = await calculateAffiliateCommission(la.discount_code, month, rate / 100, []);
      const detailsWithOrders = { ...result.summary, orders: result.orders };
      legacyResults.set(la.id, {
        amount: result.summary.commission_owed,
        notes: result.summary.order_count > 0
          ? `${result.summary.order_count} orders, $${result.summary.total_gross.toFixed(2)} gross, -$${result.summary.total_refunds.toFixed(2)} refunds, $${result.summary.total_net.toFixed(2)} net × ${rate}%`
          : "No orders this month",
        details: detailsWithOrders,
      });

      if (isPastMonth && !existingLegacy) {
        legacyRowsToInsert.push({
          legacy_affiliate_id: la.id,
          influencer_id: la.influencer_id || null,
          month,
          payment_type: "legacy_affiliate_commission",
          amount_owed: result.summary.commission_owed,
          payment_method: la.payment_method || null,
          payment_detail: la.payment_detail || null,
          notes: result.summary.order_count > 0
            ? `${result.summary.order_count} orders, $${result.summary.total_gross.toFixed(2)} gross, -$${result.summary.total_refunds.toFixed(2)} refunds, $${result.summary.total_net.toFixed(2)} net × ${rate}%`
            : "No orders this month",
          calculation_details: detailsWithOrders,
        });
      }
    } catch {
      legacyResults.set(la.id, {
        amount: 0,
        notes: "Failed to calculate — enter manually",
        details: null,
      });
    }
  });

  await Promise.all(legacyPromises);

  if (legacyRowsToInsert.length > 0) {
    await (supabase.from as any)("creator_payments")
      .insert(legacyRowsToInsert)
      .select("*");
  }

  // 8. Check previous month for new refunds (only when viewing current month)
  const refundAdjustmentPayments: any[] = [];
  if (!isPastMonth) {
    // Calculate previous month string
    const [y, m] = month.split("-").map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    // Fetch previous month's affiliate payment rows that have stored orders
    const { data: prevPayments } = await (supabase.from as any)("creator_payments")
      .select("*")
      .eq("month", prevMonth)
      .eq("payment_type", "affiliate_commission");

    // Also fetch any existing refund_adjustment rows for this month to avoid duplicates
    const { data: existingRefundAdjs } = await (supabase.from as any)("creator_payments")
      .select("influencer_id, legacy_affiliate_id, notes")
      .eq("month", month)
      .eq("payment_type", "refund_adjustment");

    const existingRefundKeys = new Set(
      (existingRefundAdjs || []).map((r: any) => r.influencer_id)
    );

    const refundPromises = (prevPayments || [])
      .filter((pp: any) => pp.calculation_details?.orders && !existingRefundKeys.has(pp.influencer_id))
      .map(async (pp: any) => {
        const storedOrders = pp.calculation_details.orders;
        const commissionRate = pp.calculation_details.commission_rate;
        if (!storedOrders || !commissionRate) return;

        // Find the creator's discount code
        const creator = creators.find((c: any) => {
          const invite = inviteMap.get(c.invite_id);
          return invite?.influencer?.id === pp.influencer_id;
        });
        if (!creator?.affiliate_code) return;

        try {
          const result = await checkRefundAdjustments(storedOrders, creator.affiliate_code, prevMonth, commissionRate);
          if (result.adjustments.length > 0 && result.total_commission_delta < -0.01) {
            const invite = inviteMap.get(creator.invite_id);
            const influencer = invite?.influencer || null;
            const paymentMethod = creator.payment_method || null;
            let paymentDetail = null;
            if (paymentMethod === "paypal") paymentDetail = creator.paypal_email || null;
            else if (paymentMethod) {
              const acct = creator.bank_account_number || "";
              paymentDetail = acct ? `···${acct.slice(-4)}` : null;
            }

            const orderNotes = result.adjustments
              .map((a) => `Refund on ${prevMonth} order #${a.order_number}`)
              .join("; ");

            // Insert the refund adjustment row
            const { data: inserted } = await (supabase.from as any)("creator_payments")
              .insert({
                influencer_id: pp.influencer_id,
                month,
                payment_type: "refund_adjustment",
                amount_owed: result.total_commission_delta,
                payment_method: paymentMethod,
                payment_detail: paymentDetail,
                notes: orderNotes,
                calculation_details: { prev_month: prevMonth, adjustments: result.adjustments },
              })
              .select("*")
              .single();

            if (inserted) {
              refundAdjustmentPayments.push({ ...inserted, influencer, deal: null });
            }
          }
        } catch {
          // Skip refund check failures silently
        }
      });

    await Promise.all(refundPromises);

    // 8b. Refund adjustments for legacy affiliates
    const { data: prevLegacyPayments } = await (supabase.from as any)("creator_payments")
      .select("*")
      .eq("month", prevMonth)
      .eq("payment_type", "legacy_affiliate_commission");

    const existingLegacyRefundKeys = new Set(
      (existingRefundAdjs || []).filter((r: any) => r.legacy_affiliate_id).map((r: any) => r.legacy_affiliate_id)
    );

    const legacyRefundPromises = (prevLegacyPayments || [])
      .filter((pp: any) => pp.calculation_details?.orders && pp.legacy_affiliate_id && !existingLegacyRefundKeys.has(pp.legacy_affiliate_id))
      .map(async (pp: any) => {
        const storedOrders = pp.calculation_details.orders;
        const commissionRate = pp.calculation_details.commission_rate;
        if (!storedOrders || !commissionRate) return;

        const la = (legacyAffiliates || []).find((l: any) => l.id === pp.legacy_affiliate_id);
        if (!la) return;

        try {
          const result = await checkRefundAdjustments(storedOrders, la.discount_code, prevMonth, commissionRate);
          if (result.adjustments.length > 0 && result.total_commission_delta < -0.01) {
            const orderNotes = result.adjustments
              .map((a) => `Refund on ${prevMonth} order #${a.order_number}`)
              .join("; ");

            const { data: inserted } = await (supabase.from as any)("creator_payments")
              .insert({
                legacy_affiliate_id: la.id,
                influencer_id: la.influencer_id || null,
                month,
                payment_type: "refund_adjustment",
                amount_owed: result.total_commission_delta,
                payment_method: la.payment_method || null,
                payment_detail: la.payment_detail || null,
                notes: orderNotes,
                calculation_details: { prev_month: prevMonth, adjustments: result.adjustments },
              })
              .select("*")
              .single();

            if (inserted) {
              refundAdjustmentPayments.push({
                ...inserted,
                influencer: null,
                deal: null,
                legacyAffiliate: { id: la.id, name: la.name, discount_code: la.discount_code, commission_rate: la.commission_rate, payment_method: la.payment_method, payment_detail: la.payment_detail },
              });
            }
          }
        } catch {
          // Skip
        }
      });

    await Promise.all(legacyRefundPromises);
  }

  // 9. Build the merged payment list
  const allPayments: any[] = [];
  const processedKeys = new Set<string>();

  for (const creator of creators) {
    if (!creator.invite_id) continue;
    const invite = inviteMap.get(creator.invite_id);
    if (!invite?.influencer) continue;

    const influencerId = invite.influencer.id;
    const handle = invite.influencer.instagram_handle;
    const influencer = invite.influencer;

    // Payment method info
    const paymentMethod = creator.payment_method || null;
    let paymentDetail = null;
    if (paymentMethod === "paypal") {
      paymentDetail = creator.paypal_email || null;
    } else if (paymentMethod) {
      const acct = creator.bank_account_number || "";
      paymentDetail = acct ? `···${acct.slice(-4)}` : null;
    }

    // Ad spend commission
    if (invite.has_ad_spend) {
      const key = `${influencerId}-ad_spend_commission`;
      const existing = existingMap.get(key);
      processedKeys.add(key);

      if (existing && existing.status !== "pending") {
        allPayments.push({ ...existing, influencer, deal: null });
      } else {
        const spend = adSpendMap.get(handle) || 0;
        const rate = (invite.ad_spend_percentage || 10) / 100;
        const amount = Math.round(spend * rate * 100) / 100;
        allPayments.push({
          id: existing?.id || `live-${influencerId}-ad_spend_commission`,
          influencer_id: influencerId,
          month,
          payment_type: "ad_spend_commission",
          amount_owed: amount,
          amount_paid: null,
          status: "pending",
          payment_method: paymentMethod,
          payment_detail: paymentDetail,
          notes: spend > 0 ? `$${spend.toFixed(2)} spend × ${((rate) * 100).toFixed(0)}%` : "No spend recorded",
          deal_id: null,
          calculation_details: null,
          influencer,
          deal: null,
          _isLive: !existing,
        });
      }
    }

    // Retainer
    if (invite.has_retainer) {
      const key = `${influencerId}-retainer`;
      const existing = existingMap.get(key);
      processedKeys.add(key);

      if (existing && existing.status !== "pending") {
        allPayments.push({ ...existing, influencer, deal: null });
      } else {
        allPayments.push({
          id: existing?.id || `live-${influencerId}-retainer`,
          influencer_id: influencerId,
          month,
          payment_type: "retainer",
          amount_owed: invite.retainer_amount || 0,
          amount_paid: null,
          status: "pending",
          payment_method: paymentMethod,
          payment_detail: paymentDetail,
          notes: null,
          deal_id: null,
          calculation_details: null,
          influencer,
          deal: null,
          _isLive: !existing,
        });
      }
    }

    // Affiliate commission
    if (invite.has_affiliate) {
      const key = `${influencerId}-affiliate_commission`;
      const existing = existingMap.get(key);
      processedKeys.add(key);

      if (existing && existing.status !== "pending") {
        allPayments.push({ ...existing, influencer, deal: null });
      } else {
        const aff = affiliateResults.get(influencerId) || { amount: 0, notes: "No affiliate code", details: null };
        allPayments.push({
          id: existing?.id || `live-${influencerId}-affiliate_commission`,
          influencer_id: influencerId,
          month,
          payment_type: "affiliate_commission",
          amount_owed: aff.amount,
          amount_paid: null,
          status: "pending",
          payment_method: paymentMethod,
          payment_detail: paymentDetail,
          notes: aff.notes,
          deal_id: null,
          calculation_details: aff.details,
          influencer,
          deal: null,
          _isLive: !existing,
        });
      }
    }

    // Paid collabs
    const creatorDeals = dealsByInfluencer.get(influencerId) || [];
    for (const deal of creatorDeals) {
      const key = `${influencerId}-paid_collab-${deal.id}`;
      const existing = existingMap.get(key);
      processedKeys.add(key);

      if (existing && existing.status !== "pending") {
        allPayments.push({
          ...existing,
          influencer,
          deal: { id: deal.id, total_deal_value: deal.total_deal_value, payment_status: null, campaign: (deal as any).campaign },
        });
      } else {
        allPayments.push({
          id: existing?.id || `live-${influencerId}-paid_collab-${deal.id}`,
          influencer_id: influencerId,
          month,
          payment_type: "paid_collab",
          amount_owed: deal.total_deal_value || 0,
          amount_paid: null,
          status: "pending",
          payment_method: paymentMethod,
          payment_detail: paymentDetail,
          notes: (deal as any).campaign?.name || null,
          deal_id: deal.id,
          calculation_details: null,
          influencer,
          deal: { id: deal.id, total_deal_value: deal.total_deal_value, payment_status: null, campaign: (deal as any).campaign },
          _isLive: !existing,
        });
      }
    }
  }

  // 9b. Legacy affiliate payment rows
  for (const la of (legacyAffiliates || [])) {
    const existingLegacy = [...existingMap.values()].find(
      (p) => p.legacy_affiliate_id === la.id && p.payment_type === "legacy_affiliate_commission"
    );

    const legacyMeta = {
      id: la.id,
      name: la.name,
      discount_code: la.discount_code,
      commission_rate: la.commission_rate,
      payment_method: la.payment_method,
      payment_detail: la.payment_detail,
    };

    if (existingLegacy && existingLegacy.status !== "pending") {
      allPayments.push({ ...existingLegacy, influencer: null, deal: null, legacyAffiliate: legacyMeta });
    } else {
      const aff = legacyResults.get(la.id) || { amount: 0, notes: "No orders this month", details: null };
      allPayments.push({
        id: existingLegacy?.id || `live-legacy-${la.id}`,
        influencer_id: la.influencer_id || null,
        legacy_affiliate_id: la.id,
        month,
        payment_type: "legacy_affiliate_commission",
        amount_owed: aff.amount,
        amount_paid: null,
        status: "pending",
        payment_method: la.payment_method || null,
        payment_detail: la.payment_detail || null,
        notes: aff.notes,
        deal_id: null,
        calculation_details: aff.details,
        influencer: null,
        deal: null,
        legacyAffiliate: legacyMeta,
        _isLive: !existingLegacy,
      });
    }
  }

  // Include any existing DB rows not covered by live calculation (e.g. manually added, old types, refund_adjustments)
  const uncoveredRows = [...existingMap.entries()].filter(([, p]) => {
    const key = p.deal_id
      ? `${p.influencer_id}-${p.payment_type}-${p.deal_id}`
      : `${p.influencer_id}-${p.payment_type}`;
    return !processedKeys.has(key);
  });

  if (uncoveredRows.length > 0) {
    // Fetch influencer data for uncovered rows directly
    const uncoveredInfluencerIds = [...new Set(uncoveredRows.map(([, p]) => p.influencer_id))];
    const { data: uncoveredInfluencers } = await supabase
      .from("influencers")
      .select("id, name, instagram_handle, profile_photo_url")
      .in("id", uncoveredInfluencerIds);

    const uncoveredInfMap = new Map((uncoveredInfluencers || []).map((i) => [i.id, i]));

    for (const [, p] of uncoveredRows) {
      const inf = uncoveredInfMap.get(p.influencer_id) || null;
      allPayments.push({ ...p, influencer: inf, deal: null });
    }
  }

  // Add newly created refund adjustment rows
  for (const rap of refundAdjustmentPayments) {
    allPayments.push(rap);
  }

  return NextResponse.json({ payments: allPayments });
}

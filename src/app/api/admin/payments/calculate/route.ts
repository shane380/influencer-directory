import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateAffiliateCommission } from "@/lib/affiliate";

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

  // 6. Calculate affiliate commissions in parallel (direct Shopify calls, no self-referencing HTTP)
  const affiliateResults = new Map<string, { amount: number; notes: string; details: any }>();

  const affiliatePromises = creators
    .filter((c: any) => {
      const invite = inviteMap.get(c.invite_id);
      if (!invite?.has_affiliate || !c.affiliate_code) return false;
      const key = `${invite.influencer?.id}-affiliate_commission`;
      const existing = existingMap.get(key);
      return !existing || existing.status === "pending";
    })
    .map(async (c: any) => {
      const invite = inviteMap.get(c.invite_id);
      const rate = c.commission_rate || invite?.ad_spend_percentage || 10;
      try {
        const result = await calculateAffiliateCommission(c.affiliate_code, month, rate / 100);
        affiliateResults.set(invite.influencer.id, {
          amount: result.summary.commission_owed,
          notes: result.summary.order_count > 0
            ? `${result.summary.order_count} orders, $${result.summary.total_gross.toFixed(2)} gross, -$${result.summary.total_refunds.toFixed(2)} refunds, $${result.summary.total_net.toFixed(2)} net × ${rate}%`
            : "No orders this month",
          details: result.summary,
        });
      } catch {
        affiliateResults.set(invite.influencer.id, {
          amount: 0,
          notes: "Failed to calculate — enter manually",
          details: null,
        });
      }
    });

  await Promise.all(affiliatePromises);

  // 7. Build the merged payment list
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

  // Include any existing DB rows not covered by live calculation (e.g. manually added, or old types)
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

  return NextResponse.json({ payments: allPayments });
}

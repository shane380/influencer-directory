import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { calculateAffiliateCommission } from "@/lib/affiliate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Cron: snapshot payment amounts at end of month
// Schedule: "0 0 28-31 * *" (runs at midnight on days 28-31, checks if it's actually the last day)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const monthParam = request.nextUrl.searchParams.get("month");
  let month: string;

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    month = monthParam;
  } else {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDate() !== 1) {
      return NextResponse.json({ skipped: true, reason: "Not the last day of the month" });
    }
    month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Fetch existing payment records for this month (skip what's already saved)
  const { data: existingPayments } = await (supabase.from as any)("creator_payments")
    .select("influencer_id, payment_type, deal_id")
    .eq("month", month);

  const existingKeys = new Set(
    (existingPayments || []).map((p: any) =>
      p.deal_id ? `${p.influencer_id}-${p.payment_type}-${p.deal_id}` : `${p.influencer_id}-${p.payment_type}`
    )
  );

  // Fetch all creators with invites
  const { data: creators } = await (supabase.from as any)("creators")
    .select("id, creator_name, invite_id, affiliate_code, commission_rate, payment_method, paypal_email, bank_institution, bank_account_number");

  if (!creators || creators.length === 0) {
    return NextResponse.json({ success: true, month, created: 0 });
  }

  const inviteIds = creators.map((c: any) => c.invite_id).filter(Boolean);
  const { data: invites } = await (supabase.from as any)("creator_invites")
    .select("*, influencer:influencers!creator_invites_influencer_id_fkey(id, name, instagram_handle)")
    .in("id", inviteIds);

  const inviteMap = new Map((invites || []).map((i: any) => [i.id, i]));

  // Batch fetch ad performance
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

  // Fetch paid collab deals
  const { data: deals } = await supabase
    .from("campaign_deals")
    .select("id, influencer_id, total_deal_value, campaign:campaigns!campaign_deals_campaign_id_fkey(name, start_date)")
    .eq("deal_status", "confirmed");

  let created = 0;
  const rowsToInsert: any[] = [];

  for (const creator of creators) {
    if (!creator.invite_id) continue;
    const invite = inviteMap.get(creator.invite_id);
    if (!invite?.influencer) continue;

    const influencerId = invite.influencer.id;
    const handle = invite.influencer.instagram_handle;
    const paymentMethod = creator.payment_method || null;
    let paymentDetail = null;
    if (paymentMethod === "paypal") paymentDetail = creator.paypal_email || null;
    else if (paymentMethod) {
      const acct = creator.bank_account_number || "";
      paymentDetail = acct ? `···${acct.slice(-4)}` : null;
    }

    // Ad spend
    if (invite.has_ad_spend) {
      const key = `${influencerId}-ad_spend_commission`;
      if (!existingKeys.has(key)) {
        const spend = adSpendMap.get(handle) || 0;
        const rate = (invite.ad_spend_percentage || 10) / 100;
        const amount = Math.round(spend * rate * 100) / 100;
        rowsToInsert.push({
          influencer_id: influencerId, month, payment_type: "ad_spend_commission",
          amount_owed: amount, payment_method: paymentMethod, payment_detail: paymentDetail,
          notes: spend > 0 ? `$${spend.toFixed(2)} spend × ${(rate * 100).toFixed(0)}%` : "No spend recorded",
        });
      }
    }

    // Retainer
    if (invite.has_retainer) {
      const key = `${influencerId}-retainer`;
      if (!existingKeys.has(key)) {
        rowsToInsert.push({
          influencer_id: influencerId, month, payment_type: "retainer",
          amount_owed: invite.retainer_amount || 0, payment_method: paymentMethod, payment_detail: paymentDetail,
        });
      }
    }

    // Affiliate
    if (invite.has_affiliate && creator.affiliate_code) {
      const key = `${influencerId}-affiliate_commission`;
      if (!existingKeys.has(key)) {
        const rate = creator.commission_rate || invite.ad_spend_percentage || 10;
        try {
          const result = await calculateAffiliateCommission(creator.affiliate_code, month, rate / 100);
          rowsToInsert.push({
            influencer_id: influencerId, month, payment_type: "affiliate_commission",
            amount_owed: result.summary.commission_owed, payment_method: paymentMethod, payment_detail: paymentDetail,
            notes: result.summary.order_count > 0
              ? `${result.summary.order_count} orders, $${result.summary.total_gross.toFixed(2)} net × ${rate}%`
              : "No orders this month",
            calculation_details: result.summary,
          });
        } catch {
          rowsToInsert.push({
            influencer_id: influencerId, month, payment_type: "affiliate_commission",
            amount_owed: 0, payment_method: paymentMethod, payment_detail: paymentDetail,
            notes: "Failed to calculate",
          });
        }
      }
    }

    // Paid collabs
    for (const deal of deals || []) {
      const campaign = (deal as any).campaign;
      if (!campaign?.start_date || deal.influencer_id !== influencerId) continue;
      if (campaign.start_date.substring(0, 7) !== month) continue;
      const key = `${influencerId}-paid_collab-${deal.id}`;
      if (!existingKeys.has(key)) {
        rowsToInsert.push({
          influencer_id: influencerId, month, payment_type: "paid_collab",
          amount_owed: deal.total_deal_value || 0, payment_method: paymentMethod, payment_detail: paymentDetail,
          notes: campaign.name || null, deal_id: deal.id,
        });
      }
    }
  }

  // Bulk insert
  if (rowsToInsert.length > 0) {
    const { error } = await (supabase.from as any)("creator_payments").insert(rowsToInsert);
    if (error) {
      console.error("[cron/generate-payments] Insert error:", error);
      return NextResponse.json({ error: error.message, month }, { status: 500 });
    }
    created = rowsToInsert.length;
  }

  console.log(`[cron/generate-payments] Saved ${created} payment rows for ${month}`);
  return NextResponse.json({ success: true, month, created });
}

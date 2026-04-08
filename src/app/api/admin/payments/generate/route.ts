import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

function getBaseUrl(): string {
  // Prefer the public site URL to avoid deployment-specific URLs that may redirect
  return process.env.NEXT_PUBLIC_SITE_URL
    || "https://influencer-directory-self.vercel.app";
}

async function getMetaSpendForMonth(handle: string, month: string, supabase: ReturnType<typeof getSupabase>): Promise<number> {
  try {
    const { data } = await (supabase.from("creator_ad_performance") as any)
      .select("monthly")
      .eq("instagram_handle", handle)
      .single();
    if (!data?.monthly) return 0;
    const monthly = typeof data.monthly === "string" ? JSON.parse(data.monthly) : data.monthly;
    const monthData = monthly.find((m: any) => m.month === month);
    return monthData?.spend || 0;
  } catch (err) {
    console.error(`Failed to fetch Meta spend for ${handle}:`, err);
    return 0;
  }
}

// Also support GET for cron access
export async function GET(request: NextRequest) {
  return POST(request);
}

// POST /api/admin/payments/generate?month=2026-03
export async function POST(request: NextRequest) {
  // Allow access via cron secret or authenticated session (middleware handles session auth)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const hasCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`;
  // If no cron auth, the request must have passed middleware auth (logged-in admin)
  // Since this route is now in the public routes list, we need to verify one or the other
  if (!hasCronAuth) {
    // Check for a valid Supabase session via cookie
    const { createServerClient } = await import("@supabase/ssr");
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} } }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get all creators with their invite data
  const { data: creators } = await (supabase.from as any)("creators")
    .select("id, creator_name, invite_id, affiliate_code, commission_rate");

  if (!creators || creators.length === 0) {
    return NextResponse.json({ summary: { created: 0, skipped: 0, errors: 0 }, message: "No creators found" });
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;
  const details: string[] = [];

  for (const creator of creators) {
    if (!creator.invite_id) continue;

    // Get invite with deal flags
    const { data: invite } = await (supabase.from as any)("creator_invites")
      .select("*, influencer:influencers!creator_invites_influencer_id_fkey(id, name, instagram_handle)")
      .eq("id", creator.invite_id)
      .single();

    if (!invite || !invite.influencer) continue;

    const influencerId = invite.influencer.id;
    const handle = invite.influencer.instagram_handle;

    // Get creator's payment info
    const { data: creatorData } = await (supabase.from as any)("creators")
      .select("payment_method, paypal_email, bank_institution, bank_account_number")
      .eq("id", creator.id)
      .single();

    const paymentMethod = creatorData?.payment_method || null;
    let paymentDetail = null;
    if (paymentMethod === "paypal") {
      paymentDetail = creatorData?.paypal_email || null;
    } else if (paymentMethod === "e_transfer") {
      paymentDetail = creatorData?.paypal_email || null;
    } else if (paymentMethod === "bank") {
      const acct = creatorData?.bank_account_number || "";
      paymentDetail = acct ? `···${acct.slice(-4)}` : null;
    }

    // Check existing rows for this influencer+month
    const { data: existing } = await (supabase.from as any)("creator_payments")
      .select("payment_type")
      .eq("influencer_id", influencerId)
      .eq("month", month);

    const existingTypes = new Set((existing || []).map((e: any) => e.payment_type));

    const rowsToInsert: any[] = [];

    // Ad spend commission
    if (invite.has_ad_spend && !existingTypes.has("ad_spend_commission")) {
      const spend = await getMetaSpendForMonth(handle, month, supabase);
      const rate = (invite.ad_spend_percentage || 10) / 100;
      const amount = Math.round(spend * rate * 100) / 100;
      rowsToInsert.push({
        influencer_id: influencerId,
        month,
        payment_type: "ad_spend_commission",
        amount_owed: amount,
        payment_method: paymentMethod,
        payment_detail: paymentDetail,
        notes: spend > 0 ? `$${spend.toFixed(2)} spend × ${(rate * 100).toFixed(0)}%` : "No spend recorded",
      });
    }

    // Retainer
    if (invite.has_retainer && !existingTypes.has("retainer")) {
      rowsToInsert.push({
        influencer_id: influencerId,
        month,
        payment_type: "retainer",
        amount_owed: invite.retainer_amount || 0,
        payment_method: paymentMethod,
        payment_detail: paymentDetail,
      });
    }

    // Affiliate commission — auto-calculate from Shopify orders
    if (invite.has_affiliate && !existingTypes.has("affiliate_commission")) {
      const affiliateCode = creator.affiliate_code;
      const affCommissionRate = creator.commission_rate || invite.ad_spend_percentage || 10;
      let affAmount = 0;
      let affNotes = "No affiliate code";
      let calcDetails: any = null;

      if (affiliateCode) {
        try {
          const baseUrl = getBaseUrl();
          const affRes = await fetch(
            `${baseUrl}/api/shopify/affiliate-orders?discount_code=${encodeURIComponent(affiliateCode)}&month=${month}&commission_rate=${affCommissionRate}`,
            { headers: { "Content-Type": "application/json" } }
          );
          const affData = await affRes.json();
          if (affData.summary) {
            affAmount = affData.summary.commission_owed || 0;
            affNotes = affData.summary.order_count > 0
              ? `${affData.summary.order_count} orders, $${affData.summary.total_gross.toFixed(2)} gross, -$${affData.summary.total_refunds.toFixed(2)} refunds, $${affData.summary.total_net.toFixed(2)} net × ${affCommissionRate}%`
              : "No orders this month";
            calcDetails = {
              ...affData.summary,
              orders: (affData.orders || []).map((o: any) => ({
                order_number: o.order_number,
                created_at: o.created_at,
                gross_amount: o.gross_amount,
                refund_amount: o.refund_amount,
                net_amount: o.net_amount,
              })),
            };
          }
        } catch (err) {
          console.error(`Failed to fetch affiliate orders for ${creator.creator_name}:`, err);
          affNotes = "Failed to calculate — enter manually";
        }
      }

      rowsToInsert.push({
        influencer_id: influencerId,
        month,
        payment_type: "affiliate_commission",
        amount_owed: affAmount,
        payment_method: paymentMethod,
        payment_detail: paymentDetail,
        notes: affNotes,
        calculation_details: calcDetails,
      });
    }

    // Insert rows
    for (const row of rowsToInsert) {
      const { error } = await (supabase.from as any)("creator_payments").insert(row);
      if (error) {
        console.error(`Payment insert error for ${creator.creator_name}:`, error);
        errors++;
        details.push(`Error: ${creator.creator_name} - ${row.payment_type}: ${error.message}`);
      } else {
        created++;
        details.push(`Created: ${creator.creator_name} - ${row.payment_type} ($${row.amount_owed})`);
      }
    }

    if (rowsToInsert.length === 0) {
      skipped++;
    }
  }

  // --- Paid Collabs ---
  // Fetch confirmed campaign deals for this month (based on campaign start_date)
  const { data: deals } = await supabase
    .from("campaign_deals")
    .select("id, influencer_id, total_deal_value, notes, campaign:campaigns!campaign_deals_campaign_id_fkey(id, name, start_date)")
    .eq("deal_status", "confirmed");

  for (const deal of deals || []) {
    const campaign = (deal as any).campaign;
    if (!campaign?.start_date) continue;

    // Match campaign start_date month to requested month
    const campaignMonth = campaign.start_date.substring(0, 7); // "2026-03"
    if (campaignMonth !== month) continue;

    const influencerId = deal.influencer_id;
    const dealId = deal.id;

    // Check if a payment row already exists for this deal+month
    const { data: existingDeal } = await (supabase.from as any)("creator_payments")
      .select("id")
      .eq("influencer_id", influencerId)
      .eq("month", month)
      .eq("payment_type", "paid_collab")
      .eq("deal_id", dealId);

    if (existingDeal && existingDeal.length > 0) {
      skipped++;
      continue;
    }

    // Try to get payment method from creators table (if they're a creator)
    let paymentMethod = null;
    let paymentDetail = null;

    const { data: creatorLink } = await (supabase.from as any)("creator_invites")
      .select("id")
      .eq("influencer_id", influencerId)
      .limit(1);

    if (creatorLink && creatorLink.length > 0) {
      const { data: creatorData } = await (supabase.from as any)("creators")
        .select("payment_method, paypal_email, bank_account_number")
        .eq("invite_id", creatorLink[0].id)
        .single();

      if (creatorData) {
        paymentMethod = creatorData.payment_method || null;
        if (paymentMethod === "paypal") {
          paymentDetail = creatorData.paypal_email || null;
        } else if (paymentMethod === "e_transfer") {
          paymentDetail = creatorData.paypal_email || null;
        } else if (paymentMethod === "bank") {
          const acct = creatorData.bank_account_number || "";
          paymentDetail = acct ? `···${acct.slice(-4)}` : null;
        }
      }
    }

    const amount = deal.total_deal_value || 0;
    const note = `${campaign.name}${deal.notes ? ` — ${deal.notes}` : ""}`;

    const { error } = await (supabase.from as any)("creator_payments").insert({
      influencer_id: influencerId,
      month,
      payment_type: "paid_collab",
      deal_id: dealId,
      amount_owed: amount,
      payment_method: paymentMethod,
      payment_detail: paymentDetail,
      notes: note,
    });

    if (error) {
      console.error(`Paid collab insert error for deal ${dealId}:`, error);
      errors++;
      details.push(`Error: paid_collab deal ${dealId}: ${error.message}`);
    } else {
      created++;
      details.push(`Created: paid_collab - ${campaign.name} ($${amount})`);
    }
  }

  // Legacy affiliates
  const { data: legacyAffiliates } = await (supabase.from as any)("legacy_affiliates")
    .select("*")
    .eq("status", "active");

  for (const la of (legacyAffiliates || [])) {
    // Check if already exists
    const { data: existing } = await (supabase.from as any)("creator_payments")
      .select("id")
      .eq("legacy_affiliate_id", la.id)
      .eq("month", month)
      .eq("payment_type", "legacy_affiliate_commission")
      .maybeSingle();

    if (existing) {
      skipped++;
      details.push(`Skipped: legacy_affiliate_commission for ${la.name} (already exists)`);
      continue;
    }

    // Fetch Shopify orders
    const rate = la.commission_rate || 25;
    let amount = 0;
    let notes = "No orders this month";
    let calculationDetails = null;
    try {
      const baseUrl = getBaseUrl();
      const res = await fetch(
        `${baseUrl}/api/shopify/affiliate-orders?discount_code=${encodeURIComponent(la.discount_code)}&month=${month}&commission_rate=${rate}`,
        { headers: { "x-api-key": supabaseServiceKey } }
      );
      if (res.ok) {
        const data = await res.json();
        amount = data.summary?.commission_owed || 0;
        calculationDetails = { ...data.summary, orders: data.orders };
        if (data.summary?.order_count > 0) {
          notes = `${data.summary.order_count} orders, $${data.summary.total_gross.toFixed(2)} gross, -$${data.summary.total_refunds.toFixed(2)} refunds, $${data.summary.total_net.toFixed(2)} net × ${rate}%`;
        }
      }
    } catch {
      notes = "Failed to fetch orders";
    }

    const { error } = await (supabase.from as any)("creator_payments").insert({
      legacy_affiliate_id: la.id,
      influencer_id: la.influencer_id || null,
      month,
      payment_type: "legacy_affiliate_commission",
      amount_owed: amount,
      payment_method: la.payment_method || null,
      payment_detail: la.payment_detail || null,
      notes,
      calculation_details: calculationDetails,
    });

    if (error) {
      console.error(`Legacy affiliate insert error for ${la.name}:`, error);
      errors++;
      details.push(`Error: legacy_affiliate_commission ${la.name}: ${error.message}`);
    } else {
      created++;
      details.push(`Created: legacy_affiliate_commission - ${la.name} ($${amount.toFixed(2)})`);
    }
  }

  return NextResponse.json({
    summary: { created, skipped, errors },
    details,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function getMetaSpendForMonth(handle: string, month: string): Promise<number> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  try {
    const res = await fetch(`${baseUrl}/api/meta/creator-ads?handle=${encodeURIComponent(handle)}`, {
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json();
    const monthData = (data.monthly || []).find((m: any) => m.month === month);
    return monthData?.spend || 0;
  } catch (err) {
    console.error(`Failed to fetch Meta spend for ${handle}:`, err);
    return 0;
  }
}

// POST /api/admin/payments/generate?month=2026-03
export async function POST(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 });
  }

  const supabase = getSupabase();

  // Get all creators with their invite data
  const { data: creators } = await (supabase.from as any)("creators")
    .select("id, creator_name, invite_id");

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
      const spend = await getMetaSpendForMonth(handle, month);
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

    // Affiliate commission
    if (invite.has_affiliate && !existingTypes.has("affiliate_commission")) {
      rowsToInsert.push({
        influencer_id: influencerId,
        month,
        payment_type: "affiliate_commission",
        amount_owed: 0,
        payment_method: paymentMethod,
        payment_detail: paymentDetail,
        notes: "Enter manually",
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

  return NextResponse.json({
    summary: { created, skipped, errors },
    details,
  });
}

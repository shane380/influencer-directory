import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";
import { decryptField } from "@/lib/encryption";

// GET /api/admin/payment-info?influencer_id=xxx
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const influencerId = request.nextUrl.searchParams.get("influencer_id");
  if (!influencerId) {
    return NextResponse.json({ error: "influencer_id required" }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Find creator via invite linked to this influencer
  const { data: invite } = await (supabase.from("creator_invites") as any)
    .select("id")
    .eq("influencer_id", influencerId)
    .limit(1)
    .single();

  if (!invite) {
    return NextResponse.json({ error: "No invite found" }, { status: 404 });
  }

  const { data: creator } = await (supabase.from("creators") as any)
    .select("payment_method, payout_country, paypal_email, bank_account_name, bank_account_number, bank_routing_number, bank_institution, bank_account_number_enc, bank_routing_number_enc")
    .eq("invite_id", invite.id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "No creator found" }, { status: 404 });
  }

  // Decrypt encrypted fields if available, fall back to plain text
  let bankAccountNumber = creator.bank_account_number;
  let bankRoutingNumber = creator.bank_routing_number;

  if (creator.bank_account_number_enc) {
    try { bankAccountNumber = decryptField(creator.bank_account_number_enc); } catch {}
  }
  if (creator.bank_routing_number_enc) {
    try { bankRoutingNumber = decryptField(creator.bank_routing_number_enc); } catch {}
  }

  // Log access
  await supabase.from("payment_audit_log").insert({
    user_id: admin.id,
    user_email: admin.email,
    action: "view_payment_info",
    target_influencer_id: influencerId,
    metadata: { invite_id: invite.id },
  });

  return NextResponse.json({
    payment_method: creator.payment_method,
    payout_country: creator.payout_country,
    paypal_email: creator.paypal_email,
    bank_account_name: creator.bank_account_name,
    bank_account_number: bankAccountNumber,
    bank_routing_number: bankRoutingNumber,
    bank_institution: creator.bank_institution,
  });
}

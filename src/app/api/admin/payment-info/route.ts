import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";
import { decryptField, encryptField } from "@/lib/encryption";

// GET /api/admin/payment-info?influencer_id=xxx
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const influencerId = request.nextUrl.searchParams.get("influencer_id");
  if (!influencerId) {
    return NextResponse.json({ error: "influencer_id required" }, { status: 400 });
  }

  const supabase = getAdminClient();

  // An influencer can hold several invites (re-issued links, second deals) and
  // only some carry a creators row. Picking one invite arbitrarily resolved to
  // the wrong record — a 404, stale details, or an edit landing on a different
  // creators row. Search ALL their invites and take the record the creator
  // actually maintains.
  const { data: inviteRows } = await (supabase.from("creator_invites") as any)
    .select("id")
    .eq("influencer_id", influencerId);
  const inviteIds = (inviteRows || []).map((i: any) => i.id);
  if (!inviteIds.length) {
    return NextResponse.json({ error: "No invite found" }, { status: 404 });
  }

  const { data: creatorRows } = await (supabase.from("creators") as any)
    .select("id, payment_method, payout_country, paypal_email, bank_account_name, bank_account_number, bank_routing_number, bank_institution, bank_account_number_enc, bank_routing_number_enc, payment_updated_at")
    .in("invite_id", inviteIds);
  const creator = (creatorRows || []).sort((a: any, b: any) =>
    // a row with payment details beats one without; latest update wins after that
    (b.payment_method ? 1 : 0) - (a.payment_method ? 1 : 0) ||
    String(b.payment_updated_at || "").localeCompare(String(a.payment_updated_at || ""))
  )[0];

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
    metadata: { creator_id: creator.id },
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

// PATCH /api/admin/payment-info — admin edit creator payment info
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  const { influencer_id, payment_method, payout_country, paypal_email, bank_account_name, bank_account_number, bank_routing_number, bank_institution } = body;

  if (!influencer_id) {
    return NextResponse.json({ error: "influencer_id required" }, { status: 400 });
  }

  if (!payment_method || !["paypal", "us_ach", "ca_eft", "intl_wire", "e_transfer"].includes(payment_method)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  const supabase = getAdminClient();

  // Find creator via invite linked to this influencer
  // Same multi-invite resolution as GET: an edit must land on the record the
  // creator maintains, never on whichever invite the database returned first.
  const { data: inviteRows } = await (supabase.from("creator_invites") as any)
    .select("id")
    .eq("influencer_id", influencer_id);
  const inviteIds = (inviteRows || []).map((i: any) => i.id);
  if (!inviteIds.length) {
    return NextResponse.json({ error: "No invite found" }, { status: 404 });
  }

  const { data: creatorRows } = await (supabase.from("creators") as any)
    .select("id, payment_method, payment_updated_at")
    .in("invite_id", inviteIds);
  const creator = (creatorRows || []).sort((a: any, b: any) =>
    (b.payment_method ? 1 : 0) - (a.payment_method ? 1 : 0) ||
    String(b.payment_updated_at || "").localeCompare(String(a.payment_updated_at || ""))
  )[0];

  if (!creator) {
    return NextResponse.json({ error: "No creator found" }, { status: 404 });
  }

  // Build update data (same logic as creators/payment route)
  const updateData: Record<string, unknown> = {
    payment_method,
    payment_updated_at: new Date().toISOString(),
  };

  if (payout_country !== undefined) {
    updateData.payout_country = payout_country || null;
  }

  if (payment_method === "paypal" || payment_method === "e_transfer") {
    updateData.paypal_email = paypal_email || null;
    updateData.bank_account_name = null;
    updateData.bank_account_number = null;
    updateData.bank_routing_number = null;
    updateData.bank_account_number_enc = null;
    updateData.bank_routing_number_enc = null;
    updateData.bank_institution = null;
  } else {
    updateData.paypal_email = null;
    updateData.bank_account_name = bank_account_name || null;
    updateData.bank_institution = bank_institution || null;

    if (bank_account_number) {
      updateData.bank_account_number_enc = encryptField(bank_account_number);
      updateData.bank_account_number = null;
    } else {
      updateData.bank_account_number_enc = null;
      updateData.bank_account_number = null;
    }
    if (bank_routing_number) {
      updateData.bank_routing_number_enc = encryptField(bank_routing_number);
      updateData.bank_routing_number = null;
    } else {
      updateData.bank_routing_number_enc = null;
      updateData.bank_routing_number = null;
    }
  }

  const { error } = await (supabase.from("creators") as any)
    .update(updateData)
    .eq("id", creator.id);

  if (error) {
    console.error("Admin payment update error:", error);
    return NextResponse.json({ error: "Failed to update payment info" }, { status: 500 });
  }

  // Audit log
  await supabase.from("payment_audit_log").insert({
    user_id: admin.id,
    user_email: admin.email,
    action: "update_payment_info",
    target_influencer_id: influencer_id,
    metadata: { creator_id: creator.id, payment_method, payout_country },
  });

  // Return the updated payment info (decrypted for display)
  return NextResponse.json({
    payment_method,
    payout_country: payout_country || null,
    paypal_email: (payment_method === "paypal" || payment_method === "e_transfer") ? (paypal_email || null) : null,
    bank_account_name: (payment_method !== "paypal" && payment_method !== "e_transfer") ? (bank_account_name || null) : null,
    bank_account_number: (payment_method !== "paypal" && payment_method !== "e_transfer") ? (bank_account_number || null) : null,
    bank_routing_number: (payment_method !== "paypal" && payment_method !== "e_transfer") ? (bank_routing_number || null) : null,
    bank_institution: (payment_method !== "paypal" && payment_method !== "e_transfer") ? (bank_institution || null) : null,
  });
}

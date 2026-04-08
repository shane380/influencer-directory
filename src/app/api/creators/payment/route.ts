import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { encryptField } from "@/lib/encryption";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function PATCH(request: NextRequest) {
  const supabaseAuth = await createServerClient();
  const { data: { user } } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!creator) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const body = await request.json();
  const { payment_method, payout_country, paypal_email, bank_account_name, bank_account_number, bank_routing_number, bank_institution } = body;

  if (!payment_method || !["paypal", "bank", "us_ach", "ca_eft", "intl_wire", "e_transfer"].includes(payment_method)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    payment_method,
    payment_updated_at: new Date().toISOString(),
  };

  if (payout_country) {
    updateData.payout_country = payout_country;
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

    // Encrypt sensitive fields, null out plaintext columns
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

  const { data, error } = await supabase
    .from("creators")
    .update(updateData)
    .eq("id", creator.id)
    .select()
    .single();

  if (error) {
    console.error("Payment update error:", error);
    return NextResponse.json({ error: "Failed to update payment info" }, { status: 500 });
  }

  return NextResponse.json({ creator: data });
}

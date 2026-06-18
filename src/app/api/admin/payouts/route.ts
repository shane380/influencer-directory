import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";

// Actual payouts ledger — records of money really sent to a creator, separate
// from the monthly "owed" rows. A creator's balance = total earned − sum(payouts).

// GET /api/admin/payouts?influencer_id=xxx (or ?legacy_affiliate_id=xxx)
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const influencerId = request.nextUrl.searchParams.get("influencer_id");
  const legacyAffiliateId = request.nextUrl.searchParams.get("legacy_affiliate_id");
  if (!influencerId && !legacyAffiliateId) {
    return NextResponse.json({ error: "influencer_id or legacy_affiliate_id required" }, { status: 400 });
  }

  const supabase = getAdminClient();
  let query = (supabase.from("creator_payouts") as any)
    .select("id, influencer_id, legacy_affiliate_id, amount, sent_at, method, reference, note, recorded_by, created_at")
    .order("sent_at", { ascending: false });
  if (influencerId) query = query.eq("influencer_id", influencerId);
  else query = query.eq("legacy_affiliate_id", legacyAffiliateId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const totalPaid = (data || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  return NextResponse.json({ payouts: data || [], totalPaid: Math.round(totalPaid * 100) / 100 });
}

// POST /api/admin/payouts — record an actual transfer
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
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt === 0) {
    return NextResponse.json({ error: "amount must be a non-zero number" }, { status: 400 });
  }
  if (!sent_at) {
    return NextResponse.json({ error: "sent_at required" }, { status: 400 });
  }

  const supabase = getAdminClient();
  const { data, error } = await (supabase.from("creator_payouts") as any)
    .insert({
      influencer_id: influencer_id || null,
      legacy_affiliate_id: legacy_affiliate_id || null,
      amount: Math.round(amt * 100) / 100,
      sent_at,
      method: method || null,
      reference: reference || null,
      note: note || null,
      recorded_by: admin.email || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (supabase.from("payment_audit_log") as any).insert({
    user_id: admin.id,
    user_email: admin.email,
    action: "record_payout",
    target_influencer_id: influencer_id || null,
    metadata: { payout_id: data.id, amount: data.amount, sent_at: data.sent_at, legacy_affiliate_id: legacy_affiliate_id || null },
  });

  return NextResponse.json({ payout: data });
}

// DELETE /api/admin/payouts?id=xxx — remove a mis-entered payout
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = getAdminClient();
  const { error } = await (supabase.from("creator_payouts") as any).delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await (supabase.from("payment_audit_log") as any).insert({
    user_id: admin.id,
    user_email: admin.email,
    action: "delete_payout",
    metadata: { payout_id: id },
  });

  return NextResponse.json({ ok: true });
}

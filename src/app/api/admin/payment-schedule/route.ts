import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";

// A promised payment: invoice received / pay date agreed. POST creates one
// (clearing any previous active schedule for the same partner); DELETE clears.
// Never touches creator_payouts — a plan is not a payment.
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { influencer_id, legacy_affiliate_id, amount, scheduled_for, note } = await request.json();
  if ((!influencer_id && !legacy_affiliate_id) || !scheduled_for) {
    return NextResponse.json({ error: "subject and scheduled_for required" }, { status: 400 });
  }
  const db = getAdminClient();
  const match = influencer_id
    ? { col: "influencer_id", val: influencer_id }
    : { col: "legacy_affiliate_id", val: legacy_affiliate_id };
  await (db.from("payment_schedules") as any)
    .update({ cleared_at: new Date().toISOString() })
    .eq(match.col, match.val).is("cleared_at", null);
  const { error } = await (db.from("payment_schedules") as any).insert({
    influencer_id: influencer_id || null,
    legacy_affiliate_id: legacy_affiliate_id || null,
    amount: amount ?? null,
    scheduled_for,
    note: note || null,
    created_by: admin.email || admin.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const db = getAdminClient();
  const { error } = await (db.from("payment_schedules") as any)
    .update({ cleared_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

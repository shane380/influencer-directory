import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";

// Mark a retainer installment's content as received → that installment EARNS in
// the chosen pay period (the month it became payable). Retainers are content-
// gated: they don't bill just because a month passed. Re-marking upserts.
//
// POST   { influencer_id, installment_no, pay_period (YYYY-MM), amount, content_url?, notes? }
// DELETE ?influencer_id=&installment_no=   (un-mark)
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { influencer_id, installment_no, pay_period, amount, content_url, notes } = await request.json();
  if (!influencer_id || !installment_no || !pay_period || !(amount > 0)) {
    return NextResponse.json({ error: "influencer_id, installment_no, pay_period, amount required" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(pay_period)) {
    return NextResponse.json({ error: "pay_period must be YYYY-MM" }, { status: 400 });
  }

  const db = getAdminClient();
  const creator_key = `inf:${influencer_id}`;
  const { data, error } = await (db.from("commission_events") as any)
    .upsert({
      creator_key,
      influencer_id,
      legacy_affiliate_id: null,
      event_type: "retainer",
      source_type: "retainer_installment",
      source_id: `installment-${installment_no}`,
      period: pay_period,
      occurred_at: new Date().toISOString(),
      amount: Math.round(Number(amount) * 100) / 100,
      rate: null,
      basis: null,
      detail: { installment_no, content_url: content_url || null, notes: notes || null, marked_by: admin.email || null },
    }, { onConflict: "creator_key,event_type,source_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Transition cleanup: drop any auto-generated (non-installment) retainer event
  // for this creator/period so the marked installment doesn't double-count.
  await (db.from("commission_events") as any)
    .delete()
    .eq("influencer_id", influencer_id)
    .eq("event_type", "retainer")
    .eq("source_type", "retainer")
    .eq("period", pay_period);

  return NextResponse.json({ event: data });
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const influencer_id = request.nextUrl.searchParams.get("influencer_id");
  const installment_no = request.nextUrl.searchParams.get("installment_no");
  if (!influencer_id || !installment_no) {
    return NextResponse.json({ error: "influencer_id and installment_no required" }, { status: 400 });
  }
  const db = getAdminClient();
  const { error } = await (db.from("commission_events") as any)
    .delete()
    .eq("creator_key", `inf:${influencer_id}`)
    .eq("event_type", "retainer")
    .eq("source_id", `installment-${installment_no}`);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// GET ?influencer_id=  → existing marked installments (for the Content tab)
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const influencer_id = request.nextUrl.searchParams.get("influencer_id");
  if (!influencer_id) return NextResponse.json({ error: "influencer_id required" }, { status: 400 });
  const db = getAdminClient();
  const { data } = await (db.from("commission_events") as any)
    .select("source_id, period, amount, detail")
    .eq("creator_key", `inf:${influencer_id}`)
    .eq("event_type", "retainer")
    .eq("source_type", "retainer_installment");
  const marked = (data || []).map((e: any) => ({
    installment_no: Number(String(e.source_id).replace("installment-", "")),
    pay_period: e.period, amount: e.amount, content_url: e.detail?.content_url || null, notes: e.detail?.notes || null,
  }));
  return NextResponse.json({ marked });
}

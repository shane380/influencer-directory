import { NextRequest, NextResponse } from "next/server";
import { fetchAllRows } from "@/lib/partnerships/paginate";
import { isTestEnv } from "@/lib/payout-env";
import { createClient } from "@supabase/supabase-js";
import {
  retainerLines, eventLines, payoutLines, openingLiability, summarize, toCsv, undatedPayments,
  toBookkeeperCsv,
} from "@/lib/accrual";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// GET /api/admin/payments/accrual?month=YYYY-MM[&format=csv]
// The monthly accrual pack: earned vs paid per creator, with the opening and
// closing liability that ties the two together.
export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 });
  }
  const format = request.nextUrl.searchParams.get("format");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Paginate everything. A plain select stops silently at 1,000 rows, and the
  // ledger crossed that in August 2026 — the report undercounted by every row
  // past the cap, with no error to show for it. A financial report must read
  // the whole table or fail loudly, never quietly truncate.
  const [dealsRes, events, payouts] = await Promise.all([
    supabase.from("campaign_deals")
      .select("id, deal_kind, starts_on, payment_terms, total_deal_value, deal_status, whitelisting_status, influencer:influencers(name, instagram_handle)")
      .in("deal_status", ["active", "closed"]),
    fetchAllRows<any>((from, to) =>
      (supabase.from("commission_events") as any)
        .select("event_type, period, amount, source_id, influencer_id, detail, influencer:influencers(name, instagram_handle)")
        .order("id").range(from, to)),
    fetchAllRows<any>((from, to) =>
      (supabase.from("creator_payouts") as any)
        .select("amount, sent_at, method, reference, influencer:influencers(name, instagram_handle)")
        // Same env split as the payments page: the bookkeeper sees real
        // transfers only, never payments recorded on a preview deploy.
        .eq("is_test", isTestEnv())
        .order("id").range(from, to)),
  ]);

  const deals = (dealsRes.data || []) as any[];

  const lines = [
    ...retainerLines(deals, month),
    ...eventLines(events, month),
    ...payoutLines(payouts, month),
  ];
  const summary = summarize(
    lines,
    openingLiability(deals, events, payouts, month),
    month,
    undatedPayments(deals),
  );

  if (format === "csv" || format === "detail") {
    // Payment method per creator: the most recent real transfer's method wins
    // (it is what actually happened); the profile's stored method fills gaps.
    const methodByHandle: Record<string, string> = {};
    const { data: creatorRows } = await supabase
      .from("creators")
      .select("payment_method, invite:creator_invites!creators_invite_id_fkey(influencer:influencers(name, instagram_handle))");
    for (const c of (creatorRows || []) as any[]) {
      const inf = (Array.isArray(c.invite) ? c.invite[0] : c.invite)?.influencer;
      const i = Array.isArray(inf) ? inf[0] : inf;
      if (i?.instagram_handle && c.payment_method) methodByHandle[`@${i.instagram_handle}`] = c.payment_method;
    }
    for (const po of [...payouts].sort((a: any, b: any) => String(a.sent_at).localeCompare(String(b.sent_at)))) {
      const i = Array.isArray(po.influencer) ? po.influencer[0] : po.influencer;
      if (i?.instagram_handle && po.method) methodByHandle[`@${i.instagram_handle}`] = po.method;
    }

    const body = format === "detail" ? toCsv(lines, summary) : toBookkeeperCsv(lines, summary, methodByHandle);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="accrual-${month}.csv"`,
      },
    });
  }
  return NextResponse.json({ summary, lines });
}

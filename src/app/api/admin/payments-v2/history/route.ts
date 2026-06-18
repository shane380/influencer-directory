import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";
import { isTestEnv } from "@/lib/payout-env";

// Per-creator history from the ledgers: earned-by-month (commission_events) +
// payments received (creator_payouts). Matches on influencer_id OR
// legacy_affiliate_id so a merged creator's full picture is included.
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const influencerId = request.nextUrl.searchParams.get("influencer_id");
  const legacyAffiliateId = request.nextUrl.searchParams.get("legacy_affiliate_id");
  if (!influencerId && !legacyAffiliateId) {
    return NextResponse.json({ error: "influencer_id or legacy_affiliate_id required" }, { status: 400 });
  }
  const db = getAdminClient();
  const or: string[] = [];
  if (influencerId) or.push(`influencer_id.eq.${influencerId}`);
  if (legacyAffiliateId) or.push(`legacy_affiliate_id.eq.${legacyAffiliateId}`);
  const filter = or.join(",");
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const { data: events } = await (db.from("commission_events") as any)
    .select("period, amount").or(filter);
  const byMonth: Record<string, number> = {};
  for (const e of events || []) byMonth[e.period] = round2((byMonth[e.period] || 0) + Number(e.amount || 0));
  const earnedByMonth = Object.entries(byMonth)
    .map(([period, amount]) => ({ period, amount }))
    .sort((a, b) => b.period.localeCompare(a.period));

  const { data: payouts } = await (db.from("creator_payouts") as any)
    .select("amount, sent_at, method, covers_period")
    .or(filter).eq("is_test", isTestEnv()).order("sent_at", { ascending: false });

  const totalEarned = round2(earnedByMonth.reduce((s, m) => s + m.amount, 0));
  const totalPaid = round2((payouts || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0));
  return NextResponse.json({
    earnedByMonth,
    payments: payouts || [],
    totalEarned,
    totalPaid,
    balance: round2(totalEarned - totalPaid),
  });
}

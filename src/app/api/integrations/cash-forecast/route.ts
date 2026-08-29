import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getAdminClient } from "@/lib/admin-auth";
import { isTestEnv } from "@/lib/payout-env";
import { fetchAllRows } from "@/lib/partnerships/paginate";
import {
  buildCashForecast,
  DEFAULT_HORIZON_WEEKS,
  LedgerEventRow,
  PayoutRow,
  CreatorName,
} from "@/lib/cash-forecast";

// Machine-to-machine feed for the nama-inventory cash planner: upcoming
// influencer outflows by ISO week. Contract: docs/cash-forecast-contract.md.
// Authenticated by the CASH_FORECAST_TOKEN shared secret, not a session —
// the consumer is the inventory app's server, not a browser.

export const dynamic = "force-dynamic";

function tokenOk(request: NextRequest): boolean | null {
  const expected = process.env.CASH_FORECAST_TOKEN;
  if (!expected) return null; // unconfigured — the endpoint does not exist yet
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const ok = tokenOk(request);
  if (ok === null) return NextResponse.json({ error: "Forecast endpoint not configured" }, { status: 503 });
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const weeksParam = Number(request.nextUrl.searchParams.get("weeks"));
  const horizonWeeks = Number.isFinite(weeksParam) && weeksParam > 0 ? weeksParam : DEFAULT_HORIZON_WEEKS;

  const db = getAdminClient();
  const [events, payouts, dealsRes] = await Promise.all([
    fetchAllRows<LedgerEventRow>((from, to) =>
      (db.from("commission_events") as any)
        .select("influencer_id, legacy_affiliate_id, period, amount")
        .order("id")
        .range(from, to),
    ),
    fetchAllRows<PayoutRow>((from, to) =>
      (db.from("creator_payouts") as any)
        .select("influencer_id, legacy_affiliate_id, amount, covers_period")
        .eq("is_test", isTestEnv())
        .order("id")
        .range(from, to),
    ),
    (db.from("campaign_deals") as any)
      .select("id, influencer_id, deal_kind, deal_status, whitelisting_status, total_deal_value, starts_on, payment_terms")
      .in("deal_status", ["active", "closed"]) as PromiseLike<{ data: any[] | null; error: any }>,
  ]);
  const deals = dealsRes.data || [];

  const infIds = [
    ...new Set([
      ...events.map((e) => e.influencer_id),
      ...deals.map((d: any) => d.influencer_id),
    ].filter(Boolean)),
  ] as string[];
  const legIds = [...new Set(events.map((e) => e.legacy_affiliate_id).filter(Boolean))] as string[];
  const [{ data: infs }, { data: legs }] = await Promise.all([
    (db.from("influencers") as any).select("id, name, instagram_handle").in("id", infIds.length ? infIds : ["x"]),
    (db.from("legacy_affiliates") as any).select("id, name").in("id", legIds.length ? legIds : ["x"]),
  ]);
  const names = new Map<string, CreatorName>();
  for (const i of infs || []) names.set(`inf:${i.id}`, { name: i.name, handle: i.instagram_handle });
  for (const l of legs || []) names.set(`legacy:${l.id}`, { name: l.name });

  return NextResponse.json(buildCashForecast({ events, payouts, deals, names, horizonWeeks }));
}

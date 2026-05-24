import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function dayOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Unified active-partners endpoint. Returns one row per:
//   - "partner": has a row in `creators` (a fully-onboarded account)
//   - "affiliate": in `legacy_affiliates` with no corresponding creator
//   - "whitelisted": has ads/spend in creator_ad_performance with no creator
//     and no legacy_affiliates row
// Each row's MTD revenue + ad spend share the same source as the partners
// they originate from, so totals reconcile with the page-level KPIs.
export async function GET(_request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayDay = dayOnly(today);

  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const monthStartDay = dayOnly(monthStart);

  // last_activity_at lookbacks bounded to 1y. Daily-table volume is small enough
  // (one row per ad per day) to pull without a per-influencer filter once we
  // need to surface whitelisted-only influencers.
  const yearAgo = new Date(today);
  yearAgo.setUTCDate(yearAgo.getUTCDate() - 365);
  const yearAgoDay = dayOnly(yearAgo);
  const yearAgoIso = yearAgo.toISOString();

  // 1. Fetch the base entity tables in parallel.
  const [
    creatorsRes,
    legacyRes,
    adPerfRes,
    adActivityRes,
  ] = await Promise.all([
    (db.from("creators") as any)
      .select("id, creator_name, affiliate_code, commission_rate, invite_id, onboarded_at")
      .order("onboarded_at", { ascending: false }),
    (db.from("legacy_affiliates") as any)
      .select("id, name, discount_code, commission_rate, influencer_id, status")
      .eq("status", "active"),
    (db.from("creator_ad_performance") as any)
      .select("influencer_id, instagram_handle, ads"),
    (db.from("creator_ad_performance_daily") as any)
      .select("influencer_id, date, spend, impressions")
      .gte("date", yearAgoDay),
  ]);

  const creatorList = (creatorsRes.data || []) as any[];
  const legacyList = (legacyRes.data || []) as any[];

  // 2. Resolve invite → influencer chain for creators.
  const inviteIds = creatorList.map((c) => c.invite_id).filter(Boolean);
  const creatorIds = creatorList.map((c) => c.id);

  const [invitesRes, pendingReqsRes, submissionsRes] = await Promise.all([
    inviteIds.length > 0
      ? (db.from("creator_invites") as any)
          .select("id, influencer_id, shopify_code_status, has_affiliate")
          .in("id", inviteIds)
      : Promise.resolve({ data: [] as any[] }),
    creatorIds.length > 0
      ? (db.from("creator_sample_requests") as any)
          .select("creator_id")
          .in("creator_id", creatorIds)
          .eq("status", "pending")
      : Promise.resolve({ data: [] as any[] }),
    creatorIds.length > 0
      ? (db.from("creator_content_submissions") as any)
          .select("creator_id, created_at")
          .in("creator_id", creatorIds)
          .gte("created_at", yearAgoIso)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const invitesById = new Map<string, { influencer_id: string | null; shopify_code_status: string | null; has_affiliate: boolean }>();
  for (const inv of (invitesRes.data || []) as any[]) {
    invitesById.set(String(inv.id), {
      influencer_id: inv.influencer_id || null,
      shopify_code_status: inv.shopify_code_status || null,
      has_affiliate: !!inv.has_affiliate,
    });
  }

  // 3. Build coverage sets — influencer_ids AND affiliate_codes that are already
  // claimed by an account. These take priority over legacy / whitelisted-only rows.
  // Code-based dedup catches the common case where a creator signed up later and
  // their old legacy_affiliates row was never linked to their influencer.
  const partneredInfluencerIds = new Set<string>();
  const partneredCodes = new Set<string>();
  for (const c of creatorList) {
    const invite = c.invite_id ? invitesById.get(c.invite_id) : null;
    if (invite?.influencer_id) partneredInfluencerIds.add(invite.influencer_id);
    if (c.affiliate_code) partneredCodes.add(String(c.affiliate_code).toUpperCase());
  }

  // 4. Collect every influencer_id we need to render — partnered + legacy + ad-perf.
  const legacyInfluencerIds = new Set<string>();
  for (const l of legacyList) {
    if (l.influencer_id) legacyInfluencerIds.add(String(l.influencer_id));
  }
  const adPerfInfluencerIds = new Set<string>();
  for (const row of (adPerfRes.data || []) as any[]) {
    if (row.influencer_id) adPerfInfluencerIds.add(String(row.influencer_id));
  }
  const allInfluencerIds = new Set<string>([
    ...partneredInfluencerIds,
    ...legacyInfluencerIds,
    ...adPerfInfluencerIds,
  ]);

  // 5. Pull influencers + revenue (codes union of partner + legacy).
  const partnerCodes = creatorList
    .map((c) => (c.affiliate_code ? String(c.affiliate_code).toUpperCase() : null))
    .filter(Boolean) as string[];
  const legacyCodes = legacyList
    .map((l) => (l.discount_code ? String(l.discount_code).toUpperCase() : null))
    .filter(Boolean) as string[];
  const allCodes = Array.from(new Set([...partnerCodes, ...legacyCodes]));

  const [influencersRes, revenueRes] = await Promise.all([
    allInfluencerIds.size > 0
      ? db
          .from("influencers")
          .select("id, name, instagram_handle, profile_photo_url")
          .in("id", Array.from(allInfluencerIds))
      : Promise.resolve({ data: [] as any[] }),
    allCodes.length > 0
      ? (db.from("creator_code_revenue_daily") as any)
          .select("affiliate_code, date, gross_amount, order_count")
          .in("affiliate_code", allCodes)
          .gte("date", yearAgoDay)
          .lte("date", todayDay)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const influencersById = new Map<string, { name: string | null; instagram_handle: string | null; profile_photo_url: string | null }>();
  for (const inf of (influencersRes.data || []) as any[]) {
    influencersById.set(String(inf.id), {
      name: inf.name || null,
      instagram_handle: inf.instagram_handle || null,
      profile_photo_url: inf.profile_photo_url || null,
    });
  }

  // 6. Aggregate revenue per code (MTD totals + lifetime lastOrderDay for activity).
  const revenueByCode = new Map<string, { revenue_mtd: number; orders_mtd: number; lastOrderDay: string | null }>();
  for (const row of (revenueRes.data || []) as any[]) {
    const code = String(row.affiliate_code).toUpperCase();
    const acc = revenueByCode.get(code) || { revenue_mtd: 0, orders_mtd: 0, lastOrderDay: null };
    const d = String(row.date).slice(0, 10);
    if (d >= monthStartDay && d <= todayDay) {
      acc.revenue_mtd += Number(row.gross_amount || 0);
      acc.orders_mtd += Number(row.order_count || 0);
    }
    if (Number(row.order_count || 0) > 0 && (!acc.lastOrderDay || d > acc.lastOrderDay)) {
      acc.lastOrderDay = d;
    }
    revenueByCode.set(code, acc);
  }

  // 7. Pending sample-request counts + last submission per creator.
  const pendingByCreator = new Map<string, number>();
  for (const row of (pendingReqsRes.data || []) as any[]) {
    const id = String(row.creator_id);
    pendingByCreator.set(id, (pendingByCreator.get(id) || 0) + 1);
  }
  const lastSubmissionByCreator = new Map<string, string>();
  for (const row of (submissionsRes.data || []) as any[]) {
    const id = String(row.creator_id);
    const ts = String(row.created_at);
    const prev = lastSubmissionByCreator.get(id);
    if (!prev || ts > prev) lastSubmissionByCreator.set(id, ts);
  }

  // 8. Ad spend MTD + last activity per influencer (from daily table).
  const lastAdActivityByInfluencer = new Map<string, string>();
  const adSpendMtdByInfluencer = new Map<string, number>();
  for (const row of (adActivityRes.data || []) as any[]) {
    if (!row.influencer_id) continue;
    const id = String(row.influencer_id);
    const d = String(row.date).slice(0, 10);
    const spend = Number(row.spend || 0);
    const impressions = Number(row.impressions || 0);
    if (spend > 0 || impressions > 0) {
      const prev = lastAdActivityByInfluencer.get(id);
      if (!prev || d > prev) lastAdActivityByInfluencer.set(id, d);
    }
    if (d >= monthStartDay && d <= todayDay) {
      adSpendMtdByInfluencer.set(id, (adSpendMtdByInfluencer.get(id) || 0) + spend);
    }
  }

  // 9. Ads live count per influencer.
  const adsLiveByInfluencer = new Map<string, number>();
  for (const row of (adPerfRes.data || []) as any[]) {
    if (!row.influencer_id) continue;
    const ads = Array.isArray(row.ads) ? row.ads : [];
    const active = ads.filter((a: any) => a?.effective_status === "ACTIVE").length;
    adsLiveByInfluencer.set(String(row.influencer_id), active);
  }

  // 10. Build rows — partners first, then legacy_affiliates not yet covered,
  //     then influencers with ad activity not yet covered.
  type Row = {
    row_id: string;
    status: "partner" | "affiliate" | "whitelisted";
    creator_id: string | null;
    creator_name: string | null;
    invite_id: string | null;
    influencer_id: string | null;
    name: string | null;
    handle: string | null;
    photo: string | null;
    affiliate_code: string | null;
    shopify_code_status: string | null;
    has_affiliate: boolean;
    commission_rate: number | null;
    revenue_mtd: number;
    orders_mtd: number;
    ad_spend_mtd: number;
    ads_live: number;
    pending_requests_count: number;
    last_activity_at: string | null;
  };

  const rows: Row[] = [];
  const coveredInfluencerIds = new Set<string>();

  // Partners
  for (const c of creatorList) {
    const invite = c.invite_id ? invitesById.get(c.invite_id) : null;
    const influencerId = invite?.influencer_id ?? null;
    if (influencerId) coveredInfluencerIds.add(influencerId);

    const inf = influencerId ? influencersById.get(influencerId) : null;
    const code = c.affiliate_code ? String(c.affiliate_code).toUpperCase() : null;
    const rev = code ? revenueByCode.get(code) : null;

    const candidates: string[] = [];
    if (rev?.lastOrderDay) candidates.push(`${rev.lastOrderDay}T00:00:00.000Z`);
    const sub = lastSubmissionByCreator.get(c.id);
    if (sub) candidates.push(sub);
    if (influencerId) {
      const adDay = lastAdActivityByInfluencer.get(influencerId);
      if (adDay) candidates.push(`${adDay}T00:00:00.000Z`);
    }
    const lastActivityAt = candidates.length > 0 ? candidates.sort().slice(-1)[0] : null;

    rows.push({
      row_id: `partner:${c.id}`,
      status: "partner",
      creator_id: c.id,
      creator_name: c.creator_name || null,
      invite_id: c.invite_id || null,
      influencer_id: influencerId,
      name: inf?.name || c.creator_name || null,
      handle: inf?.instagram_handle || null,
      photo: inf?.profile_photo_url || null,
      affiliate_code: code,
      shopify_code_status: invite?.shopify_code_status ?? null,
      has_affiliate: invite?.has_affiliate ?? false,
      commission_rate: c.commission_rate,
      revenue_mtd: rev ? Math.round(rev.revenue_mtd * 100) / 100 : 0,
      orders_mtd: rev?.orders_mtd || 0,
      ad_spend_mtd: influencerId
        ? Math.round((adSpendMtdByInfluencer.get(influencerId) || 0) * 100) / 100
        : 0,
      ads_live: influencerId ? adsLiveByInfluencer.get(influencerId) || 0 : 0,
      pending_requests_count: pendingByCreator.get(c.id) || 0,
      last_activity_at: lastActivityAt,
    });
  }

  // Legacy affiliates — skip if their influencer is already a partner, or if
  // their discount_code matches an existing creator's affiliate_code (catches
  // duplicate legacy rows for creators who signed up after the legacy import).
  for (const l of legacyList) {
    const influencerId = l.influencer_id ? String(l.influencer_id) : null;
    const code = l.discount_code ? String(l.discount_code).toUpperCase() : null;
    if (influencerId && coveredInfluencerIds.has(influencerId)) continue;
    if (code && partneredCodes.has(code)) continue;
    if (influencerId) coveredInfluencerIds.add(influencerId);

    const inf = influencerId ? influencersById.get(influencerId) : null;
    const rev = code ? revenueByCode.get(code) : null;

    const candidates: string[] = [];
    if (rev?.lastOrderDay) candidates.push(`${rev.lastOrderDay}T00:00:00.000Z`);
    if (influencerId) {
      const adDay = lastAdActivityByInfluencer.get(influencerId);
      if (adDay) candidates.push(`${adDay}T00:00:00.000Z`);
    }
    const lastActivityAt = candidates.length > 0 ? candidates.sort().slice(-1)[0] : null;

    rows.push({
      row_id: `affiliate:${l.id}`,
      status: "affiliate",
      creator_id: null,
      creator_name: null,
      invite_id: null,
      influencer_id: influencerId,
      name: inf?.name || l.name || null,
      handle: inf?.instagram_handle || null,
      photo: inf?.profile_photo_url || null,
      affiliate_code: code,
      shopify_code_status: null,
      has_affiliate: true,
      commission_rate: l.commission_rate ?? null,
      revenue_mtd: rev ? Math.round(rev.revenue_mtd * 100) / 100 : 0,
      orders_mtd: rev?.orders_mtd || 0,
      ad_spend_mtd: influencerId
        ? Math.round((adSpendMtdByInfluencer.get(influencerId) || 0) * 100) / 100
        : 0,
      ads_live: influencerId ? adsLiveByInfluencer.get(influencerId) || 0 : 0,
      pending_requests_count: 0,
      last_activity_at: lastActivityAt,
    });
  }

  // Whitelisted-only — influencers with ads/spend not yet covered, and only if
  // they have meaningful activity (any ad spend in window OR ads currently live).
  for (const id of adPerfInfluencerIds) {
    if (coveredInfluencerIds.has(id)) continue;
    const adSpendMtd = adSpendMtdByInfluencer.get(id) || 0;
    const adsLive = adsLiveByInfluencer.get(id) || 0;
    if (adSpendMtd <= 0 && adsLive <= 0) continue;
    coveredInfluencerIds.add(id);

    const inf = influencersById.get(id);
    const adDay = lastAdActivityByInfluencer.get(id);

    rows.push({
      row_id: `whitelisted:${id}`,
      status: "whitelisted",
      creator_id: null,
      creator_name: null,
      invite_id: null,
      influencer_id: id,
      name: inf?.name || null,
      handle: inf?.instagram_handle || null,
      photo: inf?.profile_photo_url || null,
      affiliate_code: null,
      shopify_code_status: null,
      has_affiliate: false,
      commission_rate: null,
      revenue_mtd: 0,
      orders_mtd: 0,
      ad_spend_mtd: Math.round(adSpendMtd * 100) / 100,
      ads_live: adsLive,
      pending_requests_count: 0,
      last_activity_at: adDay ? `${adDay}T00:00:00.000Z` : null,
    });
  }

  return NextResponse.json({ partners: rows });
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function dayOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// One row per influencer (the canonical person). Roles overlay as flags:
//   is_partner     — has an active creators row via the invite chain
//   is_affiliate   — has a legacy_affiliates row (not yet covered by a partner)
//   is_whitelisted — has Meta ad activity (ads live or 30d spend) and is not a partner
//
// Headless legacy affiliates (legacy_affiliates.influencer_id IS NULL with no
// matching partner code) appear as a final batch keyed by `legacy:<uuid>` so
// they're visible but flagged for cleanup.
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

  const yearAgo = new Date(today);
  yearAgo.setUTCDate(yearAgo.getUTCDate() - 365);
  const yearAgoDay = dayOnly(yearAgo);
  const yearAgoIso = yearAgo.toISOString();

  // 1. Pull every source table in parallel.
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

  // 2. Resolve invites for the partner chain.
  const inviteIds = creatorList.map((c) => c.invite_id).filter(Boolean);
  const creatorIds = creatorList.map((c) => c.id);

  const [invitesRes, pendingReqsRes, submissionsRes] = await Promise.all([
    inviteIds.length > 0
      ? (db.from("creator_invites") as any)
          .select("id, influencer_id, shopify_code_status, has_affiliate, has_retainer")
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

  const invitesById = new Map<string, { influencer_id: string | null; shopify_code_status: string | null; has_affiliate: boolean; has_retainer: boolean }>();
  for (const inv of (invitesRes.data || []) as any[]) {
    invitesById.set(String(inv.id), {
      influencer_id: inv.influencer_id || null,
      shopify_code_status: inv.shopify_code_status || null,
      has_affiliate: !!inv.has_affiliate,
      has_retainer: !!inv.has_retainer,
    });
  }

  // 3. Collect all influencer_ids we need to render or look up.
  const allInfluencerIds = new Set<string>();
  for (const c of creatorList) {
    const inv = c.invite_id ? invitesById.get(c.invite_id) : null;
    if (inv?.influencer_id) allInfluencerIds.add(inv.influencer_id);
  }
  for (const l of legacyList) if (l.influencer_id) allInfluencerIds.add(String(l.influencer_id));
  for (const row of (adPerfRes.data || []) as any[]) {
    if (row.influencer_id) allInfluencerIds.add(String(row.influencer_id));
  }

  // 4. Fetch influencer profiles + revenue (codes union of partner + legacy).
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
          .select("id, name, instagram_handle, profile_photo_url, shopify_order_id, shopify_order_status, product_selections")
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

  const influencersById = new Map<string, { name: string | null; instagram_handle: string | null; profile_photo_url: string | null; shopify_order_id: string | null; shopify_order_status: string | null; product_selections: any[] | null }>();
  for (const inf of (influencersRes.data || []) as any[]) {
    influencersById.set(String(inf.id), {
      name: inf.name || null,
      instagram_handle: inf.instagram_handle || null,
      profile_photo_url: inf.profile_photo_url || null,
      shopify_order_id: inf.shopify_order_id || null,
      shopify_order_status: inf.shopify_order_status || null,
      product_selections: inf.product_selections || null,
    });
  }

  // 5. Aggregate revenue per affiliate_code.
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

  // 6. Pending sample-requests + last content submission per creator.
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

  // 7. Ad spend MTD + last activity per influencer.
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

  // 8. Ads live per influencer.
  const adsLiveByInfluencer = new Map<string, number>();
  for (const row of (adPerfRes.data || []) as any[]) {
    if (!row.influencer_id) continue;
    const ads = Array.isArray(row.ads) ? row.ads : [];
    const active = ads.filter((a: any) => a?.effective_status === "ACTIVE").length;
    adsLiveByInfluencer.set(String(row.influencer_id), active);
  }

  // 9. Build influencer-keyed row map. Each role layered on top of any existing
  // row for the same influencer.
  type Row = {
    row_id: string;
    influencer_id: string | null;
    name: string | null;
    handle: string | null;
    photo: string | null;
    is_partner: boolean;
    is_affiliate: boolean;
    is_whitelisted: boolean;
    creator_id: string | null;
    creator_name: string | null;
    invite_id: string | null;
    affiliate_code: string | null;
    shopify_code_status: string | null;
    has_affiliate: boolean;
    has_retainer: boolean;
    commission_rate: number | null;
    revenue_mtd: number;
    orders_mtd: number;
    ad_spend_mtd: number;
    ads_live: number;
    pending_requests_count: number;
    last_activity_at: string | null;
    shopify_order_id: string | null;
    shopify_order_status: string | null;
    product_selections: any[] | null;
  };

  const rowsByInfluencer = new Map<string, Row>();
  const partneredCodes = new Set<string>();

  const newRow = (influencerId: string | null): Row => ({
    row_id: influencerId ? `influencer:${influencerId}` : "",
    influencer_id: influencerId,
    name: null,
    handle: null,
    photo: null,
    is_partner: false,
    is_affiliate: false,
    is_whitelisted: false,
    creator_id: null,
    creator_name: null,
    invite_id: null,
    affiliate_code: null,
    shopify_code_status: null,
    has_affiliate: false,
    has_retainer: false,
    commission_rate: null,
    revenue_mtd: 0,
    orders_mtd: 0,
    ad_spend_mtd: 0,
    ads_live: 0,
    pending_requests_count: 0,
    last_activity_at: null,
    shopify_order_id: null,
    shopify_order_status: null,
    product_selections: null,
  });

  const mergeActivity = (row: Row, candidate: string | null) => {
    if (!candidate) return;
    if (!row.last_activity_at || candidate > row.last_activity_at) {
      row.last_activity_at = candidate;
    }
  };

  // 9a. Partners — these establish the canonical influencer row.
  for (const c of creatorList) {
    const invite = c.invite_id ? invitesById.get(c.invite_id) : null;
    const influencerId = invite?.influencer_id ?? null;
    if (!influencerId) {
      // Partner without an influencer link — show as a partner-only row keyed
      // on creator_id so they don't get lost.
      const row = newRow(null);
      row.row_id = `partner:${c.id}`;
      row.is_partner = true;
      row.name = c.creator_name || null;
      row.creator_id = c.id;
      row.creator_name = c.creator_name || null;
      row.invite_id = c.invite_id || null;
      const code = c.affiliate_code ? String(c.affiliate_code).toUpperCase() : null;
      row.affiliate_code = code;
      if (code) partneredCodes.add(code);
      const rev = code ? revenueByCode.get(code) : null;
      row.revenue_mtd = rev ? Math.round(rev.revenue_mtd * 100) / 100 : 0;
      row.orders_mtd = rev?.orders_mtd || 0;
      row.shopify_code_status = invite?.shopify_code_status ?? null;
      row.has_affiliate = invite?.has_affiliate ?? false;
      row.has_retainer = invite?.has_retainer ?? false;
      row.commission_rate = c.commission_rate;
      row.pending_requests_count = pendingByCreator.get(c.id) || 0;
      if (rev?.lastOrderDay) mergeActivity(row, `${rev.lastOrderDay}T00:00:00.000Z`);
      const sub = lastSubmissionByCreator.get(c.id);
      if (sub) mergeActivity(row, sub);
      rowsByInfluencer.set(row.row_id, row);
      continue;
    }

    const row = rowsByInfluencer.get(`influencer:${influencerId}`) || newRow(influencerId);
    row.is_partner = true;
    const inf = influencersById.get(influencerId);
    row.name = inf?.name || c.creator_name || null;
    row.handle = inf?.instagram_handle || null;
    row.photo = inf?.profile_photo_url || null;
    row.creator_id = c.id;
    row.creator_name = c.creator_name || null;
    row.invite_id = c.invite_id || null;
    const code = c.affiliate_code ? String(c.affiliate_code).toUpperCase() : null;
    row.affiliate_code = code;
    if (code) partneredCodes.add(code);
    row.shopify_code_status = invite?.shopify_code_status ?? null;
    row.has_affiliate = invite?.has_affiliate ?? false;
    row.has_retainer = invite?.has_retainer ?? false;
    row.commission_rate = c.commission_rate;
    row.pending_requests_count = pendingByCreator.get(c.id) || 0;

    const rev = code ? revenueByCode.get(code) : null;
    row.revenue_mtd += rev ? Math.round(rev.revenue_mtd * 100) / 100 : 0;
    row.orders_mtd += rev?.orders_mtd || 0;
    if (rev?.lastOrderDay) mergeActivity(row, `${rev.lastOrderDay}T00:00:00.000Z`);

    const sub = lastSubmissionByCreator.get(c.id);
    if (sub) mergeActivity(row, sub);

    rowsByInfluencer.set(`influencer:${influencerId}`, row);
  }

  // 9b. Legacy affiliates — layer affiliate flag onto matching influencer rows.
  // Skip if the legacy code is already represented by a partner (dedup).
  const headlessLegacy: Row[] = [];
  for (const l of legacyList) {
    const code = l.discount_code ? String(l.discount_code).toUpperCase() : null;
    if (code && partneredCodes.has(code)) continue;
    const influencerId = l.influencer_id ? String(l.influencer_id) : null;
    if (!influencerId) {
      // No influencer link — create a headless row that the user can clean up.
      const row = newRow(null);
      row.row_id = `legacy:${l.id}`;
      row.is_affiliate = true;
      row.name = l.name || null;
      row.affiliate_code = code;
      row.commission_rate = l.commission_rate ?? null;
      row.has_affiliate = true;
      const rev = code ? revenueByCode.get(code) : null;
      row.revenue_mtd = rev ? Math.round(rev.revenue_mtd * 100) / 100 : 0;
      row.orders_mtd = rev?.orders_mtd || 0;
      if (rev?.lastOrderDay) mergeActivity(row, `${rev.lastOrderDay}T00:00:00.000Z`);
      headlessLegacy.push(row);
      continue;
    }

    const row = rowsByInfluencer.get(`influencer:${influencerId}`) || newRow(influencerId);
    row.is_affiliate = true;
    const inf = influencersById.get(influencerId);
    if (!row.name) row.name = inf?.name || l.name || null;
    if (!row.handle) row.handle = inf?.instagram_handle || null;
    if (!row.photo) row.photo = inf?.profile_photo_url || null;
    if (!row.affiliate_code) row.affiliate_code = code;
    if (row.commission_rate == null) row.commission_rate = l.commission_rate ?? null;
    row.has_affiliate = true;

    const rev = code ? revenueByCode.get(code) : null;
    if (rev) {
      row.revenue_mtd += Math.round(rev.revenue_mtd * 100) / 100;
      row.orders_mtd += rev.orders_mtd || 0;
      if (rev.lastOrderDay) mergeActivity(row, `${rev.lastOrderDay}T00:00:00.000Z`);
    }

    rowsByInfluencer.set(`influencer:${influencerId}`, row);
  }

  // 9c. Whitelisting layer — for every influencer with ad activity, attach
  // the metrics and (if not a partner) flag is_whitelisted.
  for (const influencerIdRaw of allInfluencerIds) {
    const influencerId = String(influencerIdRaw);
    const spend = adSpendMtdByInfluencer.get(influencerId) || 0;
    const ads = adsLiveByInfluencer.get(influencerId) || 0;
    const adDay = lastAdActivityByInfluencer.get(influencerId);
    if (spend <= 0 && ads <= 0 && !adDay) continue;

    const row = rowsByInfluencer.get(`influencer:${influencerId}`) || newRow(influencerId);
    if (row.row_id === "") row.row_id = `influencer:${influencerId}`;
    const inf = influencersById.get(influencerId);
    if (!row.name) row.name = inf?.name || null;
    if (!row.handle) row.handle = inf?.instagram_handle || null;
    if (!row.photo) row.photo = inf?.profile_photo_url || null;
    row.ad_spend_mtd = Math.round(spend * 100) / 100;
    row.ads_live = ads;
    if (!row.is_partner && (ads > 0 || spend > 0)) row.is_whitelisted = true;
    if (adDay) mergeActivity(row, `${adDay}T00:00:00.000Z`);

    rowsByInfluencer.set(`influencer:${influencerId}`, row);
  }

  // 9d. Order state — attach the influencer's current draft/order so the
  // partners table can render the Order column (cart icon / status dot).
  for (const row of rowsByInfluencer.values()) {
    if (!row.influencer_id) continue;
    const inf = influencersById.get(row.influencer_id);
    if (!inf) continue;
    row.shopify_order_id = inf.shopify_order_id;
    row.shopify_order_status = inf.shopify_order_status;
    row.product_selections = inf.product_selections;
  }

  // 10. Final ordering — partners first (preserving onboarded_at), then by
  // revenue desc within each role bucket.
  const rows = [...rowsByInfluencer.values(), ...headlessLegacy];
  rows.sort((a, b) => {
    if (a.is_partner !== b.is_partner) return a.is_partner ? -1 : 1;
    return (b.revenue_mtd || 0) - (a.revenue_mtd || 0);
  });

  return NextResponse.json({ partners: rows });
}

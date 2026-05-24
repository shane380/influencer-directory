import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function dayOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Replaces the N+1 fan-out at src/app/partnerships/creators/page.tsx:206-254.
// Single batched response containing everything the active-partners table needs,
// using parallel Supabase queries + JS reduction (no Postgres view/RPC required).
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

  const thirtyAgo = new Date(today);
  thirtyAgo.setUTCDate(thirtyAgo.getUTCDate() - 29);
  const thirtyAgoDay = dayOnly(thirtyAgo);

  // last_activity_at lookbacks bounded to 1y — anything older won't affect
  // ordering of an "active partners" table and keeps payloads modest.
  const yearAgo = new Date(today);
  yearAgo.setUTCDate(yearAgo.getUTCDate() - 365);
  const yearAgoDay = dayOnly(yearAgo);
  const yearAgoIso = yearAgo.toISOString();

  // 1. Base creators list — same ordering as the current page (onboarded_at desc).
  const { data: creators } = await (db.from("creators") as any)
    .select("id, creator_name, affiliate_code, commission_rate, invite_id, onboarded_at")
    .order("onboarded_at", { ascending: false });

  type Creator = {
    id: string;
    creator_name: string | null;
    affiliate_code: string | null;
    commission_rate: number | null;
    invite_id: string | null;
    onboarded_at: string | null;
  };
  const creatorList: Creator[] = (creators as any[]) || [];

  if (creatorList.length === 0) {
    return NextResponse.json({ partners: [] });
  }

  const inviteIds = creatorList.map((c) => c.invite_id).filter(Boolean) as string[];
  const creatorIds = creatorList.map((c) => c.id);
  const codes = Array.from(
    new Set(
      creatorList
        .map((c) => (c.affiliate_code ? String(c.affiliate_code).toUpperCase() : null))
        .filter(Boolean) as string[],
    ),
  );

  // 2. Batched parallel queries for everything the row needs.
  const [
    invitesRes,
    revenueRes,
    pendingReqsRes,
    submissionsRes,
  ] = await Promise.all([
    inviteIds.length > 0
      ? (db.from("creator_invites") as any)
          .select("id, influencer_id, shopify_code_status, has_affiliate")
          .in("id", inviteIds)
      : Promise.resolve({ data: [] as any[] }),
    codes.length > 0
      ? (db.from("creator_code_revenue_daily") as any)
          .select("affiliate_code, date, gross_amount, order_count")
          .in("affiliate_code", codes)
          .gte("date", yearAgoDay)
          .lte("date", todayDay)
      : Promise.resolve({ data: [] as any[] }),
    (db.from("creator_sample_requests") as any)
      .select("creator_id")
      .in("creator_id", creatorIds)
      .eq("status", "pending"),
    (db.from("creator_content_submissions") as any)
      .select("creator_id, created_at")
      .in("creator_id", creatorIds)
      .gte("created_at", yearAgoIso),
  ]);

  // 3. Influencer join via invites.
  const invites = (invitesRes.data || []) as any[];
  const invitesById = new Map<string, { influencer_id: string | null; shopify_code_status: string | null; has_affiliate: boolean }>();
  for (const inv of invites) {
    invitesById.set(String(inv.id), {
      influencer_id: inv.influencer_id || null,
      shopify_code_status: inv.shopify_code_status || null,
      has_affiliate: !!inv.has_affiliate,
    });
  }
  const influencerIds = Array.from(
    new Set(
      Array.from(invitesById.values())
        .map((v) => v.influencer_id)
        .filter(Boolean) as string[],
    ),
  );

  // Fetch influencers + ad-activity in parallel now that we know the ids.
  const [influencersRes, adActivityRes] = await Promise.all([
    influencerIds.length > 0
      ? db
          .from("influencers")
          .select("id, name, instagram_handle, profile_photo_url")
          .in("id", influencerIds)
      : Promise.resolve({ data: [] as any[] }),
    influencerIds.length > 0
      ? (db.from("creator_ad_performance_daily") as any)
          .select("influencer_id, date, spend, impressions")
          .in("influencer_id", influencerIds)
          .gte("date", yearAgoDay)
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

  // 4. Aggregate revenue per affiliate_code (30d window only).
  const revenueByCode = new Map<string, { revenue_30d: number; orders_30d: number; lastOrderDay: string | null }>();
  for (const row of (revenueRes.data || []) as any[]) {
    const code = String(row.affiliate_code).toUpperCase();
    const acc = revenueByCode.get(code) || { revenue_30d: 0, orders_30d: 0, lastOrderDay: null };
    const d = String(row.date).slice(0, 10);
    if (d >= thirtyAgoDay && d <= todayDay) {
      acc.revenue_30d += Number(row.gross_amount || 0);
      acc.orders_30d += Number(row.order_count || 0);
    }
    if (Number(row.order_count || 0) > 0) {
      if (!acc.lastOrderDay || d > acc.lastOrderDay) acc.lastOrderDay = d;
    }
    revenueByCode.set(code, acc);
  }

  // 5. Pending sample-request count per creator.
  const pendingByCreator = new Map<string, number>();
  for (const row of (pendingReqsRes.data || []) as any[]) {
    const id = String(row.creator_id);
    pendingByCreator.set(id, (pendingByCreator.get(id) || 0) + 1);
  }

  // 6. Last content submission per creator.
  const lastSubmissionByCreator = new Map<string, string>();
  for (const row of (submissionsRes.data || []) as any[]) {
    const id = String(row.creator_id);
    const ts = String(row.created_at);
    const prev = lastSubmissionByCreator.get(id);
    if (!prev || ts > prev) lastSubmissionByCreator.set(id, ts);
  }

  // 7. Last ad activity per influencer (max date with any spend or impressions).
  const lastAdActivityByInfluencer = new Map<string, string>();
  for (const row of (adActivityRes.data || []) as any[]) {
    if (!(Number(row.spend) > 0 || Number(row.impressions) > 0)) continue;
    const id = String(row.influencer_id);
    const d = String(row.date).slice(0, 10);
    const prev = lastAdActivityByInfluencer.get(id);
    if (!prev || d > prev) lastAdActivityByInfluencer.set(id, d);
  }

  // 8. Build response rows.
  const partners = creatorList.map((c) => {
    const invite = c.invite_id ? invitesById.get(c.invite_id) : null;
    const inf = invite?.influencer_id ? influencersById.get(invite.influencer_id) : null;
    const code = c.affiliate_code ? String(c.affiliate_code).toUpperCase() : null;
    const rev = code ? revenueByCode.get(code) : null;

    // last_activity_at = max of last code order day, last content submission, last ad activity
    const candidates: string[] = [];
    if (rev?.lastOrderDay) candidates.push(`${rev.lastOrderDay}T00:00:00.000Z`);
    const sub = lastSubmissionByCreator.get(c.id);
    if (sub) candidates.push(sub);
    if (invite?.influencer_id) {
      const adDay = lastAdActivityByInfluencer.get(invite.influencer_id);
      if (adDay) candidates.push(`${adDay}T00:00:00.000Z`);
    }
    const lastActivityAt = candidates.length > 0 ? candidates.sort().slice(-1)[0] : null;

    return {
      creator_id: c.id,
      name: inf?.name || c.creator_name || null,
      handle: inf?.instagram_handle || null,
      photo: inf?.profile_photo_url || null,
      affiliate_code: code,
      shopify_code_status: invite?.shopify_code_status ?? null,
      has_affiliate: invite?.has_affiliate ?? false,
      commission_rate: c.commission_rate,
      revenue_30d: rev ? Math.round(rev.revenue_30d * 100) / 100 : 0,
      orders_30d: rev?.orders_30d || 0,
      pending_requests_count: pendingByCreator.get(c.id) || 0,
      last_activity_at: lastActivityAt,
    };
  });

  return NextResponse.json({ partners });
}

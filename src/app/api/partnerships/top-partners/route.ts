import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function dayOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseMonth(s: string | null): { start: string; end: string } {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  if (s && /^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split("-").map((n) => parseInt(n, 10));
    year = y;
    month = m - 1;
  }
  const start = new Date(Date.UTC(year, month, 1));
  const endExclusive = new Date(Date.UTC(year, month + 1, 1));
  const end = new Date(endExclusive.getTime() - 86400000);
  return { start: dayOnly(start), end: dayOnly(end) };
}

export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const monthParam = request.nextUrl.searchParams.get("month");
  const limitParam = parseInt(request.nextUrl.searchParams.get("limit") || "5", 10);
  const limit = Math.max(1, Math.min(limitParam, 50));
  const { start, end } = parseMonth(monthParam);

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Pull partner codes (creators) AND standalone/legacy affiliate codes, so
  // the ranking covers every affiliate regardless of partnership type.
  const [{ data: creators }, { data: legacy }] = await Promise.all([
    (db.from("creators") as any)
      .select("id, creator_name, affiliate_code, invite_id")
      .not("affiliate_code", "is", null),
    (db.from("legacy_affiliates") as any)
      .select("name, discount_code, influencer_id")
      .eq("status", "active")
      .not("discount_code", "is", null),
  ]);

  // Resolve each partner's influencer via the invite chain.
  const creatorRows = ((creators as any[]) || [])
    .map((c) => ({
      id: c.id as string,
      creator_name: (c.creator_name as string | null) ?? null,
      code: String(c.affiliate_code || "").toUpperCase(),
      invite_id: (c.invite_id as string | null) ?? null,
    }))
    .filter((c) => c.code);
  const inviteIds = creatorRows.map((c) => c.invite_id).filter(Boolean) as string[];
  let inviteInfluencer = new Map<string, string | null>();
  if (inviteIds.length > 0) {
    const { data: invites } = await (db.from("creator_invites") as any)
      .select("id, influencer_id")
      .in("id", inviteIds);
    inviteInfluencer = new Map(
      ((invites as any[]) || []).map((i) => [String(i.id), i.influencer_id || null]),
    );
  }

  // One entry per code. Partner rows win; legacy fills codes no partner owns.
  type Entry = { code: string; name: string | null; influencer_id: string | null; creator_id: string | null };
  const entryByCode = new Map<string, Entry>();
  for (const c of creatorRows) {
    if (entryByCode.has(c.code)) continue;
    entryByCode.set(c.code, {
      code: c.code,
      name: c.creator_name,
      influencer_id: c.invite_id ? inviteInfluencer.get(c.invite_id) ?? null : null,
      creator_id: c.id,
    });
  }
  for (const l of (legacy as any[]) || []) {
    const code = String(l.discount_code || "").toUpperCase();
    if (!code || entryByCode.has(code)) continue;
    entryByCode.set(code, { code, name: l.name || null, influencer_id: l.influencer_id || null, creator_id: null });
  }

  const codes = Array.from(entryByCode.keys());
  if (codes.length === 0) {
    return NextResponse.json({ month: start.slice(0, 7), partners: [] });
  }

  // 2. Daily revenue rows for the month
  const { data: revRows } = await (db.from("creator_code_revenue_daily") as any)
    .select("affiliate_code, gross_amount, order_count")
    .in("affiliate_code", codes)
    .gte("date", start)
    .lte("date", end);

  const revByCode = new Map<string, { revenue: number; orders: number }>();
  for (const row of (revRows as any[]) || []) {
    const code = String(row.affiliate_code).toUpperCase();
    const acc = revByCode.get(code) || { revenue: 0, orders: 0 };
    acc.revenue += Number(row.gross_amount || 0);
    acc.orders += Number(row.order_count || 0);
    revByCode.set(code, acc);
  }

  // 3. Rank every affiliate by revenue, take top N.
  const ranked = Array.from(entryByCode.values())
    .map((e) => {
      const r = revByCode.get(e.code) || { revenue: 0, orders: 0 };
      return { ...e, revenue: r.revenue, orders: r.orders };
    })
    .filter((e) => e.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);

  if (ranked.length === 0) {
    return NextResponse.json({ month: start.slice(0, 7), partners: [] });
  }

  // 4. Join influencer profiles (name/handle/photo) for the top N.
  const influencerIds = Array.from(
    new Set(ranked.map((e) => e.influencer_id).filter(Boolean) as string[]),
  );
  let influencersById = new Map<string, { name: string | null; instagram_handle: string | null; profile_photo_url: string | null }>();
  if (influencerIds.length > 0) {
    const { data: infs } = await db
      .from("influencers")
      .select("id, name, instagram_handle, profile_photo_url")
      .in("id", influencerIds);
    influencersById = new Map(
      ((infs as any[]) || []).map((i) => [
        String(i.id),
        { name: i.name, instagram_handle: i.instagram_handle, profile_photo_url: i.profile_photo_url },
      ]),
    );
  }

  const partners = ranked.map((e) => {
    const inf = e.influencer_id ? influencersById.get(e.influencer_id) : null;
    return {
      creator_id: e.creator_id,
      influencer_id: e.influencer_id,
      name: inf?.name || e.name || null,
      handle: inf?.instagram_handle || null,
      photo: inf?.profile_photo_url || null,
      affiliate_code: e.code,
      revenue: Math.round(e.revenue * 100) / 100,
      orders: e.orders,
    };
  });

  return NextResponse.json({
    month: start.slice(0, 7),
    window: { start, end },
    partners,
  });
}

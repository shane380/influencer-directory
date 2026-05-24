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

  // 1. Pull active creators with their affiliate codes + invite mapping for influencer join.
  const { data: creators } = await (db.from("creators") as any)
    .select("id, creator_name, affiliate_code, commission_rate, invite_id")
    .not("affiliate_code", "is", null);

  type Creator = {
    id: string;
    creator_name: string | null;
    affiliate_code: string;
    commission_rate: number | null;
    invite_id: string | null;
  };
  const creatorList: Creator[] = (creators as any[] || []).map((c) => ({
    id: c.id,
    creator_name: c.creator_name,
    affiliate_code: String(c.affiliate_code || "").toUpperCase(),
    commission_rate: c.commission_rate,
    invite_id: c.invite_id,
  })).filter((c) => c.affiliate_code);

  if (creatorList.length === 0) {
    return NextResponse.json({ month: monthParam || dayOnly(new Date()).slice(0, 7), partners: [] });
  }

  // 2. Daily revenue rows for the month
  const codes = Array.from(new Set(creatorList.map((c) => c.affiliate_code)));
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

  // 3. Build ranked list, then pull influencer name/handle/photo for the top N.
  const ranked = creatorList
    .map((c) => {
      const r = revByCode.get(c.affiliate_code) || { revenue: 0, orders: 0 };
      return { ...c, revenue: r.revenue, orders: r.orders };
    })
    .filter((c) => c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);

  if (ranked.length === 0) {
    return NextResponse.json({ month: start.slice(0, 7), partners: [] });
  }

  const inviteIds = ranked.map((c) => c.invite_id).filter(Boolean) as string[];
  let invitesById = new Map<string, { influencer_id: string | null }>();
  if (inviteIds.length > 0) {
    const { data: invites } = await (db.from("creator_invites") as any)
      .select("id, influencer_id")
      .in("id", inviteIds);
    invitesById = new Map(
      ((invites as any[]) || []).map((i) => [String(i.id), { influencer_id: i.influencer_id }]),
    );
  }

  const influencerIds = Array.from(
    new Set(
      Array.from(invitesById.values())
        .map((v) => v.influencer_id)
        .filter(Boolean) as string[],
    ),
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
        {
          name: i.name,
          instagram_handle: i.instagram_handle,
          profile_photo_url: i.profile_photo_url,
        },
      ]),
    );
  }

  const partners = ranked.map((c) => {
    const invite = c.invite_id ? invitesById.get(c.invite_id) : null;
    const inf = invite?.influencer_id ? influencersById.get(invite.influencer_id) : null;
    return {
      creator_id: c.id,
      name: inf?.name || c.creator_name || null,
      handle: inf?.instagram_handle || null,
      photo: inf?.profile_photo_url || null,
      affiliate_code: c.affiliate_code,
      revenue: Math.round(c.revenue * 100) / 100,
      orders: c.orders,
    };
  });

  return NextResponse.json({
    month: start.slice(0, 7),
    window: { start, end },
    partners,
  });
}

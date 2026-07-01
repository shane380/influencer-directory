import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { resolveWindow, previousWindow } from "@/lib/partnerships/window";
import { loadProfiles, resolveCreatorIds } from "@/lib/partnerships/lookup";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function pct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

type Mover = {
  creator_id: string | null;
  influencer_id: string | null;
  name: string | null;
  handle: string | null;
  photo: string | null;
  current: number;
  previous: number;
  delta: number;
  pct_change: number | null;
  roas?: number | null;
};

// Rank into risers (biggest $ increase) + fallers (biggest $ decrease). Ranking
// by dollar delta — not %, which explodes on tiny bases — surfaces who actually
// moved the most money. Entries flat in both windows are dropped.
function splitMovers(all: Mover[], limit: number): { risers: Mover[]; fallers: Mover[] } {
  const active = all.filter((m) => m.current > 0 || m.previous > 0);
  const risers = active
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, limit);
  const fallers = active
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit);
  return { risers, fallers };
}

export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const category = params.get("category") === "whitelisting" ? "whitelisting" : "affiliate";
  const limit = Math.max(1, Math.min(parseInt(params.get("limit") || "5", 10), 25));
  const { start, end } = resolveWindow(params.get("start"), params.get("end"));
  const { prevStart, prevEnd } = previousWindow(start, end);

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (category === "affiliate") {
    const movers = await affiliateMovers(db, start, end, prevStart, prevEnd);
    return NextResponse.json({ category, window: { start, end }, ...splitMovers(movers, limit) });
  }
  const movers = await whitelistingMovers(db, start, end, prevStart, prevEnd);
  return NextResponse.json({ category, window: { start, end }, ...splitMovers(movers, limit) });
}

async function affiliateMovers(
  db: any, start: string, end: string, prevStart: string, prevEnd: string,
): Promise<Mover[]> {
  // One entry per affiliate code — partner rows win, legacy fills the rest.
  const [{ data: creators }, { data: legacy }] = await Promise.all([
    db.from("creators").select("id, creator_name, affiliate_code, invite_id").not("affiliate_code", "is", null),
    db.from("legacy_affiliates").select("name, discount_code, influencer_id").eq("status", "active").not("discount_code", "is", null),
  ]);

  const creatorRows = ((creators as any[]) || [])
    .map((c) => ({ id: c.id as string, name: c.creator_name ?? null, code: String(c.affiliate_code || "").toUpperCase(), invite_id: c.invite_id ?? null }))
    .filter((c) => c.code);
  const inviteIds = creatorRows.map((c) => c.invite_id).filter(Boolean) as string[];
  let inviteInfluencer = new Map<string, string | null>();
  if (inviteIds.length > 0) {
    const { data: invites } = await db.from("creator_invites").select("id, influencer_id").in("id", inviteIds);
    inviteInfluencer = new Map(((invites as any[]) || []).map((i) => [String(i.id), i.influencer_id || null]));
  }

  type Entry = { code: string; name: string | null; influencer_id: string | null; creator_id: string | null };
  const entryByCode = new Map<string, Entry>();
  for (const c of creatorRows) {
    if (entryByCode.has(c.code)) continue;
    entryByCode.set(c.code, { code: c.code, name: c.name, influencer_id: c.invite_id ? inviteInfluencer.get(c.invite_id) ?? null : null, creator_id: c.id });
  }
  for (const l of (legacy as any[]) || []) {
    const code = String(l.discount_code || "").toUpperCase();
    if (!code || entryByCode.has(code)) continue;
    entryByCode.set(code, { code, name: l.name || null, influencer_id: l.influencer_id || null, creator_id: null });
  }

  const codes = Array.from(entryByCode.keys());
  if (codes.length === 0) return [];

  const { data: revRows } = await db.from("creator_code_revenue_daily")
    .select("affiliate_code, date, gross_amount")
    .in("affiliate_code", codes)
    .gte("date", prevStart)
    .lte("date", end);

  const cur = new Map<string, number>();
  const prev = new Map<string, number>();
  for (const row of (revRows as any[]) || []) {
    const code = String(row.affiliate_code).toUpperCase();
    const d = String(row.date).slice(0, 10);
    const amt = Number(row.gross_amount || 0);
    if (d >= start && d <= end) cur.set(code, (cur.get(code) || 0) + amt);
    else if (d >= prevStart && d <= prevEnd) prev.set(code, (prev.get(code) || 0) + amt);
  }

  const entries = Array.from(entryByCode.values());
  const influencerIds = Array.from(new Set(entries.map((e) => e.influencer_id).filter(Boolean) as string[]));
  const profiles = await loadProfiles(db, influencerIds);

  return entries.map((e) => {
    const current = Math.round((cur.get(e.code) || 0) * 100) / 100;
    const previous = Math.round((prev.get(e.code) || 0) * 100) / 100;
    const inf = e.influencer_id ? profiles.get(e.influencer_id) : null;
    return {
      creator_id: e.creator_id,
      influencer_id: e.influencer_id,
      name: inf?.name || e.name || null,
      handle: inf?.handle || null,
      photo: inf?.photo || null,
      current,
      previous,
      delta: Math.round((current - previous) * 100) / 100,
      pct_change: pct(current, previous),
    };
  });
}

async function whitelistingMovers(
  db: any, start: string, end: string, prevStart: string, prevEnd: string,
): Promise<Mover[]> {
  const { data: rows } = await db.from("creator_ad_performance_daily")
    .select("influencer_id, instagram_handle, date, spend, purchase_value")
    .gte("date", prevStart)
    .lte("date", end);

  // Key by influencer_id, falling back to instagram_handle when unlinked.
  type Agg = { influencer_id: string | null; handle: string | null; curSpend: number; curPV: number; prevSpend: number };
  const byKey = new Map<string, Agg>();
  for (const row of (rows as any[]) || []) {
    const influencerId = (row.influencer_id as string | null) || null;
    const handle = (row.instagram_handle as string | null) || null;
    const key = influencerId ? `inf:${influencerId}` : handle ? `h:${handle}` : null;
    if (!key) continue;
    const d = String(row.date).slice(0, 10);
    const spend = Number(row.spend || 0);
    const pv = Number(row.purchase_value || 0);
    const agg = byKey.get(key) || { influencer_id: influencerId, handle, curSpend: 0, curPV: 0, prevSpend: 0 };
    if (d >= start && d <= end) { agg.curSpend += spend; agg.curPV += pv; }
    else if (d >= prevStart && d <= prevEnd) { agg.prevSpend += spend; }
    byKey.set(key, agg);
  }

  const aggs = Array.from(byKey.values());
  const influencerIds = Array.from(new Set(aggs.map((a) => a.influencer_id).filter(Boolean) as string[]));
  const [profiles, creatorByInfluencer] = await Promise.all([
    loadProfiles(db, influencerIds),
    resolveCreatorIds(db, influencerIds),
  ]);

  return aggs.map((a) => {
    const current = Math.round(a.curSpend * 100) / 100;
    const previous = Math.round(a.prevSpend * 100) / 100;
    const inf = a.influencer_id ? profiles.get(a.influencer_id) : null;
    return {
      creator_id: a.influencer_id ? creatorByInfluencer.get(a.influencer_id) ?? null : null,
      influencer_id: a.influencer_id,
      name: inf?.name || null,
      handle: inf?.handle || a.handle || null,
      photo: inf?.photo || null,
      current,
      previous,
      delta: Math.round((current - previous) * 100) / 100,
      pct_change: pct(current, previous),
      roas: a.curSpend > 0 ? Math.round((a.curPV / a.curSpend) * 100) / 100 : null,
    };
  });
}


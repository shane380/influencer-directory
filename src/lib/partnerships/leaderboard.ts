// Shared leaderboard aggregation for the creator-facing leaderboard endpoints.
// Ported from the admin top-movers route: same code-entry building and daily-table
// scans, but also accumulates order counts (affiliate) / impressions (whitelisting)
// and ranks whitelisters by SPEND (the team's budget vote) rather than conversion
// value. Returns unranked rows — callers filter, sort, and redact.
// `db` is a service-role Supabase client.

import { loadProfiles, resolveCreatorIds } from "@/lib/partnerships/lookup";
import { fetchAllRows } from "@/lib/partnerships/paginate";

function pct(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type LeaderRow = {
  creator_id: string | null;
  influencer_id: string | null;
  code: string | null; // affiliate code (affiliate category only)
  name: string | null;
  handle: string | null;
  photo: string | null;
  current: number; // affiliate: window code revenue · whitelisting: window spend
  previous: number; // same metric, previous equal-length window
  pct_change: number | null;
  orders: number; // affiliate: current-window order count
  impressions: number; // whitelisting: current-window impressions
};

export async function computeAffiliateLeaderboard(
  db: any,
  start: string,
  end: string,
  prevStart: string,
  prevEnd: string,
): Promise<LeaderRow[]> {
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

  const revRows = await fetchAllRows((from, to) =>
    db.from("creator_code_revenue_daily")
      .select("affiliate_code, date, gross_amount, order_count")
      .in("affiliate_code", codes)
      .gte("date", prevStart)
      .lte("date", end)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const cur = new Map<string, number>();
  const prev = new Map<string, number>();
  const orders = new Map<string, number>();
  for (const row of (revRows as any[]) || []) {
    const code = String(row.affiliate_code).toUpperCase();
    const d = String(row.date).slice(0, 10);
    const amt = Number(row.gross_amount || 0);
    if (d >= start && d <= end) {
      cur.set(code, (cur.get(code) || 0) + amt);
      orders.set(code, (orders.get(code) || 0) + Number(row.order_count || 0));
    } else if (d >= prevStart && d <= prevEnd) {
      prev.set(code, (prev.get(code) || 0) + amt);
    }
  }

  const entries = Array.from(entryByCode.values());
  const influencerIds = Array.from(new Set(entries.map((e) => e.influencer_id).filter(Boolean) as string[]));
  const profiles = await loadProfiles(db, influencerIds);

  return entries.map((e) => {
    const current = round2(cur.get(e.code) || 0);
    const previous = round2(prev.get(e.code) || 0);
    const inf = e.influencer_id ? profiles.get(e.influencer_id) : null;
    return {
      creator_id: e.creator_id,
      influencer_id: e.influencer_id,
      code: e.code,
      name: inf?.name || e.name || null,
      handle: inf?.handle || null,
      photo: inf?.photo || null,
      current,
      previous,
      pct_change: pct(current, previous),
      orders: orders.get(e.code) || 0,
      impressions: 0,
    };
  });
}

export async function computeWhitelistingLeaderboard(
  db: any,
  start: string,
  end: string,
  prevStart: string,
  prevEnd: string,
): Promise<LeaderRow[]> {
  const rows = await fetchAllRows((from, to) =>
    db.from("creator_ad_performance_daily")
      .select("influencer_id, instagram_handle, date, spend, impressions")
      .gte("date", prevStart)
      .lte("date", end)
      .order("id", { ascending: true })
      .range(from, to),
  );

  // Key by influencer_id, falling back to instagram_handle when unlinked.
  type Agg = { influencer_id: string | null; handle: string | null; curSpend: number; prevSpend: number; curImpressions: number };
  const byKey = new Map<string, Agg>();
  for (const row of (rows as any[]) || []) {
    const influencerId = (row.influencer_id as string | null) || null;
    const handle = (row.instagram_handle as string | null) || null;
    const key = influencerId ? `inf:${influencerId}` : handle ? `h:${handle}` : null;
    if (!key) continue;
    const d = String(row.date).slice(0, 10);
    const spend = Number(row.spend || 0);
    const agg = byKey.get(key) || { influencer_id: influencerId, handle, curSpend: 0, prevSpend: 0, curImpressions: 0 };
    if (d >= start && d <= end) {
      agg.curSpend += spend;
      agg.curImpressions += Number(row.impressions || 0);
    } else if (d >= prevStart && d <= prevEnd) {
      agg.prevSpend += spend;
    }
    byKey.set(key, agg);
  }

  const aggs = Array.from(byKey.values());
  const influencerIds = Array.from(new Set(aggs.map((a) => a.influencer_id).filter(Boolean) as string[]));
  const [profiles, creatorByInfluencer] = await Promise.all([
    loadProfiles(db, influencerIds),
    resolveCreatorIds(db, influencerIds),
  ]);

  return aggs.map((a) => {
    const current = round2(a.curSpend);
    const previous = round2(a.prevSpend);
    const inf = a.influencer_id ? profiles.get(a.influencer_id) : null;
    return {
      creator_id: a.influencer_id ? creatorByInfluencer.get(a.influencer_id) ?? null : null,
      influencer_id: a.influencer_id,
      code: null,
      name: inf?.name || null,
      handle: inf?.handle || a.handle || null,
      photo: inf?.photo || null,
      current,
      previous,
      pct_change: pct(current, previous),
      orders: 0,
      impressions: a.curImpressions,
    };
  });
}

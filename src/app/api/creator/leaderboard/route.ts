import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/admin-auth";
import { resolveAffiliateContext } from "@/lib/affiliate-context";
import { resolveWindow, previousWindow } from "@/lib/partnerships/window";
import {
  computeAffiliateLeaderboard,
  computeWhitelistingLeaderboard,
  type LeaderRow,
} from "@/lib/partnerships/leaderboard";

export const maxDuration = 30;

// GET /api/creator/leaderboard?category=affiliate|whitelisting&start&end[&limit][&creator_id]
//
// Creator-facing community leaderboard. Privacy is enforced HERE, not in the
// client: rows for other creators carry rank/name/photo/growth only — exact
// value and orders/impressions are included solely on the viewer's own row.
// bar_pct is quantized to 5% steps so a viewer can't back-solve the leader's
// revenue from their own value ÷ bar ratio.

const MAX_WINDOW_DAYS = 92;

function identityKey(category: string, row: LeaderRow): string | null {
  if (category === "affiliate") return row.code;
  return row.influencer_id ? `inf:${row.influencer_id}` : row.handle ? `h:${row.handle}` : null;
}

export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const isAdmin = user.user_metadata?.role !== "creator";
  const params = request.nextUrl.searchParams;
  const category = params.get("category") === "whitelisting" ? "whitelisting" : "affiliate";
  // Recognition, not ranking: only the top three are ever public. Everyone
  // else gets their own rank privately via `viewer` — the client can ask for
  // fewer but never more.
  const limit = Math.max(1, Math.min(parseInt(params.get("limit") || "3", 10), 3));
  const creatorIdParam = params.get("creator_id");

  const ctx = await resolveAffiliateContext({ userId: user.id, creatorId: creatorIdParam, isAdmin });
  if (!ctx) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  const db = getAdminClient();

  // Entitlement gate: affiliate section needs an affiliate identity; the
  // whitelisting section needs an ad-spend deal on the invite.
  let hasAdSpend = false;
  if (ctx.creatorId) {
    const { data: creator } = await (db.from("creators") as any)
      .select("invite_id")
      .eq("id", ctx.creatorId)
      .single();
    if (creator?.invite_id) {
      const { data: inv } = await (db.from("creator_invites") as any)
        .select("has_ad_spend")
        .eq("id", creator.invite_id)
        .single();
      hasAdSpend = !!inv?.has_ad_spend;
    }
  }
  if (category === "affiliate" && !ctx.enabled) {
    return NextResponse.json({ error: "not_entitled" }, { status: 403 });
  }
  if (category === "whitelisting" && !hasAdSpend) {
    return NextResponse.json({ error: "not_entitled" }, { status: 403 });
  }

  let { start, end } = resolveWindow(params.get("start"), params.get("end"));
  // Clamp the span — this endpoint only serves the 7/30/90-day presets.
  {
    const s = new Date(`${start}T00:00:00Z`);
    const e = new Date(`${end}T00:00:00Z`);
    const span = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
    if (span > MAX_WINDOW_DAYS) {
      const clamped = new Date(e);
      clamped.setUTCDate(e.getUTCDate() - (MAX_WINDOW_DAYS - 1));
      start = clamped.toISOString().slice(0, 10);
    }
  }
  const { prevStart, prevEnd } = previousWindow(start, end);

  const rows =
    category === "affiliate"
      ? await computeAffiliateLeaderboard(db, start, end, prevStart, prevEnd)
      : await computeWhitelistingLeaderboard(db, start, end, prevStart, prevEnd);

  const ranked = rows
    .filter((r) => r.current > 0)
    .sort((a, b) => b.current - a.current);

  // Previous-window ranks, for the ↑2 / ↓1 movement indicator.
  const prevRankByKey = new Map<string, number>();
  rows
    .filter((r) => r.previous > 0)
    .sort((a, b) => b.previous - a.previous)
    .forEach((r, i) => {
      const key = identityKey(category, r);
      if (key) prevRankByKey.set(key, i + 1);
    });

  const viewerKey =
    category === "affiliate"
      ? ctx.code
        ? ctx.code.toUpperCase()
        : null
      : ctx.influencerId
        ? `inf:${ctx.influencerId}`
        : null;

  const leader = ranked[0]?.current || 0;
  const barPct = (value: number) =>
    leader > 0 ? Math.max(5, Math.round((value / leader) * 20) * 5) : 0;

  const publicRow = (row: LeaderRow, rank: number) => {
    const key = identityKey(category, row);
    const prevRank = key ? prevRankByKey.get(key) ?? null : null;
    const isViewer = !!viewerKey && key === viewerKey;
    const base: any = {
      rank,
      name: row.name,
      handle: row.handle,
      photo: row.photo,
      pct_change: row.pct_change,
      rank_change: prevRank != null ? prevRank - rank : null,
      // Relative bars only exist on the affiliate board; the whitelisting board
      // ranks by spend without visualizing the allocation split.
      ...(category === "affiliate" ? { bar_pct: barPct(row.current) } : {}),
      is_viewer: isViewer,
    };
    if (isViewer) {
      base.value = row.current;
      if (category === "affiliate") base.orders = row.orders;
      else base.impressions = row.impressions;
    }
    return base;
  };

  const top = ranked.slice(0, limit).map((row, i) => publicRow(row, i + 1));

  const viewerIdx = viewerKey
    ? ranked.findIndex((r) => identityKey(category, r) === viewerKey)
    : -1;
  const viewer =
    viewerIdx >= 0
      ? { ...publicRow(ranked[viewerIdx], viewerIdx + 1), in_top: viewerIdx < limit }
      : null;

  // Rising star: biggest climber with a meaningful base — previous window > 0
  // and current at/above the ranked median, so a $1 → $50 jump can't win.
  const median = ranked.length > 0 ? ranked[Math.floor(ranked.length / 2)].current : 0;
  const star = ranked
    .filter((r) => r.previous > 0 && r.pct_change != null && r.pct_change > 0 && r.current >= median)
    .sort((a, b) => (b.pct_change || 0) - (a.pct_change || 0))[0];
  const rising_star = star
    ? { name: star.name, handle: star.handle, photo: star.photo, pct_change: star.pct_change }
    : null;

  // Deliberately no community revenue/orders/spend totals — company-sensitive
  // aggregates stay server-side. Participant count is the only community stat.
  const community = { participants: ranked.length };

  return NextResponse.json({
    category,
    window: { start, end },
    community,
    rising_star,
    viewer,
    top,
  });
}

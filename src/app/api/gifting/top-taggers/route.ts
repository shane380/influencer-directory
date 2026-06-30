import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MEDIA = ["stories", "in_feed_post", "reel", "tiktok"] as const;
type Medium = (typeof MEDIA)[number];

// Top taggers over the last 90 days. A "tag" = content_posted (any medium) on a
// campaign influencer, attributed to the campaign's start month — same definition
// as the gifting stats route, so the numbers stay consistent across the page.
export async function GET() {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const db = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 90-day window, attributed by campaign start_date.
  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - 90);
  const cutoffDay = cutoff.toISOString().slice(0, 10);

  const { data: campaignRows } = await (db.from("campaigns") as any)
    .select("id, start_date")
    .gte("start_date", cutoffDay);

  const campaignIds = ((campaignRows as any[]) || [])
    .filter((c) => c.start_date)
    .map((c) => c.id);

  if (campaignIds.length === 0) {
    return NextResponse.json({ taggers: [] });
  }

  const { data: ciRows } = await (db.from("campaign_influencers") as any)
    .select("influencer_id, content_posted")
    .in("campaign_id", campaignIds)
    .neq("content_posted", "none");

  // Aggregate per influencer: total tags + per-medium breakdown.
  type Agg = { total: number; breakdown: Record<Medium, number> };
  const byInfluencer = new Map<string, Agg>();
  for (const ci of (ciRows as any[]) || []) {
    if (!ci.influencer_id) continue;
    const medium = ci.content_posted as Medium;
    if (!MEDIA.includes(medium)) continue;
    let agg = byInfluencer.get(ci.influencer_id);
    if (!agg) {
      agg = { total: 0, breakdown: { stories: 0, in_feed_post: 0, reel: 0, tiktok: 0 } };
      byInfluencer.set(ci.influencer_id, agg);
    }
    agg.total += 1;
    agg.breakdown[medium] += 1;
  }

  // Top 8 by total tags.
  const top = Array.from(byInfluencer.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 8);

  if (top.length === 0) {
    return NextResponse.json({ taggers: [] });
  }

  const ids = top.map(([id]) => id);
  const { data: influencers } = await (db.from("influencers") as any)
    .select("id, name, instagram_handle, profile_photo_url, partnership_type")
    .in("id", ids);

  const infById = new Map<string, any>();
  for (const inf of (influencers as any[]) || []) {
    infById.set(inf.id, inf);
  }

  const taggers = top
    .map(([id, agg]) => {
      const inf = infById.get(id);
      if (!inf) return null;
      return {
        influencer_id: id,
        name: inf.name as string,
        handle: inf.instagram_handle as string | null,
        photo: inf.profile_photo_url as string | null,
        partnership_type: inf.partnership_type as string,
        total: agg.total,
        breakdown: agg.breakdown,
      };
    })
    .filter(Boolean);

  return NextResponse.json({ taggers });
}

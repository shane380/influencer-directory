// Verify the new ad_spend_30d + ads_live values from /api/partnerships/active-partners.
// Replays the same aggregation server-side and prints per-partner numbers so we
// can sanity-check totals against the /whitelisting-stats endpoint.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const dayOnly = (d) => d.toISOString().slice(0, 10);
const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const thirtyAgo = new Date(today); thirtyAgo.setUTCDate(thirtyAgo.getUTCDate() - 29);

const { data: creators } = await db.from("creators")
  .select("id, creator_name, affiliate_code, invite_id")
  .order("onboarded_at", { ascending: false });
const inviteIds = creators.map(c => c.invite_id).filter(Boolean);
const { data: invites } = await db.from("creator_invites").select("id, influencer_id").in("id", inviteIds);
const invMap = new Map(invites.map(i => [i.id, i.influencer_id]));
const influencerIds = [...new Set([...invMap.values()].filter(Boolean))];

const { data: dailyRows } = await db.from("creator_ad_performance_daily")
  .select("influencer_id, date, spend")
  .in("influencer_id", influencerIds)
  .gte("date", dayOnly(thirtyAgo))
  .lte("date", dayOnly(today));

const { data: perfRows } = await db.from("creator_ad_performance")
  .select("influencer_id, ads")
  .in("influencer_id", influencerIds);

const spend30d = new Map();
for (const r of dailyRows || []) {
  spend30d.set(r.influencer_id, (spend30d.get(r.influencer_id) || 0) + Number(r.spend || 0));
}
const adsLive = new Map();
for (const r of perfRows || []) {
  const ads = Array.isArray(r.ads) ? r.ads : [];
  const active = ads.filter(a => a?.effective_status === "ACTIVE").length;
  adsLive.set(r.influencer_id, active);
}

console.log(`Active partners (showing 30d spend + ads_live):\n`);
let totalSpend = 0, totalAdsLive = 0, withSpend = 0, withAdsLive = 0;
for (const c of creators) {
  const infId = c.invite_id ? invMap.get(c.invite_id) : null;
  const s = infId ? spend30d.get(infId) || 0 : 0;
  const al = infId ? adsLive.get(infId) || 0 : 0;
  totalSpend += s; totalAdsLive += al;
  if (s > 0) withSpend++;
  if (al > 0) withAdsLive++;
  if (s > 0 || al > 0) {
    console.log(`  ${c.creator_name?.padEnd(28) || "(no name)".padEnd(28)} spend30d=$${s.toFixed(2).padStart(10)}  ads_live=${al}`);
  }
}
console.log(`\nTotals: $${totalSpend.toFixed(2)} 30d spend across ${withSpend} partners`);
console.log(`        ${totalAdsLive} ads live across ${withAdsLive} partners`);

// Check the new unified active-partners response: count each status type,
// confirm no duplicates by influencer_id, and verify dedup logic.
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
const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
const monthStartDay = dayOnly(monthStart);
const todayDay = dayOnly(today);

// Partnered influencer ids + codes (matches API dedup)
const { data: creators } = await db.from("creators").select("id, creator_name, affiliate_code, invite_id");
const invIds = creators.map(c => c.invite_id).filter(Boolean);
const { data: invites } = await db.from("creator_invites").select("id, influencer_id").in("id", invIds);
const partneredInfluencerIds = new Set(invites.filter(i => i.influencer_id).map(i => i.influencer_id));
const partneredCodes = new Set(creators.map(c => c.affiliate_code).filter(Boolean).map(c => String(c).toUpperCase()));

// Legacy affiliates not partnered (by influencer_id OR code)
const { data: legacy } = await db.from("legacy_affiliates").select("id, name, discount_code, influencer_id").eq("status", "active");
const affiliateOnly = legacy.filter(l => {
  const code = l.discount_code ? String(l.discount_code).toUpperCase() : null;
  if (l.influencer_id && partneredInfluencerIds.has(l.influencer_id)) return false;
  if (code && partneredCodes.has(code)) return false;
  return true;
});
const legacyInfluencerIds = new Set(legacy.map(l => l.influencer_id).filter(Boolean));

// Whitelisted-only: influencers with ads_live > 0 or ad_spend MTD > 0, not in partnered/legacy
const { data: perfRows } = await db.from("creator_ad_performance").select("influencer_id, ads");
const { data: dailyRows } = await db.from("creator_ad_performance_daily")
  .select("influencer_id, date, spend")
  .gte("date", monthStartDay).lte("date", todayDay);

const adsLive = new Map();
for (const r of perfRows) {
  if (!r.influencer_id) continue;
  const ads = Array.isArray(r.ads) ? r.ads : [];
  adsLive.set(r.influencer_id, ads.filter(a => a?.effective_status === "ACTIVE").length);
}
const spendMtd = new Map();
for (const r of dailyRows) {
  if (!r.influencer_id) continue;
  spendMtd.set(r.influencer_id, (spendMtd.get(r.influencer_id) || 0) + Number(r.spend || 0));
}

const whitelistedOnly = [];
const allAdInfluencerIds = new Set([...adsLive.keys(), ...spendMtd.keys()]);
for (const id of allAdInfluencerIds) {
  if (partneredInfluencerIds.has(id)) continue;
  if (legacyInfluencerIds.has(id)) continue;
  const live = adsLive.get(id) || 0;
  const spend = spendMtd.get(id) || 0;
  if (live > 0 || spend > 0) whitelistedOnly.push({ id, live, spend });
}

const { data: infs } = await db.from("influencers").select("id, name, instagram_handle").in("id", [...new Set([...affiliateOnly.map(a => a.influencer_id).filter(Boolean), ...whitelistedOnly.map(w => w.id)])]);
const infMap = new Map(infs.map(i => [i.id, i]));

console.log(`Summary:`);
console.log(`  Partners (creators):             ${creators.length}`);
console.log(`  Affiliate only (legacy w/o creator): ${affiliateOnly.length}`);
console.log(`  Whitelisted only:                ${whitelistedOnly.length}`);
console.log(`  Total table rows:                ${creators.length + affiliateOnly.length + whitelistedOnly.length}\n`);

if (affiliateOnly.length > 0) {
  console.log(`Affiliate-only rows:`);
  for (const a of affiliateOnly) {
    const inf = a.influencer_id ? infMap.get(a.influencer_id) : null;
    console.log(`  ${a.name || inf?.name || "(no name)"} — code: ${a.discount_code}${inf?.instagram_handle ? `, @${inf.instagram_handle}` : ""}`);
  }
}

if (whitelistedOnly.length > 0) {
  console.log(`\nWhitelisted-only rows:`);
  for (const w of whitelistedOnly) {
    const inf = infMap.get(w.id);
    console.log(`  ${inf?.name || "(no name)"} ${inf?.instagram_handle ? `@${inf.instagram_handle}` : ""} — ads_live=${w.live} spend_mtd=$${w.spend.toFixed(2)}`);
  }
}

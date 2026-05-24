// Mirror the new influencer-centric API logic and count rows by role combination.
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
const monthStartDay = dayOnly(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
const todayDay = dayOnly(today);

const { data: creators } = await db.from("creators").select("id, creator_name, affiliate_code, invite_id");
const inviteIds = creators.map(c => c.invite_id).filter(Boolean);
const { data: invites } = await db.from("creator_invites").select("id, influencer_id").in("id", inviteIds);
const invMap = new Map(invites.map(i => [i.id, i.influencer_id]));
const partneredInfluencerIds = new Set(creators.map(c => c.invite_id && invMap.get(c.invite_id)).filter(Boolean));
const partneredCodes = new Set(creators.map(c => c.affiliate_code && String(c.affiliate_code).toUpperCase()).filter(Boolean));

const { data: legacy } = await db.from("legacy_affiliates").select("id, name, discount_code, influencer_id, status").eq("status", "active");
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

// Build the influencer-keyed row map
const rows = new Map();

// Partners
for (const c of creators) {
  const infId = c.invite_id ? invMap.get(c.invite_id) : null;
  if (!infId) continue;
  rows.set(infId, {
    influencer_id: infId,
    is_partner: true,
    is_affiliate: false,
    is_whitelisted: false,
    creator_name: c.creator_name,
  });
}

// Legacy affiliates with influencer_id (and not already a partner-code dup)
let headlessLegacyCount = 0;
for (const l of legacy) {
  const code = l.discount_code ? String(l.discount_code).toUpperCase() : null;
  if (code && partneredCodes.has(code)) continue;
  if (!l.influencer_id) {
    headlessLegacyCount += 1;
    continue;
  }
  const existing = rows.get(l.influencer_id);
  if (existing) {
    existing.is_affiliate = true;
  } else {
    rows.set(l.influencer_id, {
      influencer_id: l.influencer_id,
      is_partner: false,
      is_affiliate: true,
      is_whitelisted: false,
      creator_name: l.name,
    });
  }
}

// Whitelisting: for any influencer with ad activity, flag is_whitelisted (unless partner)
const allAdInfluencers = new Set([...adsLive.keys(), ...spendMtd.keys()]);
for (const infId of allAdInfluencers) {
  const ads = adsLive.get(infId) || 0;
  const spend = spendMtd.get(infId) || 0;
  if (ads <= 0 && spend <= 0) continue;
  const existing = rows.get(infId);
  if (existing) {
    if (!existing.is_partner) existing.is_whitelisted = true;
  } else {
    rows.set(infId, {
      influencer_id: infId,
      is_partner: false,
      is_affiliate: false,
      is_whitelisted: true,
      creator_name: null,
    });
  }
}

// Count by role combination
const buckets = new Map();
for (const r of rows.values()) {
  let key = "";
  if (r.is_partner) key = "Partner";
  else {
    const parts = [];
    if (r.is_affiliate) parts.push("Affiliate");
    if (r.is_whitelisted) parts.push("Whitelisted");
    key = parts.join(" + ");
  }
  buckets.set(key, (buckets.get(key) || 0) + 1);
}

console.log(`Influencer-centric rows by role:`);
for (const [k, v] of [...buckets.entries()].sort()) {
  console.log(`  ${k.padEnd(28)} ${v}`);
}
console.log(`  Headless legacy (no influencer link): ${headlessLegacyCount}`);
console.log(`  TOTAL: ${rows.size + headlessLegacyCount}`);

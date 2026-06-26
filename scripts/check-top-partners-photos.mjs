// Probe: does /api/partnerships/top-partners actually return non-null `photo` for the top 5?
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

const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
const todayDay = today.toISOString().slice(0, 10);

const { data: creators } = await db.from("creators").select("id, creator_name, affiliate_code, invite_id").not("affiliate_code", "is", null);
const list = (creators || []).map(c => ({ ...c, affiliate_code: String(c.affiliate_code).toUpperCase() }));
const codes = [...new Set(list.map(c => c.affiliate_code))];

const { data: rev } = await db.from("creator_code_revenue_daily").select("affiliate_code, gross_amount").in("affiliate_code", codes).gte("date", monthStart).lte("date", todayDay);
const byCode = new Map();
for (const r of rev || []) {
  byCode.set(r.affiliate_code, (byCode.get(r.affiliate_code) || 0) + Number(r.gross_amount || 0));
}
const ranked = list.map(c => ({ ...c, revenue: byCode.get(c.affiliate_code) || 0 })).filter(c => c.revenue > 0).sort((a,b) => b.revenue - a.revenue).slice(0, 5);

const inviteIds = ranked.map(c => c.invite_id).filter(Boolean);
const { data: invites } = await db.from("creator_invites").select("id, influencer_id").in("id", inviteIds);
const invitesById = new Map((invites || []).map(i => [String(i.id), i.influencer_id]));

const influencerIds = [...new Set([...invitesById.values()].filter(Boolean))];
const { data: infs } = await db.from("influencers").select("id, name, instagram_handle, profile_photo_url").in("id", influencerIds);
const infsById = new Map((infs || []).map(i => [String(i.id), i]));

console.log(`Top partners photo audit:`);
for (const c of ranked) {
  const infId = c.invite_id ? invitesById.get(c.invite_id) : null;
  const inf = infId ? infsById.get(infId) : null;
  console.log(`  ${c.creator_name || "—"} (${c.affiliate_code})`);
  console.log(`    invite_id:     ${c.invite_id || "(none)"}`);
  console.log(`    influencer_id: ${infId || "(none)"}`);
  console.log(`    photo:         ${inf?.profile_photo_url || "(null)"}`);
}

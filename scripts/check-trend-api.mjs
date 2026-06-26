import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// Mirror the new-ads-live computation from the trend API
const HANDLE = "a.annna.r";
const today = new Date(); today.setUTCHours(0,0,0,0);
const startDate = new Date(today); startDate.setUTCDate(startDate.getUTCDate() - 29);
const startDay = startDate.toISOString().slice(0, 10);
const todayDay = today.toISOString().slice(0, 10);

const { data: allRows } = await db
  .from("creator_ad_performance_daily")
  .select("ad_id, date, spend, impressions")
  .eq("instagram_handle", HANDLE);

console.log(`window: ${startDay} → ${todayDay}, ${allRows.length} total daily rows for handle`);

const firstActiveByAd = new Map();
for (const row of allRows) {
  if (!(Number(row.spend) > 0 || Number(row.impressions) > 0)) continue;
  const day = String(row.date).slice(0, 10);
  const prev = firstActiveByAd.get(row.ad_id);
  if (!prev || day < prev) firstActiveByAd.set(row.ad_id, day);
}
console.log("\nfirst-active per ad:");
for (const [id, day] of firstActiveByAd) console.log(`  ${id}: ${day} (in window: ${day >= startDay && day <= todayDay})`);

const adsLaunchedByDate = {};
for (const launchDay of firstActiveByAd.values()) {
  if (launchDay >= startDay && launchDay <= todayDay) {
    adsLaunchedByDate[launchDay] = (adsLaunchedByDate[launchDay] || 0) + 1;
  }
}
const adsLaunched = Object.entries(adsLaunchedByDate).map(([date, count]) => ({date, count})).sort((a,b)=>a.date.localeCompare(b.date));
console.log("\nadsLaunched (what API returns):", JSON.stringify(adsLaunched));

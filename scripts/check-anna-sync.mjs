import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Load .env.local manually
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

const HANDLE = "a.annna.r";

async function main() {
  // Daily ad-performance rows
  const { data: dailyRows, error: e1 } = await db
    .from("creator_ad_performance_daily")
    .select("date, ad_id, spend, impressions, outbound_clicks, purchase_value, purchase_roas")
    .eq("instagram_handle", HANDLE)
    .order("date", { ascending: false });
  if (e1) { console.error("daily error:", e1); process.exit(1); }
  console.log(`\ncreator_ad_performance_daily: ${dailyRows.length} rows`);
  if (dailyRows.length) {
    const totalSpend = dailyRows.reduce((s, r) => s + Number(r.spend || 0), 0);
    const dates = [...new Set(dailyRows.map(r => r.date))].sort();
    console.log(`  date range: ${dates[0]} → ${dates[dates.length - 1]}`);
    console.log(`  unique days: ${dates.length}`);
    console.log(`  unique ads:  ${new Set(dailyRows.map(r => r.ad_id)).size}`);
    console.log(`  total spend in window: $${totalSpend.toFixed(2)}`);
    console.log(`  most recent 3 rows:`);
    for (const r of dailyRows.slice(0, 3)) {
      console.log(`    ${r.date} ad=${r.ad_id} spend=$${r.spend} impr=${r.impressions} clicks=${r.outbound_clicks} pv=$${r.purchase_value} roas=${r.purchase_roas ?? "—"}`);
    }
  }

  // Live snapshot
  const { data: liveRows, error: e2 } = await db
    .from("creator_ads_live_daily")
    .select("date, count")
    .eq("instagram_handle", HANDLE)
    .order("date", { ascending: false });
  if (e2) { console.error("live error:", e2); process.exit(1); }
  console.log(`\ncreator_ads_live_daily: ${liveRows.length} rows`);
  for (const r of liveRows) console.log(`  ${r.date}: ${r.count} ads live`);

  // Per-ad summary from parent table
  const { data: perf, error: e3 } = await db
    .from("creator_ad_performance")
    .select("ads, totals, synced_at, updated_at, sync_error")
    .eq("instagram_handle", HANDLE)
    .single();
  console.log(`\n  synced_at:   ${perf?.synced_at}`);
  console.log(`  updated_at:  ${perf?.updated_at}`);
  console.log(`  sync_error:  ${perf?.sync_error ?? "—"}`);
  if (e3) { console.error("perf error:", e3); process.exit(1); }
  console.log(`\ncreator_ad_performance.ads: ${perf.ads.length} ads`);
  console.log(`  totals.spend: $${perf.totals?.spend?.toFixed?.(2) ?? perf.totals?.spend}`);
  for (const ad of perf.ads.slice(0, 5)) {
    console.log(`  - ${ad.name?.slice(0, 50)}`);
    console.log(`      adset_name: ${ad.adset_name ?? "—"}`);
    console.log(`      effective_status: ${ad.effective_status}`);
    console.log(`      outbound_clicks: ${ad.outbound_clicks ?? "—"}, ctr: ${ad.outbound_clicks_ctr ?? "—"}`);
    console.log(`      purchase_value: $${ad.purchase_value ?? "—"}, roas: ${ad.purchase_roas ?? "—"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

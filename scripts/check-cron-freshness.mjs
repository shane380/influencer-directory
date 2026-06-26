import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// (table, timestamp column) for each cron's output
const checks = [
  ["creator_code_revenue_daily", "synced_at", "sync-code-revenue (30 6)"],
  ["creator_ad_performance_daily", "synced_at", "meta-sync (0 6)"],
  ["creator_ads_live_daily", "synced_at", "meta-sync (0 6)"],
  ["gift_orders", "synced_at", "sync-influencer-orders (0 5)"],
  ["gift_orders", "updated_at", "sync-order-status (0 */2)"],
];

for (const [table, col, label] of checks) {
  try {
    const { data, error } = await db.from(table).select(col).order(col, { ascending: false }).limit(1);
    if (error) { console.log(`${table}.${col} [${label}]: ERR ${error.message}`); continue; }
    console.log(`${table}.${col} [${label}]: latest = ${data?.[0]?.[col] ?? "(none)"}`);
  } catch (e) {
    console.log(`${table}.${col} [${label}]: EXC ${e.message}`);
  }
}

// Quick probe: does creator_code_revenue_daily have data in the previous-90d window?
// If not, /api/partnerships/aggregate-revenue?range=90d returns null for growth.
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
const lengthDays = 90;
const rangeStart = new Date(today); rangeStart.setUTCDate(rangeStart.getUTCDate() - (lengthDays - 1));
const prevStart = new Date(rangeStart); prevStart.setUTCDate(prevStart.getUTCDate() - lengthDays);
const prevEnd = new Date(rangeStart); prevEnd.setUTCDate(prevEnd.getUTCDate() - 1);

console.log(`Today:        ${dayOnly(today)}`);
console.log(`Range (90d):  ${dayOnly(rangeStart)} → ${dayOnly(today)}`);
console.log(`Prev (90d):   ${dayOnly(prevStart)} → ${dayOnly(prevEnd)}\n`);

// Earliest available row
const { data: earliest } = await db
  .from("creator_code_revenue_daily")
  .select("date")
  .order("date", { ascending: true })
  .limit(1);
console.log(`Earliest cached row: ${earliest?.[0]?.date || "(none)"}`);

// Row count in previous window
const { count: prevCount } = await db
  .from("creator_code_revenue_daily")
  .select("id", { count: "exact", head: true })
  .gte("date", dayOnly(prevStart))
  .lte("date", dayOnly(prevEnd));
console.log(`Rows in previous-90d window: ${prevCount}`);

// Row count in current window
const { count: currCount } = await db
  .from("creator_code_revenue_daily")
  .select("id", { count: "exact", head: true })
  .gte("date", dayOnly(rangeStart))
  .lte("date", dayOnly(today));
console.log(`Rows in current-90d window:  ${currCount}\n`);

// Sum gross_amount in previous window for active codes
const { data: creators } = await db.from("creators").select("affiliate_code").not("affiliate_code", "is", null);
const codes = [...new Set((creators || []).map(c => String(c.affiliate_code).toUpperCase()))];

const { data: prevRows } = await db
  .from("creator_code_revenue_daily")
  .select("gross_amount, order_count, date, affiliate_code")
  .in("affiliate_code", codes)
  .gte("date", dayOnly(prevStart))
  .lte("date", dayOnly(prevEnd));

const prevRev = (prevRows || []).reduce((s, r) => s + Number(r.gross_amount || 0), 0);
const prevOrd = (prevRows || []).reduce((s, r) => s + Number(r.order_count || 0), 0);
console.log(`Previous-90d (active codes only): $${prevRev.toFixed(2)} / ${prevOrd} orders / ${(prevRows || []).length} rows`);

if ((prevRows || []).length > 0) {
  const minDate = (prevRows || []).map(r => r.date).sort()[0];
  const maxDate = (prevRows || []).map(r => r.date).sort().slice(-1)[0];
  console.log(`Previous-90d date span found: ${minDate} → ${maxDate}`);
}

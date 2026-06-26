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

const CODE = "ANNAHLOV"; // try a couple of likely codes
const candidates = ["ANNAHLOV", "annahlov", "ANNA", "AANNNAR"];

for (const c of candidates) {
  const { data } = await db
    .from("creator_code_revenue_daily")
    .select("date, gross_amount, order_count")
    .eq("affiliate_code", c.toUpperCase())
    .order("date", { ascending: false });
  console.log(`${c.toUpperCase()}: ${data?.length || 0} rows`);
  if (data?.length) {
    const total = data.reduce((s, r) => s + Number(r.gross_amount), 0);
    const orders = data.reduce((s, r) => s + Number(r.order_count), 0);
    console.log(`  total gross: $${total.toFixed(2)}, ${orders} orders`);
    console.log(`  recent: ${data.slice(0, 5).map(r => `${r.date}=$${r.gross_amount}/${r.order_count}`).join(", ")}`);
  }
}

const { data: allCodes } = await db
  .from("creator_code_revenue_daily")
  .select("affiliate_code")
  .order("affiliate_code");
const uniq = [...new Set((allCodes || []).map(r => r.affiliate_code))];
console.log(`\nAll codes with cached data (${uniq.length}):`, uniq);

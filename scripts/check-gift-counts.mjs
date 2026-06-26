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

// Pull all influencer_orders from Nov 2025 onward and bucket by month.
const { data: orders, error } = await db
  .from("influencer_orders")
  .select("order_date, total_amount, is_gift")
  .gte("order_date", "2025-11-01")
  .order("order_date", { ascending: true });

if (error) {
  console.error("ERROR:", error);
  process.exit(1);
}

console.log(`Total influencer_orders rows since Nov 2025: ${orders.length}\n`);

const byMonth = {};
for (const o of orders) {
  const month = String(o.order_date).slice(0, 7); // YYYY-MM (UTC)
  if (!byMonth[month]) byMonth[month] = { total: 0, gifts: 0, nonGift: 0, sumAmt: 0 };
  byMonth[month].total++;
  byMonth[month].sumAmt += Number(o.total_amount || 0);
  if (o.is_gift) byMonth[month].gifts++;
  else byMonth[month].nonGift++;
}

console.log("Month     | all orders | is_gift(=$0) | non-gift | sum $ of non-gift");
console.log("----------|-----------|--------------|----------|------------------");
for (const m of Object.keys(byMonth).sort()) {
  const b = byMonth[m];
  console.log(
    `${m}   | ${String(b.total).padStart(9)} | ${String(b.gifts).padStart(12)} | ${String(b.nonGift).padStart(8)} | $${b.sumAmt.toFixed(2)}`,
  );
}

// Sanity: distribution of total_amount for April orders specifically.
const april = orders.filter((o) => String(o.order_date).slice(0, 7) === "2026-04");
console.log(`\nApril 2026: ${april.length} orders total`);
const zero = april.filter((o) => Number(o.total_amount) === 0).length;
const nonzero = april.filter((o) => Number(o.total_amount) !== 0);
console.log(`  $0 (gift): ${zero}`);
console.log(`  >$0 (not gift): ${nonzero.length}`);
console.log(`  sample non-zero amounts: ${nonzero.slice(0, 10).map((o) => "$" + o.total_amount).join(", ")}`);

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

// 1. Does Kristal exist in creators / legacy_affiliates?
const { data: creators } = await db
  .from("creators")
  .select("id, name, affiliate_code, created_at")
  .ilike("affiliate_code", "kristal");
console.log("creators matching KRISTAL:", JSON.stringify(creators, null, 2));

const { data: legacy } = await db
  .from("legacy_affiliates")
  .select("*")
  .ilike("discount_code", "kristal");
console.log("legacy_affiliates matching KRISTAL:", JSON.stringify(legacy, null, 2));

// also fuzzy search by name
const { data: byName } = await db
  .from("creators")
  .select("id, name, affiliate_code")
  .ilike("name", "%kristal%");
console.log("creators with name ~kristal:", JSON.stringify(byName, null, 2));

// 2. Cache rows for KRISTAL
const { data: rev } = await db
  .from("creator_code_revenue_daily")
  .select("date, gross_amount, order_count, synced_at")
  .eq("affiliate_code", "KRISTAL")
  .order("date", { ascending: false });
console.log(`\ncreator_code_revenue_daily KRISTAL: ${rev?.length || 0} rows`);
if (rev?.length) {
  console.log(rev.slice(0, 10).map(r => `${r.date}=$${r.gross_amount}/${r.order_count} synced:${r.synced_at}`).join("\n"));
}

// 3. When did the cache last sync at all (any code)?
const { data: latest } = await db
  .from("creator_code_revenue_daily")
  .select("affiliate_code, date, synced_at")
  .order("synced_at", { ascending: false })
  .limit(5);
console.log("\nMost recent synced_at across all codes:");
console.log(JSON.stringify(latest, null, 2));

// 4. Max date present in cache
const { data: maxDate } = await db
  .from("creator_code_revenue_daily")
  .select("date")
  .order("date", { ascending: false })
  .limit(1);
console.log("\nMax date in cache:", maxDate?.[0]?.date);

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

const HANDLE = "a.annna.r";

async function main() {
  // Find Anna's influencer
  const { data: inf } = await db
    .from("influencers")
    .select("id, name, instagram_handle")
    .eq("instagram_handle", HANDLE)
    .single();
  console.log("influencer:", JSON.stringify(inf, null, 2));
  if (!inf) return;

  // Find creator by name (since invite linkage may not be in place)
  const { data: creators, error: cErr } = await db
    .from("creators")
    .select("id, creator_name, affiliate_code, commission_rate, invite_id, created_at")
    .ilike("creator_name", "%anna%");
  console.log("\ncreator candidates (anna%):", JSON.stringify(creators), "err:", cErr);

  // What columns does creators actually have?
  const { data: oneCreator } = await db
    .from("creators")
    .select("*")
    .limit(1)
    .single();
  console.log("\ncreators columns:", oneCreator ? Object.keys(oneCreator) : "(no rows)");
  if (!creators?.length) return;
  const creator = creators[0];

  // What does her invite look like?
  if (creator.invite_id) {
    const { data: inv } = await db
      .from("creator_invites")
      .select("id, influencer_id")
      .eq("id", creator.invite_id)
      .single();
    console.log("\nher invite:", JSON.stringify(inv, null, 2));
  }

  // Now mirror the trend endpoint query
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - 29);
  const startDay = startDate.toISOString().slice(0, 10);
  const todayDay = today.toISOString().slice(0, 10);

  console.log(`\nquerying daily rows: handle=${HANDLE} from ${startDay} to ${todayDay}`);

  const { data: dailyRows, error: dErr } = await db
    .from("creator_ad_performance_daily")
    .select("date, spend")
    .eq("instagram_handle", HANDLE)
    .gte("date", startDay)
    .lte("date", todayDay);

  if (dErr) {
    console.error("error:", dErr);
    return;
  }
  console.log(`got ${dailyRows.length} rows in 30d window`);
  const total = dailyRows.reduce((s, r) => s + Number(r.spend || 0), 0);
  console.log(`sum spend: $${total.toFixed(2)}`);
  console.log(`first 3:`, dailyRows.slice(0, 3));
}

main().catch((e) => { console.error(e); process.exit(1); });

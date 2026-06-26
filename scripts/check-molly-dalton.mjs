import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log("=== influencers (canonical profile) ~molly ===");
const { data: inf } = await db.from("influencers").select("id, name, instagram_handle, email").or("name.ilike.%molly%,instagram_handle.ilike.%molly%");
console.log(JSON.stringify(inf, null, 2));

console.log("\n=== legacy_affiliates ~molly (GoAffPro import) ===");
const { data: leg } = await db.from("legacy_affiliates").select("id, name, discount_code, influencer_id, status").ilike("name", "%molly%");
console.log(JSON.stringify(leg, null, 2));

console.log("\n=== creators (app-native partner) ~molly ===");
const { data: cr } = await db.from("creators").select("id, creator_name, affiliate_code, invite_id").ilike("creator_name", "%molly%");
console.log(JSON.stringify(cr, null, 2));

console.log("\n=== creator_ad_performance (whitelisting) ~molly ===");
const { data: ap } = await db.from("creator_ad_performance").select("influencer_id, instagram_handle").ilike("instagram_handle", "%molly%");
console.log(JSON.stringify(ap, null, 2));

// How many legacy_affiliates are headless (influencer_id null) overall?
const { data: allLeg } = await db.from("legacy_affiliates").select("id, name, discount_code, influencer_id, status").eq("status", "active");
const headless = (allLeg || []).filter((l) => !l.influencer_id);
console.log(`\n=== legacy_affiliates: ${headless.length} of ${allLeg?.length} active have influencer_id=NULL (headless) ===`);
console.log("headless names:", headless.map((l) => l.name).join(", "));

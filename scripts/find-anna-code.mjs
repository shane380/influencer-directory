import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: cs } = await db.from("creators").select("creator_name, affiliate_code, invite_id").not("affiliate_code", "is", null);
console.log(`creators with affiliate_code: ${cs?.length}`);
const anna = (cs || []).filter(c => /anna/i.test(c.creator_name || ""));
console.log("\nanna candidates:");
anna.forEach(c => console.log(`  ${c.creator_name}: code=${c.affiliate_code}`));

console.log("\nsample of all affiliate codes:");
cs.slice(0, 20).forEach(c => console.log(`  ${c.creator_name}: ${c.affiliate_code}`));

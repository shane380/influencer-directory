import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: anna } = await db.from("creators").select("id").eq("affiliate_code", "annahlov").single();
console.log("Anna creator id:", anna?.id);

const { data: subs } = await db
  .from("creator_content_submissions")
  .select("id, status, files, submitted_at, reviewed_at, created_at")
  .eq("creator_id", anna.id)
  .order("created_at", { ascending: false });

console.log(`\n${subs?.length} total submissions:\n`);
for (const s of subs || []) {
  const fcount = Array.isArray(s.files) ? s.files.length : 0;
  console.log(
    `  status=${s.status}  files=${fcount}  ` +
    `created=${s.created_at?.slice(0, 10)}  ` +
    `submitted=${s.submitted_at?.slice(0, 10) || "-"}  ` +
    `reviewed=${s.reviewed_at?.slice(0, 10) || "-"}`
  );
}

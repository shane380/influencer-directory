// PHASE 2: for active legacy_affiliates with no influencer_id and no matching
// profile, create a minimal canonical influencers profile and link it.
// Centralizes affiliate-only people so future roles (whitelisting/partner)
// merge onto one row. Dry-run by default; pass --apply to write.
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
const APPLY = process.argv.includes("--apply");

const { data: legacy } = await db
  .from("legacy_affiliates")
  .select("id, name, discount_code, influencer_id")
  .is("influencer_id", null)
  .eq("status", "active");

// Existing handles (lowercased) so derived placeholders never collide.
const { data: existing } = await db.from("influencers").select("instagram_handle");
const taken = new Set((existing || []).map((r) => (r.instagram_handle || "").toLowerCase()).filter(Boolean));

// instagram_handle is NOT NULL. The discount code is usually the real IG handle
// (MOLLYDALTON→@mollydalton), so derive from it; strip trailing digits, and
// fall back to keep it unique. Team should verify these.
const deriveHandle = (l) => {
  const base = l.discount_code.toLowerCase().replace(/[0-9]+$/, "") || l.discount_code.toLowerCase();
  const candidates = [base, l.discount_code.toLowerCase(), `${l.discount_code.toLowerCase()}-${l.id.slice(0, 4)}`];
  for (const c of candidates) if (!taken.has(c)) return c;
  return candidates[2];
};

console.log(`${legacy.length} legacy affiliates need a profile.\n`);
let made = 0;
for (const l of legacy) {
  const handle = deriveHandle(l);
  taken.add(handle);
  if (!APPLY) {
    console.log(`WOULD CREATE "${l.name}" @${handle} (from ${l.discount_code}) source=other partnership_type=unassigned`);
    continue;
  }
  const { data: inf, error: insErr } = await db
    .from("influencers")
    .insert({
      name: l.name,
      instagram_handle: handle,
      source: "other",
      partnership_type: "unassigned",
      notes: "Affiliate imported from GoAffPro; profile auto-created to centralize partnership records. Verify instagram_handle.",
    })
    .select("id")
    .single();
  if (insErr) { console.log(`  CREATE FAILED ${l.name}: ${insErr.message}`); continue; }
  const { error: linkErr } = await db
    .from("legacy_affiliates")
    .update({ influencer_id: inf.id })
    .eq("id", l.id);
  if (linkErr) { console.log(`  LINK FAILED ${l.name}: ${linkErr.message}`); continue; }
  console.log(`CREATED + LINKED ${l.name} -> influencer ${inf.id}`);
  made++;
}
console.log(APPLY ? `\nDone. ${made} profiles created + linked.` : `\nDry run. Re-run with --apply to write.`);

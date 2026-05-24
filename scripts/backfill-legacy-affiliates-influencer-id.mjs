// Dry-run backfill for legacy_affiliates.influencer_id.
// Matches legacy.name against influencers.name (case-insensitive exact), and as
// a fallback tries legacy.discount_code against influencers.instagram_handle.
// Reports proposed updates. Pass --apply to actually write.
//
// Run: node scripts/backfill-legacy-affiliates-influencer-id.mjs
// Apply: node scripts/backfill-legacy-affiliates-influencer-id.mjs --apply
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

const apply = process.argv.includes("--apply");

const norm = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

const { data: legacy } = await db
  .from("legacy_affiliates")
  .select("id, name, discount_code, influencer_id")
  .is("influencer_id", null)
  .eq("status", "active");

const { data: influencers } = await db
  .from("influencers")
  .select("id, name, instagram_handle");

console.log(`${legacy.length} legacy_affiliates rows without influencer_id.`);
console.log(`${influencers.length} influencers in the directory.\n`);

const byName = new Map();
for (const inf of influencers) {
  const key = norm(inf.name);
  if (!key) continue;
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(inf);
}
const byHandle = new Map();
for (const inf of influencers) {
  const key = norm(inf.instagram_handle);
  if (!key) continue;
  byHandle.set(key, inf);
}

let willUpdate = 0;
let ambiguous = 0;
let noMatch = 0;
const updates = [];

for (const l of legacy) {
  const nameKey = norm(l.name);
  const codeKey = norm(l.discount_code);
  let matches = byName.get(nameKey) || [];

  // Fallback: try handle match by discount_code (some legacy codes are the
  // raw IG handle, e.g. "DAISYMCDERMOTT" → @daisymcdermott).
  if (matches.length === 0 && codeKey) {
    const handleHit = byHandle.get(codeKey);
    if (handleHit) matches = [handleHit];
  }

  if (matches.length === 1) {
    willUpdate += 1;
    const inf = matches[0];
    console.log(`  WOULD LINK   ${l.name?.padEnd(28)} (${l.discount_code}) → influencer ${inf.name} (@${inf.instagram_handle})`);
    updates.push({ legacy_id: l.id, influencer_id: inf.id });
  } else if (matches.length > 1) {
    ambiguous += 1;
    console.log(`  AMBIGUOUS    ${l.name?.padEnd(28)} (${l.discount_code}) — ${matches.length} influencer matches`);
  } else {
    noMatch += 1;
    console.log(`  NO MATCH     ${l.name?.padEnd(28)} (${l.discount_code})`);
  }
}

console.log(`\nSummary: ${willUpdate} would update, ${ambiguous} ambiguous, ${noMatch} no match.`);

if (!apply) {
  console.log(`\nDry-run only. Pass --apply to write ${updates.length} updates.`);
} else if (updates.length === 0) {
  console.log(`\nNothing to write.`);
} else {
  console.log(`\nApplying ${updates.length} updates…`);
  let ok = 0;
  let failed = 0;
  for (const u of updates) {
    const { error } = await db
      .from("legacy_affiliates")
      .update({ influencer_id: u.influencer_id })
      .eq("id", u.legacy_id);
    if (error) {
      console.log(`  FAILED ${u.legacy_id}: ${error.message}`);
      failed += 1;
    } else {
      ok += 1;
    }
  }
  console.log(`Done. ${ok} updated, ${failed} failed.`);
}

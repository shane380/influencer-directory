// One-time cleanup: remove the OLD auto-generated retainer charges from the
// commission_events ledger.
//
// Background: retainers used to bill automatically every calendar month
// (source_type='retainer'). They are now content-gated — an installment only
// earns when Daisy marks its content received (source_type='retainer_installment',
// via /api/admin/retainer/mark). The old auto rows are now wrong and must go.
//
// This ONLY deletes event_type='retainer' AND source_type='retainer' (the auto
// ones). It never touches 'retainer_installment' (Daisy's manual marks), and it
// never touches affiliate / ad_spend / paid_collab / refund events.
//
// Usage:
//   node scripts/cleanup-auto-retainer-events.mjs            (dry run — lists what would be deleted, changes nothing)
//   node scripts/cleanup-auto-retainer-events.mjs --apply    (actually delete)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const APPLY = process.argv.includes("--apply");

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Pull all the auto-generated retainer events.
const { data: rows, error } = await db
  .from("commission_events")
  .select("id, creator_key, influencer_id, period, amount")
  .eq("event_type", "retainer")
  .eq("source_type", "retainer");

if (error) { console.error("Query failed:", error.message); process.exit(1); }

if (!rows || rows.length === 0) {
  console.log("Nothing to clean up — no auto-generated retainer events found.");
  process.exit(0);
}

// Label each by influencer name for a readable preview.
const infIds = [...new Set(rows.map((r) => r.influencer_id).filter(Boolean))];
const { data: infs } = await db.from("influencers").select("id, instagram_handle").in("id", infIds.length ? infIds : ["x"]);
const nameOf = new Map((infs || []).map((i) => [i.id, i.instagram_handle || i.id]));

// Group by creator for the summary.
const byCreator = new Map();
for (const r of rows) {
  const key = r.creator_key;
  if (!byCreator.has(key)) byCreator.set(key, { name: nameOf.get(r.influencer_id) || key, months: [], total: 0 });
  const g = byCreator.get(key);
  g.months.push(`${r.period} ($${Number(r.amount).toLocaleString()})`);
  g.total += Number(r.amount);
}

console.log(`\n${APPLY ? "DELETING" : "DRY RUN — would delete"} ${rows.length} auto-generated retainer event(s) across ${byCreator.size} creator(s):\n`);
let grandTotal = 0;
for (const g of byCreator.values()) {
  grandTotal += g.total;
  console.log(`  ${g.name}  —  ${g.months.length} month(s), $${g.total.toLocaleString()} total`);
  console.log(`      ${g.months.sort().join(", ")}`);
}
console.log(`\n  GRAND TOTAL removed from ledger: $${grandTotal.toLocaleString()}`);
console.log(`  (Daisy's manually-marked installments are NOT affected.)\n`);

if (!APPLY) {
  console.log("This was a dry run. Re-run with --apply to actually delete.\n");
  process.exit(0);
}

const ids = rows.map((r) => r.id);
const { error: delErr } = await db.from("commission_events").delete().in("id", ids);
if (delErr) { console.error("Delete failed:", delErr.message); process.exit(1); }
console.log(`Deleted ${ids.length} auto retainer event(s).\n`);

/**
 * One-time backfill: copy partnership-ad history from creator_ad_performance_daily
 * into meta_ad_daily, so the Ad Performance page has period-over-period
 * comparison before the account-wide sync has accumulated its own history.
 *
 * Makes ZERO Meta API calls — it is a table-to-table copy.
 *
 * Two invariants this relies on, both verified against production first:
 *   1. No (ad_id, date) appears under more than one handle, so rows are copied
 *      1:1 rather than summed. Summing would double-count spend for any ad whose
 *      name matched two creator handles.
 *   2. Every ad in the source already exists in meta_ads, so backfilled rows
 *      render with a name and creative rather than as blanks.
 *
 * Existing meta_ad_daily rows are NEVER overwritten. Rows written by the live
 * sync carry real purchase counts; the ones inserted here carry NULL, meaning
 * "unknown" rather than zero. Clobbering a real count with NULL would lose data.
 *
 * Usage:  npx tsx scripts/backfill-meta-ad-daily.ts [--apply]
 * Without --apply it reports what it would do and writes nothing.
 */

import * as fs from "fs";
import * as path from "path";

const REPO = path.resolve(__dirname, "..");
for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const APPLY = process.argv.includes("--apply");

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { fetchAllRows } = await import(path.join(REPO, "src/lib/partnerships/paginate"));

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  console.log(APPLY ? "APPLY mode — will write" : "DRY RUN — pass --apply to write");

  const source = await fetchAllRows((from: number, to: number) =>
    (db.from("creator_ad_performance_daily") as any)
      .select("ad_id, date, spend, impressions, outbound_clicks, purchase_value, purchase_roas, video_3s_views, video_thruplays")
      .order("id", { ascending: true })
      .range(from, to),
  );
  console.log(`source rows (creator_ad_performance_daily): ${source.length}`);

  // Invariant 1: one row per (ad_id, date).
  const byKey = new Map<string, any>();
  let collisions = 0;
  for (const r of source as any[]) {
    const key = `${r.ad_id}:${String(r.date).slice(0, 10)}`;
    if (byKey.has(key)) {
      collisions++;
      continue; // keep the first; identical rows duplicated across handles
    }
    byKey.set(key, r);
  }
  if (collisions > 0) {
    console.warn(
      `  ${collisions} duplicate (ad_id,date) rows found across handles — kept one each, did NOT sum`,
    );
  }

  const existing = await fetchAllRows((from: number, to: number) =>
    (db.from("meta_ad_daily") as any)
      .select("ad_id, date")
      .order("ad_id", { ascending: true })
      .order("date", { ascending: true })
      .range(from, to),
  );
  const have = new Set((existing as any[]).map((r) => `${r.ad_id}:${String(r.date).slice(0, 10)}`));
  console.log(`meta_ad_daily existing rows: ${have.size}`);

  // Invariant 2: every backfilled ad has a dimension row to render from.
  const dims = await fetchAllRows((from: number, to: number) =>
    (db.from("meta_ads") as any).select("ad_id").order("ad_id", { ascending: true }).range(from, to),
  );
  const known = new Set((dims as any[]).map((r) => String(r.ad_id)));

  const toInsert: any[] = [];
  const orphanAds = new Set<string>();
  for (const [key, r] of byKey) {
    if (have.has(key)) continue; // never overwrite live-sync rows
    const adId = String(r.ad_id);
    if (!known.has(adId)) {
      orphanAds.add(adId);
      continue;
    }
    toInsert.push({
      ad_id: adId,
      date: String(r.date).slice(0, 10),
      spend: Number(r.spend || 0),
      impressions: Number(r.impressions || 0),
      outbound_clicks: Number(r.outbound_clicks || 0),
      // NULL, not 0: the source table never stored a purchase count.
      purchases: null,
      purchase_value: Number(r.purchase_value || 0),
      purchase_roas: r.purchase_roas ?? null,
      video_3s_views: Number(r.video_3s_views || 0),
      video_thruplays: Number(r.video_thruplays || 0),
    });
  }

  const dates = toInsert.map((r) => r.date).sort();
  console.log(`\nrows to insert: ${toInsert.length}`);
  if (toInsert.length > 0) {
    console.log(`  span: ${dates[0]} → ${dates[dates.length - 1]}`);
    console.log(`  distinct ads: ${new Set(toInsert.map((r) => r.ad_id)).size}`);
    console.log(`  total spend: $${toInsert.reduce((s, r) => s + r.spend, 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`);
  }
  if (orphanAds.size > 0) {
    console.warn(`  skipped ${orphanAds.size} ad(s) with no meta_ads row (would render blank)`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written.");
    return;
  }

  const CHUNK = 500;
  let written = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK);
    // insert, not upsert: anything already present is live-sync data that must
    // win over this backfill.
    const { error } = await (db.from("meta_ad_daily") as any).insert(slice);
    if (error) {
      console.error(`FAILED after ${written} rows: ${error.message}`);
      process.exit(1);
    }
    written += slice.length;
    console.log(`  ${written}/${toInsert.length}`);
  }
  console.log(`\nDone — ${written} rows inserted.`);
}

main().catch((e) => {
  console.error("FATAL:", e?.message || e);
  process.exit(1);
});

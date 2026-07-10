// Backfill video_3s_views / video_thruplays on creator_ad_performance_daily from
// Meta insights, for hook/hold rate on the creator leaderboard. Merges the video
// fields into FULL existing rows (spend/impressions/purchase_value copied from the
// DB row) so the upsert can never reset payment-critical columns. Rows Meta returns
// that don't exist locally are skipped and counted — this script never creates
// spend rows. Idempotent: safe to re-run.
//
// Usage:
//   node scripts/backfill-video-metrics.mjs                      (dry run, all handles)
//   node scripts/backfill-video-metrics.mjs --handle=somehandle  (dry run, one handle)
//   node scripts/backfill-video-metrics.mjs --apply              (write)

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const onlyHandle = args.find((a) => a.startsWith("--handle="))?.slice(9) || null;

// Daily table coverage starts 2026-01-27 (docs/meta-ads-data.md §3) — nothing
// older exists locally to merge into.
const SINCE = "2026-01-27";
const UNTIL = new Date().toISOString().slice(0, 10);

const META_API_VERSION = "v19.0";

const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const accessToken = process.env.META_ACCESS_TOKEN;
const adAccountId = process.env.META_AD_ACCOUNT_ID;
if (!accessToken || !adAccountId) {
  console.error("META_ACCESS_TOKEN / META_AD_ACCOUNT_ID missing from .env.local");
  process.exit(1);
}
const actId = adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`;
const round2 = (n) => Math.round(n * 100) / 100;

async function fetchRetry(url, tries = 6) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i, 16000)));
        continue;
      }
      const data = await res.json();
      if (data.error?.code === 4 && i < tries - 1) {
        await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i, 16000)));
        continue;
      }
      return data;
    } catch (e) {
      if (i === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** i, 16000)));
    }
  }
}

function pickActionValue(arr, actionType) {
  if (!Array.isArray(arr)) return null;
  for (const row of arr) {
    if (row?.action_type === actionType) {
      const v = parseFloat(row.value || "0");
      return isFinite(v) ? v : null;
    }
  }
  return null;
}

// Meta daily video metrics for one handle: Map "<ad_id>:<date>" -> {v3s, thru}
async function fetchMetaVideoDaily(handle) {
  const filtering = encodeURIComponent(
    JSON.stringify([{ field: "ad.name", operator: "CONTAIN", value: handle }])
  );
  const timeRange = encodeURIComponent(JSON.stringify({ since: SINCE, until: UNTIL }));
  let url =
    `https://graph.facebook.com/${META_API_VERSION}/${actId}/insights?` +
    `fields=ad_id,actions,video_thruplay_watched_actions` +
    `&level=ad&time_increment=1&time_range=${timeRange}` +
    `&filtering=${filtering}&limit=100&access_token=${accessToken}`;
  const out = new Map();
  const samples = [];
  while (url) {
    const data = await fetchRetry(url);
    if (data.error) throw new Error(`Meta insights error for ${handle}: ${data.error.message}`);
    for (const row of data.data || []) {
      const date = row.date_start?.slice(0, 10);
      if (!date || !row.ad_id) continue;
      const v3s = Math.round(pickActionValue(row.actions, "video_view") ?? 0);
      const thru = Math.round(pickActionValue(row.video_thruplay_watched_actions, "video_view") ?? 0);
      out.set(`${row.ad_id}:${date}`, { v3s, thru });
      if (samples.length < 3 && (v3s > 0 || thru > 0)) samples.push(row);
    }
    url = data.paging?.next || null;
  }
  return { out, samples };
}

// All existing daily rows for a handle, full columns, paged.
async function fetchExistingRows(handle) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("creator_ad_performance_daily")
      .select("*")
      .eq("instagram_handle", handle)
      .order("date", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(`read ${handle}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

async function spendSum(handle) {
  const rows = await fetchExistingRows(handle);
  return round2(rows.reduce((s, r) => s + Number(r.spend || 0), 0));
}

// --- tracked creators ---
const { data: invites } = await db
  .from("creator_invites")
  .select("influencer_id, influencer:influencers!creator_invites_influencer_id_fkey(id, instagram_handle)")
  .eq("has_ad_spend", true);
let handles = [...new Set((invites || []).map((i) => i.influencer?.instagram_handle).filter(Boolean))];
if (onlyHandle) handles = handles.filter((h) => h === onlyHandle);
console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${handles.length} handle(s), window ${SINCE} → ${UNTIL}\n`);

let totalMerged = 0;
let totalSkipped = 0;

for (const handle of handles) {
  const spendBefore = await spendSum(handle);
  const existing = await fetchExistingRows(handle);
  const byKey = new Map(existing.map((r) => [`${r.ad_id}:${String(r.date).slice(0, 10)}`, r]));

  let meta;
  try {
    meta = await fetchMetaVideoDaily(handle);
  } catch (e) {
    console.error(`  ${handle}: ${e.message} — skipping handle`);
    continue;
  }

  const merged = [];
  let skipped = 0;
  for (const [key, v] of meta.out) {
    const row = byKey.get(key);
    if (!row) {
      skipped++;
      continue;
    }
    if (Number(row.video_3s_views || 0) === v.v3s && Number(row.video_thruplays || 0) === v.thru) continue;
    merged.push({ ...row, video_3s_views: v.v3s, video_thruplays: v.thru });
  }
  totalMerged += merged.length;
  totalSkipped += skipped;

  console.log(
    `${handle}: ${existing.length} local rows, ${meta.out.size} Meta rows → ${merged.length} to update, ${skipped} unmatched (skipped). Spend sum: $${spendBefore.toFixed(2)}`
  );
  if (!APPLY && meta.samples.length) {
    console.log(`  sample Meta rows (sanity-check actions:video_view ≈ 3-sec plays):`);
    for (const s of meta.samples) {
      console.log(
        `    ${s.date_start} ad ${s.ad_id}: video_view=${pickActionValue(s.actions, "video_view")}, thruplay=${pickActionValue(s.video_thruplay_watched_actions, "video_view")}`
      );
    }
  }

  if (APPLY && merged.length) {
    for (let i = 0; i < merged.length; i += 500) {
      const chunk = merged.slice(i, i + 500).map(({ id, created_at, ...rest }) => rest);
      const { error } = await db
        .from("creator_ad_performance_daily")
        .upsert(chunk, { onConflict: "instagram_handle,ad_id,date" });
      if (error) throw new Error(`upsert ${handle}: ${error.message}`);
    }
    const spendAfter = await spendSum(handle);
    const ok = spendAfter === spendBefore;
    console.log(`  applied ${merged.length} rows. Spend sum after: $${spendAfter.toFixed(2)} ${ok ? "(unchanged ✓)" : "(CHANGED ✗ — INVESTIGATE)"}`);
    if (!ok) process.exit(1);
  }
}

console.log(`\nDone. ${totalMerged} rows ${APPLY ? "updated" : "would update"}, ${totalSkipped} Meta rows had no local match.`);
if (!APPLY) console.log("Re-run with --apply to write.");

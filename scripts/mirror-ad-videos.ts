/**
 * One-time backfill: copy the videos of recently spending BRAND ads to Mux so
 * the inventory app's Map ads inbox can play them. The nightly sync now does
 * this for ads that spend inside its window; this script covers the backlog —
 * ads that spent in the last N days but were already paused when that started.
 *
 * Meta calls: one per video (its download link). Mux: one encode per video.
 * Ads that already have a playback id are skipped, so re-running is safe.
 *
 * Usage:  npx tsx scripts/mirror-ad-videos.ts [--days 90] [--apply]
 * Without --apply it lists what it would upload and writes nothing.
 */

import * as fs from "fs";
import * as path from "path";

const REPO = path.resolve(__dirname, "..");
for (const line of fs.readFileSync(path.join(REPO, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

async function main() {
  const { getServiceClient, mirrorAdVideos } = await import("../src/lib/meta-sync");
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const daysIdx = args.indexOf("--days");
  const days = daysIdx >= 0 ? Math.max(1, parseInt(args[daysIdx + 1] || "90", 10) || 90) : 90;
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN missing");

  const db = getServiceClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const spenders = new Set<string>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("meta_ad_daily")
      .select("ad_id")
      .gte("date", since)
      .gt("spend", 0)
      .order("ad_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`meta_ad_daily read failed: ${error.message}`);
    for (const r of (data as any[]) || []) spenders.add(String(r.ad_id));
    if (!data || data.length < PAGE) break;
  }
  console.log(`${spenders.size} ad(s) spent since ${since}`);

  const result = await mirrorAdVideos(db, Array.from(spenders), token, { dryRun: !apply });
  console.log(
    `${apply ? "uploaded" : "would upload"} ${apply ? result.uploaded : result.candidates} video(s); ` +
      `${result.skipped} ad(s) already had a copy or are not videos`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

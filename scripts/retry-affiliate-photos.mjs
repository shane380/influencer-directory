// Hourly retry for the two affiliate profiles whose Apify scrape was blocked
// (@lane_meredith, @louisenbarnard). Only touches profiles still missing a
// photo; once both have one, it removes its own crontab entry and exits.
// Installed cron marker: "retry-affiliate-photos".
import { createClient } from "@supabase/supabase-js";
import { ApifyClient } from "apify-client";
import { readFileSync } from "fs";
import { execSync } from "child_process";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });
const stamp = () => new Date().toISOString();

const codes = ["LANEMEREDITH", "LOUISEBARNARD"];
const { data: leg } = await db
  .from("legacy_affiliates")
  .select("name, discount_code, influencer_id")
  .in("discount_code", codes);
const { data: infs } = await db
  .from("influencers")
  .select("id, instagram_handle, profile_photo_url")
  .in("id", leg.map((l) => l.influencer_id));
const infById = new Map(infs.map((i) => [i.id, i]));

const pending = leg.filter((l) => !infById.get(l.influencer_id)?.profile_photo_url);

if (pending.length === 0) {
  console.log(`${stamp()} both done — removing cron entry.`);
  try {
    execSync(`crontab -l 2>/dev/null | grep -v 'retry-affiliate-photos' | crontab -`);
  } catch {}
  process.exit(0);
}

for (const l of pending) {
  const handle = infById.get(l.influencer_id)?.instagram_handle;
  try {
    const run = await apify.actor("apify/instagram-profile-scraper").call({ usernames: [handle], resultsLimit: 1 });
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    const p = items?.[0];
    const pic = p?.profilePicUrlHd || p?.profilePicUrl;
    const fol = p?.followersCount ?? null;
    if (!pic) { console.log(`${stamp()} @${handle}: still blocked (empty result)`); continue; }
    const img = await fetch(pic, { headers: { "User-Agent": "Mozilla/5.0" } });
    const buf = Buffer.from(await img.arrayBuffer());
    const fn = `${handle}-${l.influencer_id.slice(0, 8)}.jpg`;
    await db.storage.from("profile-photos").upload(fn, buf, { contentType: "image/jpeg", upsert: true });
    const { data: pub } = db.storage.from("profile-photos").getPublicUrl(fn);
    await db.from("influencers").update({ profile_photo_url: pub.publicUrl, ...(fol != null ? { follower_count: fol } : {}) }).eq("id", l.influencer_id);
    console.log(`${stamp()} @${handle}: ✓ photo + ${fol} followers`);
  } catch (e) {
    console.log(`${stamp()} @${handle}: ERROR ${String(e.message).slice(0, 80)}`);
  }
}

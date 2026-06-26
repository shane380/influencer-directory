// Backfill profile_photo_url + follower_count for the auto-created affiliate
// profiles. Calls Apify directly (the API route is behind auth middleware),
// downloads the IG image, stores it in the profile-photos bucket, updates the
// influencer. Mirrors src/app/api/instagram-apify/route.ts field mapping.
import { createClient } from "@supabase/supabase-js";
import { ApifyClient } from "apify-client";
import { readFileSync } from "fs";
const env = readFileSync(".env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const apify = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

const codes = ["CARLIBYBEL","KATRINASCOTT","LANEMEREDITH","LOUISEBARNARD","MARIANAMORAIS","KRISTAL","MONICA25","NOMI15","SAMSCHUERMAN"];
const { data: leg } = await db.from("legacy_affiliates").select("name, discount_code, influencer_id").in("discount_code", codes);
const { data: infs } = await db.from("influencers").select("id, instagram_handle").in("id", leg.map(l => l.influencer_id));
const infById = new Map(infs.map(i => [i.id, i]));

for (const l of leg) {
  const handle = infById.get(l.influencer_id)?.instagram_handle;
  process.stdout.write(`${l.name.padEnd(16)} @${(handle||"").padEnd(18)} `);
  try {
    const run = await apify.actor("apify/instagram-profile-scraper").call({ usernames: [handle], resultsLimit: 1 });
    const { items } = await apify.dataset(run.defaultDatasetId).listItems();
    const p = items?.[0];
    if (!p) { console.log("not found — SKIP"); continue; }
    const picUrl = p.profilePicUrlHd || p.profilePicUrl || p.profile_pic_url;
    const followers = p.followersCount ?? p.followers_count ?? p.followedByCount ?? null;
    if (!picUrl) { console.log(`no pic (private=${p.private}) — SKIP`); continue; }

    const img = await fetch(picUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!img.ok) { console.log(`img HTTP ${img.status} — SKIP`); continue; }
    const buf = Buffer.from(await img.arrayBuffer());

    const fileName = `${handle}-${l.influencer_id.slice(0,8)}.jpg`;
    const up = await db.storage.from("profile-photos").upload(fileName, buf, { contentType: "image/jpeg", upsert: true });
    if (up.error) { console.log(`upload err: ${up.error.message}`); continue; }
    const { data: pub } = db.storage.from("profile-photos").getPublicUrl(fileName);

    const patch = { profile_photo_url: pub.publicUrl };
    if (followers != null) patch.follower_count = followers;
    const { error } = await db.from("influencers").update(patch).eq("id", l.influencer_id);
    console.log(error ? `db err: ${error.message}` : `✓ photo + ${followers ?? "?"} followers`);
  } catch (e) {
    console.log(`ERROR ${String(e.message).slice(0,80)}`);
  }
}
console.log("\nDone.");

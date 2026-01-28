import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const rapidApiKey = process.env.RAPIDAPI_KEY!;

async function fetchIG(handle: string) {
  const res = await fetch(`https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile_hover.php?username_or_url=${handle}`, {
    headers: { "x-rapidapi-key": rapidApiKey, "x-rapidapi-host": "instagram-scraper-stable-api.p.rapidapi.com" }
  });
  const data = await res.json();
  if (data.error || !data.user_data) return null;
  return data.user_data;
}

async function uploadPhoto(url: string, username: string) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const fileName = `${username}-${Date.now()}.jpg`;
    await supabase.storage.from("profile-photos").upload(fileName, buf, { contentType: "image/jpeg" });
    return supabase.storage.from("profile-photos").getPublicUrl(fileName).data.publicUrl;
  } catch { return null; }
}

async function main() {
  // Get all JAN26 campaign IDs
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, name")
    .ilike("name", "JAN26%");

  if (!campaigns || campaigns.length === 0) {
    console.log("No JAN26 campaigns found");
    return;
  }

  console.log("Found campaigns:", campaigns.map(c => c.name).join(", "));
  const campaignIds = campaigns.map(c => c.id);

  // Get all influencers in those campaigns who are missing profile photos
  const { data: ciList } = await supabase
    .from("campaign_influencers")
    .select("influencer_id")
    .in("campaign_id", campaignIds);

  if (!ciList || ciList.length === 0) {
    console.log("No influencers in JAN26 campaigns");
    return;
  }

  const influencerIds = [...new Set(ciList.map(ci => ci.influencer_id))];

  // Get influencers missing profile photos
  const { data: influencers } = await supabase
    .from("influencers")
    .select("id, name, instagram_handle, profile_photo_url, follower_count")
    .in("id", influencerIds)
    .or("profile_photo_url.is.null,profile_photo_url.eq.");

  if (!influencers || influencers.length === 0) {
    console.log("All influencers already have profile photos!");
    return;
  }

  console.log(`\nFound ${influencers.length} influencers missing profile photos:\n`);
  influencers.forEach(inf => console.log(`  - ${inf.name} (@${inf.instagram_handle})`));

  console.log("\n--- Starting photo fetch ---\n");

  let updated = 0;
  let failed = 0;

  for (const inf of influencers) {
    console.log(`Processing @${inf.instagram_handle}...`);

    const profile = await fetchIG(inf.instagram_handle);
    await new Promise(r => setTimeout(r, 1500)); // Rate limit

    if (!profile) {
      console.log(`  Could not fetch IG profile`);
      failed++;
      continue;
    }

    const picUrl = profile.hd_profile_pic_url_info?.url || profile.profile_pic_url;
    if (!picUrl) {
      console.log(`  No profile photo URL in response`);
      failed++;
      continue;
    }

    const uploadedUrl = await uploadPhoto(picUrl, inf.instagram_handle);
    if (!uploadedUrl) {
      console.log(`  Failed to upload photo`);
      failed++;
      continue;
    }

    // Update the influencer record
    const updateData: any = { profile_photo_url: uploadedUrl };

    // Also update follower count if we got it and current is 0
    if (profile.follower_count && (!inf.follower_count || inf.follower_count === 0)) {
      updateData.follower_count = profile.follower_count;
    }

    const { error } = await supabase
      .from("influencers")
      .update(updateData)
      .eq("id", inf.id);

    if (error) {
      console.log(`  Error updating: ${error.message}`);
      failed++;
    } else {
      console.log(`  Updated with photo${updateData.follower_count ? ` and ${updateData.follower_count} followers` : ""}`);
      updated++;
    }
  }

  console.log(`\n--- Done ---`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);
}

main();

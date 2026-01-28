import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const rapidApiKey = process.env.RAPIDAPI_KEY!;

async function fetchIG(handle: string) {
  const res = await fetch(`https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile_hover.php?username_or_url=${handle}`, {
    headers: { "x-rapidapi-key": rapidApiKey, "x-rapidapi-host": "instagram-scraper-stable-api.p.rapidapi.com" }
  });
  const data = await res.json();
  console.log(`  API response for @${handle}:`, JSON.stringify(data, null, 2).substring(0, 500));
  if (data.error || !data.user_data) return null;
  return data.user_data;
}

async function uploadPhoto(url: string, username: string) {
  try {
    console.log(`  Fetching image from: ${url.substring(0, 100)}...`);
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    console.log(`  Image fetch status: ${res.status}`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    console.log(`  Image size: ${buf.byteLength} bytes`);
    const fileName = `${username}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("profile-photos").upload(fileName, buf, { contentType: "image/jpeg" });
    if (error) {
      console.log(`  Upload error: ${error.message}`);
      return null;
    }
    return supabase.storage.from("profile-photos").getPublicUrl(fileName).data.publicUrl;
  } catch (e: any) {
    console.log(`  Exception: ${e.message}`);
    return null;
  }
}

async function main() {
  const handles = ["courtneywatts", "safiyaj___", "laylagraham_"];

  for (const handle of handles) {
    console.log(`\nProcessing @${handle}...`);

    // Get the influencer
    const { data: inf } = await supabase
      .from("influencers")
      .select("id, name, instagram_handle")
      .ilike("instagram_handle", handle)
      .single();

    if (!inf) {
      console.log(`  Influencer not found in DB`);
      continue;
    }

    const profile = await fetchIG(handle);
    await new Promise(r => setTimeout(r, 2000));

    if (!profile) {
      console.log(`  Could not fetch IG profile`);
      continue;
    }

    const picUrl = profile.hd_profile_pic_url_info?.url || profile.profile_pic_url;
    console.log(`  Profile pic URL: ${picUrl ? picUrl.substring(0, 80) + "..." : "NONE"}`);

    if (!picUrl) {
      continue;
    }

    const uploadedUrl = await uploadPhoto(picUrl, handle);
    if (!uploadedUrl) {
      continue;
    }

    const { error } = await supabase
      .from("influencers")
      .update({
        profile_photo_url: uploadedUrl,
        follower_count: profile.follower_count || undefined
      })
      .eq("id", inf.id);

    if (error) {
      console.log(`  DB update error: ${error.message}`);
    } else {
      console.log(`  SUCCESS - Updated with photo`);
    }
  }

  console.log("\nDone!");
}

main();

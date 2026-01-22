import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const rapidApiKey = process.env.RAPIDAPI_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fetchInstagramProfile(handle: string): Promise<any | null> {
  try {
    const response = await fetch(
      `https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile_hover.php?username_or_url=${encodeURIComponent(handle)}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key": rapidApiKey,
          "x-rapidapi-host": "instagram-scraper-stable-api.p.rapidapi.com",
        },
      }
    );

    if (!response.ok) return null;
    const data = await response.json();
    if (data.error || !data.user_data) return null;

    return {
      profile_pic_url: data.user_data.hd_profile_pic_url_info?.url || data.user_data.profile_pic_url,
    };
  } catch {
    return null;
  }
}

async function uploadProfilePhoto(photoUrl: string, username: string): Promise<string | null> {
  try {
    const response = await fetch(photoUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!response.ok) {
      console.log(`  Failed to download photo`);
      return null;
    }

    const imageBuffer = await response.arrayBuffer();
    const fileName = `${username}-${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from("profile-photos")
      .upload(fileName, imageBuffer, { contentType: "image/jpeg" });

    if (error) {
      console.log(`  Upload error: ${error.message}`);
      return null;
    }

    const { data } = supabase.storage.from("profile-photos").getPublicUrl(fileName);
    return data.publicUrl;
  } catch (e) {
    console.log(`  Error: ${e}`);
    return null;
  }
}

async function fixMissingPhotos() {
  // Find influencers with followers but no photo
  const { data: missing } = await supabase
    .from("influencers")
    .select("id, name, instagram_handle")
    .is("profile_photo_url", null)
    .gt("follower_count", 0);

  console.log(`Found ${missing?.length || 0} influencers missing photos\n`);

  let fixed = 0;
  let failed = 0;

  for (const inf of missing || []) {
    console.log(`${inf.name} (@${inf.instagram_handle})`);

    const profile = await fetchInstagramProfile(inf.instagram_handle);
    await new Promise(r => setTimeout(r, 1000)); // Rate limit

    if (!profile?.profile_pic_url) {
      console.log(`  Could not fetch Instagram profile`);
      failed++;
      continue;
    }

    const photoUrl = await uploadProfilePhoto(profile.profile_pic_url, inf.instagram_handle);

    if (photoUrl) {
      await supabase
        .from("influencers")
        .update({ profile_photo_url: photoUrl })
        .eq("id", inf.id);
      console.log(`  Photo updated!`);
      fixed++;
    } else {
      failed++;
    }
  }

  console.log(`\nDone: ${fixed} fixed, ${failed} failed`);
}

fixMissingPhotos();

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(process.cwd(), ".env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1]] = match[2];
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const rapidApiKey = process.env.RAPIDAPI_KEY!;

async function fetchInstagramProfile(handle: string): Promise<{ profile_pic_url: string } | null> {
  try {
    const cleanHandle = handle.replace("@", "").trim();
    const response = await fetch(
      `https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile_hover.php?username_or_url=${encodeURIComponent(cleanHandle)}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key": rapidApiKey,
          "x-rapidapi-host": "instagram-scraper-stable-api.p.rapidapi.com",
        },
      }
    );

    if (!response.ok) {
      console.log(`  RapidAPI returned ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.error || !data.user_data) {
      console.log(`  No user data found`);
      return null;
    }

    const profilePicUrl = data.user_data.hd_profile_pic_url_info?.url || data.user_data.profile_pic_url;

    if (!profilePicUrl) return null;

    return {
      profile_pic_url: profilePicUrl,
    };
  } catch (e) {
    console.log(`  Fetch error: ${e}`);
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
  console.log("Finding influencers with missing profile photos...\n");

  // Find influencers with no profile image but have an instagram handle
  const { data: missing, error } = await supabase
    .from("influencers")
    .select("id, name, instagram_handle, profile_photo_url")
    .not("instagram_handle", "is", null)
    .or("profile_photo_url.is.null,profile_photo_url.eq.")
    .order("name");

  if (error) {
    console.error("Error fetching influencers:", error);
    return;
  }

  console.log(`Found ${missing?.length || 0} influencers missing photos:\n`);

  if (!missing || missing.length === 0) {
    console.log("All influencers have profile photos!");
    return;
  }

  // List them first
  for (const inf of missing) {
    console.log(`- ${inf.name} (@${inf.instagram_handle})`);
  }

  console.log("\n--- Starting photo fetch ---\n");

  let fixed = 0;
  let failed = 0;

  for (const inf of missing) {
    if (!inf.instagram_handle) continue;

    console.log(`${inf.name} (@${inf.instagram_handle})`);

    const profile = await fetchInstagramProfile(inf.instagram_handle);

    if (!profile?.profile_pic_url) {
      console.log(`  Could not fetch Instagram profile`);
      failed++;
      // Rate limit
      await new Promise(r => setTimeout(r, 2000));
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

    // Rate limit
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\nDone: ${fixed} fixed, ${failed} failed`);
}

fixMissingPhotos();

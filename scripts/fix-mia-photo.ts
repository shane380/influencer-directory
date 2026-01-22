import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const rapidApiKey = process.env.RAPIDAPI_KEY || "";

async function fixMiaPhoto() {
  const handle = "miaflorentia";

  console.log("Fetching Instagram profile...");
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

  const data = await response.json();
  const userData = data.user_data;

  const photoUrl = userData.hd_profile_pic_url_info?.url || userData.profile_pic_url;
  console.log("Photo URL from Instagram:", photoUrl);

  if (!photoUrl) {
    console.log("No photo URL found!");
    return;
  }

  console.log("\nDownloading photo...");
  const photoResponse = await fetch(photoUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  console.log("Photo response status:", photoResponse.status);
  console.log("Photo response headers:", Object.fromEntries(photoResponse.headers.entries()));

  if (!photoResponse.ok) {
    console.log("Failed to download photo");
    return;
  }

  const imageBuffer = await photoResponse.arrayBuffer();
  console.log("Downloaded image size:", imageBuffer.byteLength, "bytes");

  const fileName = `${handle}-${Date.now()}.jpg`;
  console.log("\nUploading to Supabase storage as:", fileName);

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("profile-photos")
    .upload(fileName, imageBuffer, { contentType: "image/jpeg" });

  if (uploadError) {
    console.log("Upload error:", uploadError);
    return;
  }

  console.log("Upload successful:", uploadData);

  const { data: urlData } = supabase.storage
    .from("profile-photos")
    .getPublicUrl(fileName);

  const publicUrl = urlData.publicUrl;
  console.log("Public URL:", publicUrl);

  // Update the influencer record
  const { error: updateError } = await supabase
    .from("influencers")
    .update({ profile_photo_url: publicUrl })
    .eq("instagram_handle", handle);

  if (updateError) {
    console.log("Update error:", updateError);
  } else {
    console.log("\nSuccessfully updated Mia's profile photo!");
  }
}

fixMiaPhoto().catch(console.error);

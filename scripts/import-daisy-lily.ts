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

async function addInfluencer(handle: string, csvName: string, topSize: string, bottomsSize: string) {
  console.log(`\nProcessing @${handle}...`);

  // Check if exists
  const { data: existing } = await supabase.from("influencers").select("id, name").ilike("instagram_handle", handle).single();

  let influencerId: string;

  if (existing) {
    console.log("  Already exists:", existing.name);
    influencerId = existing.id;
  } else {
    // Fetch IG profile
    const profile = await fetchIG(handle);
    await new Promise(r => setTimeout(r, 1000));

    let photoUrl: string | null = null;
    let followerCount = 0;
    let fullName = csvName;

    if (profile) {
      followerCount = profile.follower_count || 0;
      fullName = profile.full_name || csvName;
      const picUrl = profile.hd_profile_pic_url_info?.url || profile.profile_pic_url;
      if (picUrl) photoUrl = await uploadPhoto(picUrl, handle);
      console.log(`  IG: ${fullName} (${followerCount} followers)`);
    }

    const { data: newInf, error } = await supabase.from("influencers").insert({
      name: fullName,
      instagram_handle: handle,
      profile_photo_url: photoUrl,
      follower_count: followerCount,
      partnership_type: "gifted_no_ask",
      tier: "B",
      relationship_status: "order_placed",
      top_size: topSize,
      bottoms_size: bottomsSize,
      notes: "Imported from JAN26 CSV"
    }).select("id").single();

    if (error) {
      console.log("  Error:", error.message);
      return;
    }
    influencerId = newInf.id;
    console.log("  Created ID:", influencerId);
  }

  // Add to JAN26 - Uncategorized
  const { data: campaign } = await supabase.from("campaigns").select("id").eq("name", "JAN26 - Uncategorized").single();
  if (campaign) {
    const { data: link } = await supabase.from("campaign_influencers").select("id").eq("campaign_id", campaign.id).eq("influencer_id", influencerId).single();
    if (!link) {
      await supabase.from("campaign_influencers").insert({
        campaign_id: campaign.id,
        influencer_id: influencerId,
        partnership_type: "gifted_no_ask",
        status: "order_placed",
        content_posted: "none"
      });
      console.log("  Added to JAN26 - Uncategorized");
    } else {
      console.log("  Already in JAN26 - Uncategorized");
    }
  }
}

async function main() {
  // From CSV:
  // Daisy Tomlinson - XS/XS - order placed - approved
  // Lily Scilabro - S/S - order placed - paid

  await addInfluencer("daisytomlinson", "Daisy Tomlinson", "XS", "XS");
  await addInfluencer("internetlily", "Lily Scilabro", "S", "S");

  console.log("\nDone!");
}

main();

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
  const handle = "maanuness";
  console.log("Looking up @" + handle + "...");

  // Check if exists
  const { data: existing } = await supabase.from("influencers").select("id, name").ilike("instagram_handle", handle).single();

  if (existing) {
    console.log("Already exists:", existing.name);
    const { data: campaign } = await supabase.from("campaigns").select("id").eq("name", "JAN26 - Uncategorized").single();
    if (campaign) {
      const { data: link } = await supabase.from("campaign_influencers").select("id").eq("campaign_id", campaign.id).eq("influencer_id", existing.id).single();
      if (!link) {
        await supabase.from("campaign_influencers").insert({ campaign_id: campaign.id, influencer_id: existing.id, partnership_type: "gifted_recurring", status: "prospect", content_posted: "none" });
        console.log("Added to JAN26 - Uncategorized");
      } else {
        console.log("Already in campaign");
      }
    }
    return;
  }

  // Fetch IG profile
  const profile = await fetchIG(handle);
  if (!profile) { console.log("Could not fetch profile"); return; }

  console.log("Found:", profile.full_name, "(" + profile.follower_count + " followers)");

  let photoUrl: string | null = null;
  const picUrl = profile.hd_profile_pic_url_info?.url || profile.profile_pic_url;
  if (picUrl) photoUrl = await uploadPhoto(picUrl, handle);

  // Create influencer
  const { data: newInf, error } = await supabase.from("influencers").insert({
    name: profile.full_name || "Mariana",
    instagram_handle: handle,
    profile_photo_url: photoUrl,
    follower_count: profile.follower_count || 0,
    partnership_type: "gifted_recurring",
    tier: "B",
    relationship_status: "prospect",
    notes: "Imported from JAN26 CSV"
  }).select("id").single();

  if (error) { console.log("Error:", error.message); return; }
  console.log("Created influencer ID:", newInf.id);

  // Add to campaign
  const { data: campaign } = await supabase.from("campaigns").select("id").eq("name", "JAN26 - Uncategorized").single();
  if (campaign) {
    await supabase.from("campaign_influencers").insert({ campaign_id: campaign.id, influencer_id: newInf.id, partnership_type: "gifted_recurring", status: "prospect", content_posted: "none" });
    console.log("Added to JAN26 - Uncategorized");
  }
}

main();

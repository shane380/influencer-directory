import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const rapidApiKey = process.env.RAPIDAPI_KEY || "";

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

    const userData = data.user_data;
    return {
      username: userData.username,
      full_name: userData.full_name,
      profile_pic_url: userData.hd_profile_pic_url_info?.url || userData.profile_pic_url,
      follower_count: userData.follower_count || 0,
    };
  } catch (error) {
    console.log(`  Error fetching Instagram for ${handle}:`, error);
    return null;
  }
}

async function uploadProfilePhoto(photoUrl: string, username: string): Promise<string | null> {
  try {
    const response = await fetch(photoUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) return null;

    const imageBuffer = await response.arrayBuffer();
    const fileName = `${username}-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(fileName, imageBuffer, { contentType: "image/jpeg" });

    if (uploadError) return null;

    const { data: urlData } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    return null;
  }
}

async function findOrCreateCampaign(name: string, startDate: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from("campaigns")
    .select("id")
    .eq("name", name)
    .single();

  if (existing) return existing.id;

  const { data: newCampaign, error } = await supabase
    .from("campaigns")
    .insert({ name, start_date: startDate, status: "active" })
    .select("id")
    .single();

  if (error) return null;
  console.log(`  Created new campaign: ${name}`);
  return newCampaign.id;
}

const influencers = [
  {
    name: "Ellie Casei",
    handle: "elliecasei",
    partnershipType: "paid",
    campaigns: ["DEC25", "NOV25"],
    email: null,
    mailingAddress: null,
  },
  {
    name: "Mia Florentia",
    handle: "miaflorentia",
    partnershipType: "gifted_soft_ask",
    campaigns: ["NOV25"],
    email: "miaflorentiaginn@ymail.com",
    mailingAddress: "Sotis Villas, Jl. Raya Kayutulang, Canggu, Kec. Kuta Utara",
  },
];

async function importInfluencers() {
  for (const inf of influencers) {
    console.log(`\n--- Importing ${inf.name} (@${inf.handle}) ---`);

    // Check if already exists
    const { data: existing } = await supabase
      .from("influencers")
      .select("id")
      .ilike("instagram_handle", inf.handle)
      .single();

    if (existing) {
      console.log(`  Skipping: Already exists`);
      continue;
    }

    // Fetch Instagram profile
    console.log(`  Fetching Instagram profile...`);
    const igProfile = await fetchInstagramProfile(inf.handle);
    await new Promise((r) => setTimeout(r, 1000));

    let profilePhotoUrl: string | null = null;
    let followerCount = 0;
    let fullName = inf.name;

    if (igProfile) {
      console.log(`  Found: ${igProfile.full_name} (${igProfile.follower_count} followers)`);
      followerCount = igProfile.follower_count || 0;
      fullName = igProfile.full_name || inf.name;

      if (igProfile.profile_pic_url) {
        console.log(`  Uploading profile photo...`);
        profilePhotoUrl = await uploadProfilePhoto(igProfile.profile_pic_url, inf.handle);
      }
    }

    // Insert influencer
    const { data: newInfluencer, error: insertError } = await supabase
      .from("influencers")
      .insert({
        name: fullName,
        instagram_handle: inf.handle,
        profile_photo_url: profilePhotoUrl,
        follower_count: followerCount,
        email: inf.email,
        mailing_address: inf.mailingAddress,
        partnership_type: inf.partnershipType,
        tier: "C",
        relationship_status: "prospect",
        notes: "Imported from Airtable CSV",
      })
      .select("id")
      .single();

    if (insertError) {
      console.log(`  ERROR:`, insertError.message);
      continue;
    }

    console.log(`  Created influencer (ID: ${newInfluencer.id})`);

    // Link to campaigns
    for (const code of inf.campaigns) {
      const monthMap: Record<string, { name: string; date: string }> = {
        NOV25: { name: "November 2025", date: "2025-11-01" },
        DEC25: { name: "December 2025", date: "2025-12-01" },
        JAN25: { name: "January 2025", date: "2025-01-01" },
        FEB25: { name: "February 2025", date: "2025-02-01" },
      };

      const campaign = monthMap[code];
      if (!campaign) continue;

      const campaignId = await findOrCreateCampaign(campaign.name, campaign.date);
      if (!campaignId) continue;

      const { error: linkError } = await supabase
        .from("campaign_influencers")
        .insert({
          campaign_id: campaignId,
          influencer_id: newInfluencer.id,
          partnership_type: inf.partnershipType,
          status: "prospect",
        });

      if (linkError) {
        console.log(`  ERROR linking to ${campaign.name}:`, linkError.message);
      } else {
        console.log(`  Linked to campaign: ${campaign.name}`);
      }
    }
  }

  console.log("\n=== Import Complete ===\n");
}

importInfluencers();

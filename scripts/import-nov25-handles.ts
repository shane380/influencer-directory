import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const rapidApiKey = process.env.RAPIDAPI_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Read the original CSV to get name -> postUrl mapping
function getNameToUrlMap(csvPath: string): Map<string, string> {
  const content = fs.readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  const map = new Map<string, string>();

  for (const row of parsed.data as Record<string, string>[]) {
    const name = (row["Name"] || "").trim();
    const igValue = row["IG"] || row["Instagram Handle"] || "";

    if (name && (igValue.includes("/p/") || igValue.includes("/reel/"))) {
      const url = igValue.trim().split(/\s+/)[0];
      // Store URL -> name mapping (normalize URL)
      const normalizedUrl = url.split("?")[0].replace(/\/$/, "");
      map.set(normalizedUrl, name);
    }
  }

  return map;
}

// Read Apify CSV to get inputUrl -> ownerUsername mapping
function getUrlToHandleMap(csvPath: string): Map<string, string> {
  const content = fs.readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  const map = new Map<string, string>();

  for (const row of parsed.data as Record<string, string>[]) {
    const inputUrl = (row["inputUrl"] || "").trim();
    const ownerUsername = (row["ownerUsername"] || "").trim().toLowerCase();

    if (inputUrl && ownerUsername) {
      const normalizedUrl = inputUrl.split("?")[0].replace(/\/$/, "");
      map.set(normalizedUrl, ownerUsername);
    }
  }

  return map;
}

// Fetch Instagram profile
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
      username: data.user_data.username,
      full_name: data.user_data.full_name,
      profile_pic_url: data.user_data.hd_profile_pic_url_info?.url || data.user_data.profile_pic_url,
      follower_count: data.user_data.follower_count || 0,
    };
  } catch {
    return null;
  }
}

// Upload profile photo
async function uploadProfilePhoto(photoUrl: string, username: string): Promise<string | null> {
  try {
    const response = await fetch(photoUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    });
    if (!response.ok) return null;

    const imageBuffer = await response.arrayBuffer();
    const fileName = `${username}-${Date.now()}.jpg`;

    const { error } = await supabase.storage
      .from("profile-photos")
      .upload(fileName, imageBuffer, { contentType: "image/jpeg" });
    if (error) return null;

    const { data } = supabase.storage.from("profile-photos").getPublicUrl(fileName);
    return data.publicUrl;
  } catch {
    return null;
  }
}

async function main() {
  const originalCsvPath = "/Users/shanepetersen/Downloads/Campaigns 25'-NOV25.csv";
  const apifyCsvPath = "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_03-42-58-827.csv";
  const november2025Id = "e7c4e86d-fe55-470a-91f5-27c802cbb2d5";

  console.log("Reading original CSV...");
  const urlToName = getNameToUrlMap(originalCsvPath);
  console.log(`Found ${urlToName.size} post URLs with names\n`);

  console.log("Reading Apify CSV...");
  const urlToHandle = getUrlToHandleMap(apifyCsvPath);
  console.log(`Found ${urlToHandle.size} extracted handles\n`);

  // Match and create/update influencers
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let alreadyExists = 0;

  const matched: { name: string; handle: string }[] = [];

  // Match URLs
  for (const [url, name] of urlToName) {
    const handle = urlToHandle.get(url);
    if (handle) {
      matched.push({ name, handle });
    }
  }

  console.log(`Matched ${matched.length} influencers\n`);

  for (let i = 0; i < matched.length; i++) {
    const { name, handle } = matched[i];
    console.log(`[${i + 1}/${matched.length}] ${name} -> @${handle}`);

    // Check if influencer already exists
    const { data: existing } = await supabase
      .from("influencers")
      .select("id, name, instagram_handle")
      .ilike("instagram_handle", handle)
      .single();

    if (existing) {
      console.log(`  Already exists: ${existing.name}`);

      // Check if already in campaign
      const { data: link } = await supabase
        .from("campaign_influencers")
        .select("id")
        .eq("campaign_id", november2025Id)
        .eq("influencer_id", existing.id)
        .single();

      if (!link) {
        await supabase.from("campaign_influencers").insert({
          campaign_id: november2025Id,
          influencer_id: existing.id,
          partnership_type: "unassigned",
          status: "prospect",
          content_posted: "none",
        });
        console.log(`  Added to November 2025 campaign`);
        updated++;
      } else {
        alreadyExists++;
      }
      continue;
    }

    // Fetch Instagram profile
    const profile = await fetchInstagramProfile(handle);
    await new Promise(r => setTimeout(r, 1000));

    let profilePhotoUrl: string | null = null;
    let followerCount = 0;
    let fullName = name;

    if (profile) {
      followerCount = profile.follower_count || 0;
      fullName = profile.full_name || name;
      if (profile.profile_pic_url) {
        profilePhotoUrl = await uploadProfilePhoto(profile.profile_pic_url, handle);
      }
      console.log(`  IG: ${fullName} (${followerCount} followers)`);
    } else {
      console.log(`  Could not fetch IG profile`);
    }

    // Create influencer
    const { data: newInfluencer, error } = await supabase
      .from("influencers")
      .insert({
        name: fullName,
        instagram_handle: handle,
        profile_photo_url: profilePhotoUrl,
        follower_count: followerCount,
        partnership_type: "unassigned",
        tier: "C",
        relationship_status: "prospect",
        notes: "Imported from NOV25 CSV (handle extracted via Apify)",
      })
      .select("id")
      .single();

    if (error) {
      console.log(`  Error: ${error.message}`);
      skipped++;
      continue;
    }

    // Add to campaign
    await supabase.from("campaign_influencers").insert({
      campaign_id: november2025Id,
      influencer_id: newInfluencer.id,
      partnership_type: "unassigned",
      status: "prospect",
      content_posted: "none",
    });

    console.log(`  Created (ID: ${newInfluencer.id})`);
    created++;
  }

  console.log("\n" + "=".repeat(50));
  console.log("SUMMARY");
  console.log("=".repeat(50));
  console.log(`Total matched:        ${matched.length}`);
  console.log(`New profiles created: ${created}`);
  console.log(`Added to campaign:    ${updated}`);
  console.log(`Already in campaign:  ${alreadyExists}`);
  console.log(`Skipped (errors):     ${skipped}`);
  console.log("=".repeat(50));
}

main().catch(console.error);

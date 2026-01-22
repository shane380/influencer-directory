import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Initialize Supabase client with service role for admin access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const rapidApiKey = process.env.RAPIDAPI_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Partnership type mapping
const partnershipTypeMap: Record<string, string> = {
  paid: "paid",
  "gifted (soft ask)": "gifted_soft_ask",
  "gifted (no ask)": "gifted_no_ask",
  "gifted (deliverable ask)": "gifted_deliverable_ask",
  "gifted recurring": "gifted_recurring",
  gifted: "gifted_no_ask",
};

// Parse campaign code like "NOV25" to date "2025-11-01"
function parseCampaignCode(code: string): { name: string; startDate: string } | null {
  const match = code.trim().match(/^([A-Z]{3})(\d{2})$/);
  if (!match) return null;

  const monthMap: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  };

  const monthStr = match[1];
  const yearStr = match[2];
  const month = monthMap[monthStr];
  if (!month) return null;

  const year = 2000 + parseInt(yearStr, 10);
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthNames = ["", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  return {
    name: `${monthNames[month]} ${year}`,
    startDate,
  };
}

// Extract Instagram handle from URL
function extractInstagramHandle(urlOrHandle: string): string | null {
  if (!urlOrHandle) return null;

  // If it's a post URL like /p/xxx/, try to extract username differently
  // For post URLs, we can't get the username directly, so return null
  if (urlOrHandle.includes("/p/") || urlOrHandle.includes("/reel/")) {
    console.log(`  Skipping post URL (cannot extract handle): ${urlOrHandle}`);
    return null;
  }

  // Profile URL: https://www.instagram.com/username/ or https://www.instagram.com/username
  const profileMatch = urlOrHandle.match(/instagram\.com\/([a-zA-Z0-9._]+)\/?(?:\?|$)/);
  if (profileMatch) {
    return profileMatch[1];
  }

  // Just a handle
  if (!urlOrHandle.includes("/")) {
    return urlOrHandle.replace("@", "").trim();
  }

  return null;
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

    if (!response.ok) {
      console.log(`  Instagram API error for ${handle}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    if (data.error || !data.user_data) {
      console.log(`  Instagram user not found: ${handle}`);
      return null;
    }

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

// Download and upload profile photo to Supabase storage
async function uploadProfilePhoto(photoUrl: string, username: string): Promise<string | null> {
  try {
    const response = await fetch(photoUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.log(`  Failed to download photo for ${username}`);
      return null;
    }

    const imageBuffer = await response.arrayBuffer();
    const fileName = `${username}-${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from("profile-photos")
      .upload(fileName, imageBuffer, { contentType: "image/jpeg" });

    if (uploadError) {
      console.log(`  Failed to upload photo for ${username}:`, uploadError.message);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from("profile-photos")
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.log(`  Error uploading photo for ${username}:`, error);
    return null;
  }
}

// Find or create campaign
async function findOrCreateCampaign(name: string, startDate: string): Promise<string | null> {
  // Check if campaign exists
  const { data: existing } = await supabase
    .from("campaigns")
    .select("id")
    .eq("name", name)
    .single();

  if (existing) {
    return existing.id;
  }

  // Create new campaign
  const { data: newCampaign, error } = await supabase
    .from("campaigns")
    .insert({
      name,
      start_date: startDate,
      status: "active",
    })
    .select("id")
    .single();

  if (error) {
    console.log(`  Failed to create campaign ${name}:`, error.message);
    return null;
  }

  console.log(`  Created new campaign: ${name}`);
  return newCampaign.id;
}

// Parse CSV (simple parser for this format)
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split("\n");
  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = values[idx]?.trim() || "";
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

async function importCSV(filePath: string) {
  console.log(`\nReading CSV from: ${filePath}\n`);

  const content = fs.readFileSync(filePath, "utf-8");
  // Remove BOM if present
  const cleanContent = content.replace(/^\uFEFF/, "");
  const rows = parseCSV(cleanContent);

  console.log(`Found ${rows.length} rows to import\n`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`\n--- Processing row ${i + 1}: ${row["Name"]} ---`);

    // Extract Instagram handle
    const igUrl = row["IG"] || row["Instagram Handle"];
    const handle = extractInstagramHandle(igUrl);

    if (!handle) {
      console.log(`  Skipping: Could not extract Instagram handle from "${igUrl}"`);
      continue;
    }

    console.log(`  Instagram handle: @${handle}`);

    // Check if influencer already exists
    const { data: existingInfluencer } = await supabase
      .from("influencers")
      .select("id")
      .ilike("instagram_handle", handle)
      .single();

    if (existingInfluencer) {
      console.log(`  Skipping: Influencer @${handle} already exists`);
      continue;
    }

    // Fetch Instagram profile
    console.log(`  Fetching Instagram profile...`);
    const igProfile = await fetchInstagramProfile(handle);

    // Add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let profilePhotoUrl: string | null = null;
    let followerCount = 0;
    let fullName = row["Name"];

    if (igProfile) {
      console.log(`  Found: ${igProfile.full_name} (${igProfile.follower_count} followers)`);
      followerCount = igProfile.follower_count || 0;
      fullName = igProfile.full_name || row["Name"];

      // Upload profile photo
      if (igProfile.profile_pic_url) {
        console.log(`  Uploading profile photo...`);
        profilePhotoUrl = await uploadProfilePhoto(igProfile.profile_pic_url, handle);
      }
    } else {
      console.log(`  Could not fetch Instagram profile, using CSV data`);
    }

    // Map partnership type
    const rawPartnershipType = (row["Partnership Type"] || "").toLowerCase().trim();
    const partnershipType = partnershipTypeMap[rawPartnershipType] || "unassigned";
    console.log(`  Partnership type: ${rawPartnershipType} -> ${partnershipType}`);

    // Get email
    const email = row["Email Address"] || row["Email"] || null;

    // Get mailing address
    const mailingAddress = row["Shipping Info"] || null;

    // Insert influencer
    const influencerData = {
      name: fullName,
      instagram_handle: handle,
      profile_photo_url: profilePhotoUrl,
      follower_count: followerCount,
      email: email || null,
      mailing_address: mailingAddress || null,
      partnership_type: partnershipType,
      tier: "C" as const,
      relationship_status: "prospect" as const,
      source: "other" as const, // Using 'other' since 'airtable_import' isn't in the enum
      notes: "Imported from Airtable CSV",
    };

    const { data: newInfluencer, error: insertError } = await supabase
      .from("influencers")
      .insert(influencerData)
      .select("id")
      .single();

    if (insertError) {
      console.log(`  ERROR inserting influencer:`, insertError.message);
      continue;
    }

    console.log(`  Created influencer: ${fullName} (ID: ${newInfluencer.id})`);

    // Parse campaigns and link
    const campaignStr = row["Campaign"] || "";
    const campaignCodes = campaignStr.split(",").map((c) => c.trim()).filter(Boolean);

    for (const code of campaignCodes) {
      // Skip non-date codes like "Import Test", "FW25"
      const parsed = parseCampaignCode(code);
      if (!parsed) {
        console.log(`  Skipping campaign code: ${code} (not a month code)`);
        continue;
      }

      const campaignId = await findOrCreateCampaign(parsed.name, parsed.startDate);
      if (!campaignId) continue;

      // Link influencer to campaign
      const { error: linkError } = await supabase
        .from("campaign_influencers")
        .insert({
          campaign_id: campaignId,
          influencer_id: newInfluencer.id,
          partnership_type: partnershipType,
          status: "prospect",
        });

      if (linkError) {
        console.log(`  ERROR linking to campaign ${parsed.name}:`, linkError.message);
      } else {
        console.log(`  Linked to campaign: ${parsed.name}`);
      }
    }
  }

  console.log("\n\n=== Import Complete ===\n");
}

// Run the import
const csvPath = process.argv[2] || "/Users/shanepetersen/Downloads/Campaigns 25'-Import Test.csv";
importCSV(csvPath).catch(console.error);

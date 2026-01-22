import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

// Initialize Supabase client with service role for admin access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const rapidApiKey = process.env.RAPIDAPI_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Partnership type mapping
const partnershipTypeMap: Record<string, string> = {
  "paid": "paid",
  "gifted (soft ask)": "gifted_soft_ask",
  "gifted (no ask)": "gifted_no_ask",
  "gifted no ask": "gifted_no_ask",
  "gifted (deliverable ask)": "gifted_deliverable_ask",
  "gifted (reccuring)": "gifted_recurring",
  "gifted recurring": "gifted_recurring",
  "gifted": "gifted_no_ask",
};

// Comms Status mapping to relationship status
// Order of progression: prospect -> contacted -> followed_up -> order_placed -> order_delivered -> posted
const commsStatusMap: Record<string, string> = {
  "delivered & done": "order_delivered",
  "order placed": "order_placed",
  "followed up": "followed_up",
  "contacted": "contacted",
  "lead dead": "lead_dead",
  "prospect": "prospect",
  "posted": "posted",
  "creator wants paid": "lead_dead",
  "pending": "prospect",
};

// Status progression order (higher index = later in process)
const statusOrder: Record<string, number> = {
  "prospect": 0,
  "contacted": 1,
  "followed_up": 2,
  "lead_dead": 3,
  "order_placed": 4,
  "order_delivered": 5,
  "order_follow_up_sent": 6,
  "order_follow_up_two_sent": 7,
  "posted": 8,
};

// Size normalization
const sizeMap: Record<string, string> = {
  "extra small": "XS",
  "xs": "XS",
  "small": "S",
  "s": "S",
  "medium": "M",
  "m": "M",
  "large": "L",
  "l": "L",
  "extra large": "XL",
  "xl": "XL",
};

function normalizeSize(size: string): string | null {
  if (!size) return null;
  const cleaned = size.toLowerCase().trim();
  return sizeMap[cleaned] || null;
}

// Extract Instagram handle from URL
function extractInstagramHandle(urlOrHandle: string): string | null {
  if (!urlOrHandle) return null;

  // If it's a post URL like /p/xxx/, try to extract username differently
  if (urlOrHandle.includes("/p/") || urlOrHandle.includes("/reel/")) {
    console.log(`  Skipping post URL (cannot extract handle): ${urlOrHandle}`);
    return null;
  }

  // Profile URL: https://www.instagram.com/username/ or https://www.instagram.com/username
  const profileMatch = urlOrHandle.match(/instagram\.com\/([a-zA-Z0-9._]+)\/?(?:\?|$)/);
  if (profileMatch) {
    return profileMatch[1].toLowerCase();
  }

  // Just a handle
  if (!urlOrHandle.includes("/")) {
    return urlOrHandle.replace("@", "").trim().toLowerCase();
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

// Parse campaign code like "OCT25" to date "2025-10-01"
function parseCampaignCode(code: string): { name: string; startDate: string } | null {
  const match = code.trim().match(/^([A-Z]{3})(\d{2})$/i);
  if (!match) return null;

  const monthMap: Record<string, number> = {
    JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
    JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  };

  const monthStr = match[1].toUpperCase();
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

// Parse CSV with proper quote handling
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
      row[header.trim().replace(/^\uFEFF/, "")] = values[idx]?.trim() || "";
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

// Map comms status to relationship status, picking the latest if multiple
function mapCommsStatus(rawStatus: string): string {
  if (!rawStatus) return "prospect";

  // Handle multiple statuses separated by comma or newline
  const statuses = rawStatus.split(/[,\n]/).map(s => s.trim().toLowerCase()).filter(Boolean);

  let latestStatus = "prospect";
  let latestOrder = -1;

  for (const status of statuses) {
    const mapped = commsStatusMap[status];
    if (mapped && statusOrder[mapped] !== undefined && statusOrder[mapped] > latestOrder) {
      latestStatus = mapped;
      latestOrder = statusOrder[mapped];
    }
  }

  return latestStatus;
}

async function importCSV(filePath: string) {
  console.log(`\nReading CSV from: ${filePath}\n`);

  const content = fs.readFileSync(filePath, "utf-8");
  // Remove BOM if present
  const cleanContent = content.replace(/^\uFEFF/, "");
  const rows = parseCSV(cleanContent);

  console.log(`Found ${rows.length} rows to process\n`);

  // Track stats
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let declined = 0;

  // For this import, use "October 2025" as campaign
  const campaignInfo = parseCampaignCode("OCT25");
  if (!campaignInfo) {
    console.error("Failed to parse campaign code OCT25");
    return;
  }
  const campaignId = await findOrCreateCampaign(campaignInfo.name, campaignInfo.startDate);
  if (!campaignId) {
    console.error("Failed to find or create campaign");
    return;
  }
  console.log(`Using campaign: ${campaignInfo.name} (ID: ${campaignId})\n`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row["Name"] || "";
    console.log(`\n--- Processing row ${i + 1}: ${name} ---`);

    // Check approval status - skip if declined
    const approvalStatus = (row["Approval Status"] || "").toLowerCase().trim();
    if (approvalStatus === "declined") {
      console.log(`  Skipping: Approval status is declined`);
      declined++;
      continue;
    }

    // Extract Instagram handle
    const igUrl = row["IG"] || row["Instagram Handle"] || "";
    const handle = extractInstagramHandle(igUrl);

    if (!handle) {
      console.log(`  Skipping: Could not extract Instagram handle from "${igUrl}"`);
      skipped++;
      continue;
    }

    console.log(`  Instagram handle: @${handle}`);

    // Check if influencer already exists
    const { data: existingInfluencer } = await supabase
      .from("influencers")
      .select("*")
      .ilike("instagram_handle", handle)
      .single();

    // Map partnership type
    const rawPartnershipType = (row["Partnership Type"] || "").toLowerCase().trim();
    const partnershipType = partnershipTypeMap[rawPartnershipType] || "unassigned";

    // Map comms status to relationship status
    const rawCommsStatus = row["Comms Status"] || "";
    const relationshipStatus = mapCommsStatus(rawCommsStatus);

    // Get sizes
    const topSize = normalizeSize(row["Top Size"] || "");
    const bottomSize = normalizeSize(row["Bottom Size"] || "");

    // Get email and other fields
    const email = row["Email Address"] || row["Email"] || null;
    const mailingAddress = row["Shipping Info"] || null;
    const phone = row["Phone Number"] || null;
    const notes = row["Notes"] || null;

    if (existingInfluencer) {
      console.log(`  Found existing influencer: ${existingInfluencer.name} (ID: ${existingInfluencer.id})`);

      // Update with any new info (only if fields were empty before)
      const updates: Record<string, any> = {};

      if (!existingInfluencer.email && email) updates.email = email;
      if (!existingInfluencer.mailing_address && mailingAddress) updates.mailing_address = mailingAddress;
      if (!existingInfluencer.phone && phone) updates.phone = phone;
      if (!existingInfluencer.top_size && topSize) updates.top_size = topSize;
      if (!existingInfluencer.bottoms_size && bottomSize) updates.bottoms_size = bottomSize;
      if (existingInfluencer.partnership_type === "unassigned" && partnershipType !== "unassigned") {
        updates.partnership_type = partnershipType;
      }
      // Update status if current is "earlier" in the process
      if (statusOrder[relationshipStatus] > statusOrder[existingInfluencer.relationship_status]) {
        updates.relationship_status = relationshipStatus;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from("influencers")
          .update(updates)
          .eq("id", existingInfluencer.id);

        if (updateError) {
          console.log(`  ERROR updating influencer:`, updateError.message);
        } else {
          console.log(`  Updated fields: ${Object.keys(updates).join(", ")}`);
        }
      } else {
        console.log(`  No new info to update`);
      }

      // Check if already in this campaign
      const { data: existingLink } = await supabase
        .from("campaign_influencers")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("influencer_id", existingInfluencer.id)
        .single();

      if (existingLink) {
        console.log(`  Already in campaign ${campaignInfo.name}`);
      } else {
        // Add to campaign
        const { error: linkError } = await supabase
          .from("campaign_influencers")
          .insert({
            campaign_id: campaignId,
            influencer_id: existingInfluencer.id,
            partnership_type: partnershipType,
            status: relationshipStatus,
            approval_status: approvalStatus === "pending" ? "pending" : (approvalStatus === "approved" ? "approved" : null),
          });

        if (linkError) {
          console.log(`  ERROR linking to campaign:`, linkError.message);
        } else {
          console.log(`  Added to campaign: ${campaignInfo.name}`);
        }
      }

      updated++;
      continue;
    }

    // New influencer - fetch Instagram profile
    console.log(`  Fetching Instagram profile...`);
    const igProfile = await fetchInstagramProfile(handle);

    // Add delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 1000));

    let profilePhotoUrl: string | null = null;
    let followerCount = 0;
    let fullName = name;

    if (igProfile) {
      console.log(`  Found: ${igProfile.full_name} (${igProfile.follower_count} followers)`);
      followerCount = igProfile.follower_count || 0;
      fullName = igProfile.full_name || name;

      // Upload profile photo
      if (igProfile.profile_pic_url) {
        console.log(`  Uploading profile photo...`);
        profilePhotoUrl = await uploadProfilePhoto(igProfile.profile_pic_url, handle);
      }
    } else {
      console.log(`  Could not fetch Instagram profile, using CSV data`);
    }

    // Insert influencer
    const influencerData: Record<string, any> = {
      name: fullName,
      instagram_handle: handle,
      profile_photo_url: profilePhotoUrl,
      follower_count: followerCount,
      email: email || null,
      phone: phone || null,
      mailing_address: mailingAddress || null,
      partnership_type: partnershipType,
      tier: "C",
      relationship_status: relationshipStatus,
      notes: notes ? `${notes}\n\nImported from Airtable CSV` : "Imported from Airtable CSV",
    };

    // Add sizes if present
    if (topSize) influencerData.top_size = topSize;
    if (bottomSize) influencerData.bottoms_size = bottomSize;

    const { data: newInfluencer, error: insertError } = await supabase
      .from("influencers")
      .insert(influencerData)
      .select("id")
      .single();

    if (insertError) {
      console.log(`  ERROR inserting influencer:`, insertError.message);
      skipped++;
      continue;
    }

    console.log(`  Created influencer: ${fullName} (ID: ${newInfluencer.id})`);
    created++;

    // Link to campaign
    const { error: linkError } = await supabase
      .from("campaign_influencers")
      .insert({
        campaign_id: campaignId,
        influencer_id: newInfluencer.id,
        partnership_type: partnershipType,
        status: relationshipStatus,
        approval_status: approvalStatus === "pending" ? "pending" : (approvalStatus === "approved" ? "approved" : null),
      });

    if (linkError) {
      console.log(`  ERROR linking to campaign:`, linkError.message);
    } else {
      console.log(`  Linked to campaign: ${campaignInfo.name}`);
    }
  }

  console.log("\n\n=== Import Complete ===");
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no handle): ${skipped}`);
  console.log(`Skipped (declined): ${declined}`);
  console.log(`Total processed: ${rows.length}\n`);
}

// Run the import
const csvPath = process.argv[2] || "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv";
importCSV(csvPath).catch(console.error);

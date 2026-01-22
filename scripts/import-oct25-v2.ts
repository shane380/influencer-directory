import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

// Initialize Supabase client
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

// Comms Status mapping
const commsStatusMap: Record<string, string> = {
  "delivered & done": "order_delivered",
  "order placed": "order_placed",
  "place order": "order_placed",
  "followed up": "followed_up",
  "contacted": "contacted",
  "lead dead": "lead_dead",
  "prospect": "prospect",
  "posted": "posted",
  "creator wants paid": "lead_dead",
  "pending": "prospect",
};

// Status progression order
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

// Extract Instagram handle from URL - returns null for post URLs
function extractInstagramHandle(urlOrHandle: string): string | null {
  if (!urlOrHandle || typeof urlOrHandle !== 'string') return null;

  const trimmed = urlOrHandle.trim();
  if (!trimmed) return null;

  // Skip post/reel URLs - can't extract username from these
  if (trimmed.includes("/p/") || trimmed.includes("/reel/") || trimmed.includes("/reels/")) {
    return null; // Return null, don't log - we'll track these separately
  }

  // Profile URL: https://www.instagram.com/username/ or https://www.instagram.com/username
  const profileMatch = trimmed.match(/instagram\.com\/([a-zA-Z0-9._]+)\/?(?:\?|$)/);
  if (profileMatch) {
    const handle = profileMatch[1].toLowerCase();
    // Filter out non-username paths
    if (!['p', 'reel', 'reels', 'stories', 'explore', 'direct', 'accounts'].includes(handle)) {
      return handle;
    }
  }

  // Just a handle (no URL)
  if (!trimmed.includes("/") && !trimmed.includes(".com")) {
    return trimmed.replace("@", "").toLowerCase().trim();
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

// Find or create campaign
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
  console.log(`Created campaign: ${name}`);
  return newCampaign.id;
}

// Map comms status - pick latest if multiple
function mapCommsStatus(rawStatus: string): string {
  if (!rawStatus) return "prospect";

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

interface ImportStats {
  created: number;
  updated: number;
  skippedNoHandle: number;
  skippedPostUrl: number;
  skippedDeclined: number;
  errors: string[];
}

async function importCSV(filePath: string) {
  console.log(`\nReading CSV: ${filePath}\n`);

  const content = fs.readFileSync(filePath, "utf-8");

  // Parse with PapaParse - handles quoted fields with newlines
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""), // Remove BOM
  });

  if (parsed.errors.length > 0) {
    console.log("Parse warnings:", parsed.errors.slice(0, 5));
  }

  const rows = parsed.data as Record<string, string>[];
  console.log(`Parsed ${rows.length} rows\n`);

  // Get or create October 2025 campaign
  const campaignId = await findOrCreateCampaign("October 2025", "2025-10-01");
  if (!campaignId) {
    console.error("Failed to get campaign");
    return;
  }

  const stats: ImportStats = {
    created: 0,
    updated: 0,
    skippedNoHandle: 0,
    skippedPostUrl: 0,
    skippedDeclined: 0,
    errors: [],
  };

  // Track processed handles to avoid duplicates within this import
  const processedHandles = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = (row["Name"] || "").trim();

    if (!name) continue;

    // Check approval status
    const approvalStatus = (row["Approval Status"] || "").toLowerCase().trim();
    if (approvalStatus === "declined") {
      stats.skippedDeclined++;
      continue;
    }

    // Get IG URL/handle
    const igValue = row["IG"] || row["Instagram Handle"] || "";

    // Check if it's a post URL
    if (igValue.includes("/p/") || igValue.includes("/reel/")) {
      stats.skippedPostUrl++;
      continue;
    }

    const handle = extractInstagramHandle(igValue);
    if (!handle) {
      stats.skippedNoHandle++;
      continue;
    }

    // Skip if already processed in this import
    if (processedHandles.has(handle)) {
      continue;
    }
    processedHandles.add(handle);

    console.log(`[${i + 1}/${rows.length}] ${name} (@${handle})`);

    // Get field values
    const rawPartnershipType = (row["Partnership Type"] || "").toLowerCase().trim();
    const partnershipType = partnershipTypeMap[rawPartnershipType] || "unassigned";
    const relationshipStatus = mapCommsStatus(row["Comms Status"] || "");
    const topSize = normalizeSize(row["Top Size"] || "");
    const bottomSize = normalizeSize(row["Bottom Size"] || "");
    const email = row["Email Address"] || row["Email"] || null;
    const mailingAddress = row["Shipping Info"] || null;
    const phone = row["Phone Number"] || null;
    const notes = row["Notes"] || null;

    // Check if influencer exists
    const { data: existing } = await supabase
      .from("influencers")
      .select("*")
      .ilike("instagram_handle", handle)
      .single();

    if (existing) {
      // Update existing with any new info
      const updates: Record<string, any> = {};
      if (!existing.email && email) updates.email = email;
      if (!existing.mailing_address && mailingAddress) updates.mailing_address = mailingAddress;
      if (!existing.phone && phone) updates.phone = phone;
      if (!existing.top_size && topSize) updates.top_size = topSize;
      if (!existing.bottoms_size && bottomSize) updates.bottoms_size = bottomSize;
      if (existing.partnership_type === "unassigned" && partnershipType !== "unassigned") {
        updates.partnership_type = partnershipType;
      }
      if (statusOrder[relationshipStatus] > statusOrder[existing.relationship_status]) {
        updates.relationship_status = relationshipStatus;
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from("influencers").update(updates).eq("id", existing.id);
        console.log(`  Updated: ${Object.keys(updates).join(", ")}`);
      }

      // Check campaign link
      const { data: existingLink } = await supabase
        .from("campaign_influencers")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("influencer_id", existing.id)
        .single();

      if (!existingLink) {
        await supabase.from("campaign_influencers").insert({
          campaign_id: campaignId,
          influencer_id: existing.id,
          partnership_type: partnershipType,
          status: relationshipStatus,
          approval_status: approvalStatus === "pending" ? "pending" : (approvalStatus === "approved" ? "approved" : null),
        });
        console.log(`  Added to campaign`);
      }

      stats.updated++;
      continue;
    }

    // New influencer - fetch Instagram
    const igProfile = await fetchInstagramProfile(handle);
    await new Promise(r => setTimeout(r, 800)); // Rate limit

    let profilePhotoUrl: string | null = null;
    let followerCount = 0;
    let fullName = name;

    if (igProfile) {
      followerCount = igProfile.follower_count || 0;
      fullName = igProfile.full_name || name;
      if (igProfile.profile_pic_url) {
        profilePhotoUrl = await uploadProfilePhoto(igProfile.profile_pic_url, handle);
      }
      console.log(`  IG: ${fullName} (${followerCount} followers)`);
    } else {
      console.log(`  IG not found, using CSV data`);
    }

    // Insert influencer
    const { data: newInfluencer, error: insertError } = await supabase
      .from("influencers")
      .insert({
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
        top_size: topSize,
        bottoms_size: bottomSize,
        notes: notes ? `${notes}\n\nImported from Airtable` : "Imported from Airtable",
      })
      .select("id")
      .single();

    if (insertError) {
      stats.errors.push(`${name}: ${insertError.message}`);
      continue;
    }

    // Link to campaign
    await supabase.from("campaign_influencers").insert({
      campaign_id: campaignId,
      influencer_id: newInfluencer.id,
      partnership_type: partnershipType,
      status: relationshipStatus,
      approval_status: approvalStatus === "pending" ? "pending" : (approvalStatus === "approved" ? "approved" : null),
    });

    console.log(`  Created (ID: ${newInfluencer.id})`);
    stats.created++;
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("IMPORT SUMMARY");
  console.log("=".repeat(50));
  console.log(`New profiles created:     ${stats.created}`);
  console.log(`Existing profiles updated: ${stats.updated}`);
  console.log(`Skipped (post URLs):       ${stats.skippedPostUrl}`);
  console.log(`Skipped (no handle):       ${stats.skippedNoHandle}`);
  console.log(`Skipped (declined):        ${stats.skippedDeclined}`);
  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`);
    stats.errors.slice(0, 10).forEach(e => console.log(`  - ${e}`));
  }
  console.log("=".repeat(50));
}

const csvPath = process.argv[2] || "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv";
importCSV(csvPath).catch(console.error);

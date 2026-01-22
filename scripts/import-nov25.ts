import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const rapidApiKey = process.env.RAPIDAPI_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Stats
const stats = {
  total: 0,
  newProfiles: 0,
  updatedProfiles: 0,
  skippedPostUrls: 0,
  skippedNoHandle: 0,
  campaignAssociations: 0,
  errors: [] as string[],
};

// Map partnership types
function mapPartnershipType(value: string): string {
  const map: Record<string, string> = {
    paid: "paid",
    gifted: "gifted_no_ask",
    "gifted - no ask": "gifted_no_ask",
    "gifted - soft ask": "gifted_soft_ask",
    "gifted - deliverable ask": "gifted_deliverable_ask",
    "gifted - recurring": "gifted_recurring",
  };
  return map[value.toLowerCase().trim()] || "unassigned";
}

// Map relationship status
function mapRelationshipStatus(value: string): string {
  const statusMap: Record<string, string> = {
    prospect: "prospect",
    contacted: "contacted",
    "followed up": "followed_up",
    "lead dead": "lead_dead",
    "order placed": "order_placed",
    "order delivered": "order_delivered",
    "delivered & done": "order_delivered",
    "order follow up sent": "order_follow_up_sent",
    "order follow up two sent": "order_follow_up_two_sent",
    posted: "posted",
    "campaign closed": "posted",
  };

  // Handle comma-separated statuses - take the most advanced one
  const statuses = value.split(",").map((s) => s.trim().toLowerCase());
  const priority = [
    "posted",
    "campaign closed",
    "order follow up two sent",
    "order follow up sent",
    "order delivered",
    "delivered & done",
    "order placed",
    "lead dead",
    "followed up",
    "contacted",
    "prospect",
  ];

  for (const p of priority) {
    if (statuses.includes(p)) {
      return statusMap[p] || "prospect";
    }
  }
  return "prospect";
}

// Map approval status
function mapApprovalStatus(value: string): string | null {
  const map: Record<string, string> = {
    approved: "approved",
    pending: "pending",
    declined: "declined",
  };
  return map[value.toLowerCase().trim()] || null;
}

// Map clothing size
function mapClothingSize(value: string): string | null {
  const size = value.toUpperCase().trim();
  if (["XS", "S", "M", "L", "XL"].includes(size)) {
    return size;
  }
  return null;
}

// Extract handle from Instagram URL or value
function extractHandle(igValue: string): { handle: string | null; isPostUrl: boolean } {
  const value = igValue.trim();
  if (!value) return { handle: null, isPostUrl: false };

  // Check if it's a post/reel URL
  if (value.includes("/p/") || value.includes("/reel/") || value.includes("/reels/")) {
    return { handle: null, isPostUrl: true };
  }

  // Try to extract from profile URL
  const profileMatch = value.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
  if (profileMatch) {
    return { handle: profileMatch[1].toLowerCase(), isPostUrl: false };
  }

  // It might already be a handle
  if (value.startsWith("@")) {
    return { handle: value.slice(1).toLowerCase(), isPostUrl: false };
  }

  // Assume it's a handle if it looks like one (no spaces, no special chars except . and _)
  if (/^[a-zA-Z0-9._]+$/.test(value)) {
    return { handle: value.toLowerCase(), isPostUrl: false };
  }

  return { handle: null, isPostUrl: false };
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

// Get or create campaign
async function getOrCreateCampaign(campaignName: string): Promise<string | null> {
  const name = campaignName.trim();
  if (!name) return null;

  // Try to find existing
  const { data: existing } = await supabase
    .from("campaigns")
    .select("id")
    .ilike("name", name)
    .single();

  if (existing) return existing.id;

  // Create new campaign
  const { data: newCampaign, error } = await supabase
    .from("campaigns")
    .insert({ name, status: "planning" })
    .select("id")
    .single();

  if (error) {
    console.log(`  Could not create campaign "${name}": ${error.message}`);
    return null;
  }

  console.log(`  Created new campaign: ${name}`);
  return newCampaign.id;
}

// Main import function
async function main() {
  const csvPath = "/Users/shanepetersen/Downloads/Campaigns 25'-NOV25.csv";

  console.log("Reading CSV with PapaParse...\n");
  const content = fs.readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  const rows = parsed.data as Record<string, string>[];
  stats.total = rows.length;
  console.log(`Found ${rows.length} rows\n`);

  // Track post URLs for later
  const postUrlsForLater: { name: string; postUrl: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = (row["Name"] || "").trim();
    const igValue = row["IG"] || row["Instagram Handle"] || "";
    const campaigns = (row["Campaign"] || "").split(",").map((c) => c.trim()).filter(Boolean);

    if (!name) {
      stats.skippedNoHandle++;
      continue;
    }

    console.log(`[${i + 1}/${rows.length}] ${name}`);

    // Extract handle
    const { handle, isPostUrl } = extractHandle(igValue);

    if (isPostUrl) {
      console.log(`  Skipped - post URL (needs manual lookup)`);
      postUrlsForLater.push({ name, postUrl: igValue.trim().split(/\s+/)[0] });
      stats.skippedPostUrls++;
      continue;
    }

    if (!handle) {
      console.log(`  Skipped - no handle found`);
      stats.skippedNoHandle++;
      continue;
    }

    console.log(`  Handle: @${handle}`);

    // Check if influencer exists
    const { data: existing } = await supabase
      .from("influencers")
      .select("id, name, instagram_handle, follower_count, profile_photo_url")
      .ilike("instagram_handle", handle)
      .single();

    let influencerId: string;
    const partnershipType = mapPartnershipType(row["Partnership Type"] || "");
    const relationshipStatus = mapRelationshipStatus(row["Comms Status"] || "");
    const approvalStatus = mapApprovalStatus(row["Approval Status"] || "");
    const topSize = mapClothingSize(row["Top Size"] || "");
    const bottomsSize = mapClothingSize(row["Bottom Size"] || "");
    const email = (row["Email"] || row["Email Address"] || "").trim() || null;
    const phone = (row["Phone Number"] || "").trim() || null;
    const mailingAddress = (row["Shipping Info"] || "").trim() || null;
    const notes = (row["Notes"] || "").trim() || null;

    if (existing) {
      influencerId = existing.id;
      console.log(`  Exists: ${existing.name}`);

      // Update with new data if provided
      const updates: Record<string, any> = {};
      if (topSize && !existing.profile_photo_url) updates.top_size = topSize;
      if (bottomsSize) updates.bottoms_size = bottomsSize;
      if (email) updates.email = email;
      if (phone) updates.phone = phone;
      if (mailingAddress) updates.mailing_address = mailingAddress;
      if (partnershipType !== "unassigned") updates.partnership_type = partnershipType;

      if (Object.keys(updates).length > 0) {
        await supabase.from("influencers").update(updates).eq("id", influencerId);
        console.log(`  Updated: ${Object.keys(updates).join(", ")}`);
        stats.updatedProfiles++;
      }
    } else {
      // Fetch Instagram profile for new influencers
      let profilePhotoUrl: string | null = null;
      let followerCount = 0;
      let fullName = name;

      const profile = await fetchInstagramProfile(handle);
      await new Promise((r) => setTimeout(r, 1000));

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
          email,
          phone,
          mailing_address: mailingAddress,
          partnership_type: partnershipType,
          tier: "C",
          relationship_status: relationshipStatus,
          top_size: topSize,
          bottoms_size: bottomsSize,
          notes: notes ? `${notes}\nImported from NOV25 CSV` : "Imported from NOV25 CSV",
        })
        .select("id")
        .single();

      if (error) {
        console.log(`  Error creating: ${error.message}`);
        stats.errors.push(`${name}: ${error.message}`);
        continue;
      }

      influencerId = newInfluencer.id;
      console.log(`  Created (ID: ${influencerId})`);
      stats.newProfiles++;
    }

    // Add to campaigns
    for (const campaignName of campaigns) {
      const campaignId = await getOrCreateCampaign(campaignName);
      if (!campaignId) continue;

      // Check if already in campaign
      const { data: existingLink } = await supabase
        .from("campaign_influencers")
        .select("id")
        .eq("campaign_id", campaignId)
        .eq("influencer_id", influencerId)
        .single();

      if (!existingLink) {
        const { error: linkError } = await supabase.from("campaign_influencers").insert({
          campaign_id: campaignId,
          influencer_id: influencerId,
          partnership_type: partnershipType,
          status: relationshipStatus,
          approval_status: approvalStatus,
          notes,
          content_posted: "none",
        });

        if (linkError) {
          console.log(`  Error adding to ${campaignName}: ${linkError.message}`);
        } else {
          console.log(`  Added to campaign: ${campaignName}`);
          stats.campaignAssociations++;
        }
      } else {
        console.log(`  Already in campaign: ${campaignName}`);
      }
    }
  }

  // Save post URLs for later lookup
  if (postUrlsForLater.length > 0) {
    const outputPath = "/Users/shanepetersen/Downloads/nov25-post-urls.txt";
    fs.writeFileSync(outputPath, postUrlsForLater.map((p) => p.postUrl).join("\n"));
    console.log(`\nSaved ${postUrlsForLater.length} post URLs to ${outputPath}`);
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("IMPORT SUMMARY");
  console.log("=".repeat(50));
  console.log(`Total rows:              ${stats.total}`);
  console.log(`New profiles created:    ${stats.newProfiles}`);
  console.log(`Existing profiles updated: ${stats.updatedProfiles}`);
  console.log(`Campaign associations:   ${stats.campaignAssociations}`);
  console.log(`Skipped (post URLs):     ${stats.skippedPostUrls}`);
  console.log(`Skipped (no handle):     ${stats.skippedNoHandle}`);
  console.log(`Errors:                  ${stats.errors.length}`);
  if (stats.errors.length > 0) {
    console.log("\nErrors:");
    stats.errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log("=".repeat(50));
}

main().catch(console.error);

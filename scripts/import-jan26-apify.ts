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
  campaignAssociations: 0,
  notInApify: [] as string[],
  errors: [] as string[],
};

// Read the original CSV to get name->data mapping
async function loadOriginalData(): Promise<Map<string, Record<string, string>>> {
  const csvPath = "/Users/shanepetersen/Downloads/Campaigns 25'-JAN26 (1).csv";
  const content = fs.readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  const map = new Map<string, Record<string, string>>();
  for (const row of parsed.data as Record<string, string>[]) {
    const name = (row["Name"] || "").trim();
    if (name) {
      map.set(name.toLowerCase(), row);
    }
  }
  return map;
}

// Read post URLs file to get name->url mapping
function loadPostUrls(): Map<string, string> {
  const content = fs.readFileSync("/Users/shanepetersen/Downloads/jan26-post-urls.txt", "utf-8");
  const map = new Map<string, string>();
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    const [name, url] = line.split("\t");
    if (name && url) {
      map.set(name.toLowerCase().trim(), url.trim());
    }
  }
  return map;
}

// Extract shortcode from URL for matching
function getShortcode(url: string): string {
  const match = url.match(/\/p\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : "";
}

// Map partnership types
function mapPartnershipType(value: string): string {
  const v = value.toLowerCase().trim();
  if (v === "paid") return "paid";
  if (v === "gifted (reccuring)" || v === "gifted (recurring)" || v.includes("recurring")) return "gifted_recurring";
  if (v === "gifted no ask" || v === "gifted (no ask)" || v.includes("no ask")) return "gifted_no_ask";
  if (v === "gifted (soft ask)" || v.includes("soft ask")) return "gifted_soft_ask";
  if (v === "gifted (deliverable ask)" || v.includes("deliverable")) return "gifted_deliverable_ask";
  if (v === "gifted") return "gifted_no_ask";
  return "unassigned";
}

// Map relationship status
function mapRelationshipStatus(value: string): string {
  const statusMap: Record<string, string> = {
    prospect: "prospect",
    contacted: "contacted",
    email: "contacted",
    "followed up": "followed_up",
    "awaiting response": "contacted",
    "response received": "contacted",
    "lead dead": "lead_dead",
    "creator wants paid": "creator_wants_paid",
    "order placed": "order_placed",
    "order delivered": "order_delivered",
    "delivered & done": "order_delivered",
    "order follow up sent": "order_follow_up_sent",
    "order follow up two sent": "order_follow_up_two_sent",
    posted: "posted",
    "campaign closed": "posted",
  };

  const statuses = value.split(",").map((s) => s.trim().toLowerCase());
  const priority = [
    "posted", "campaign closed", "order follow up two sent", "order follow up sent",
    "order delivered", "delivered & done", "order placed", "creator wants paid",
    "lead dead", "followed up", "response received", "awaiting response", "contacted", "email", "prospect",
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
  if (["XS", "S", "M", "L", "XL"].includes(size)) return size;
  if (size === "EXTRA SMALL") return "XS";
  if (size === "SMALL") return "S";
  if (size === "MEDIUM") return "M";
  if (size === "LARGE") return "L";
  if (size === "EXTRA LARGE") return "XL";
  return null;
}

// Map Collection value to campaign name
function getCampaignName(collection: string): string {
  const col = collection.trim().toLowerCase();
  if (col === "body butter") return "JAN26 - Body Butter";
  if (col === "pinstripe") return "JAN26 - Pinstripe";
  return "JAN26 - Uncategorized";
}

// Fetch Instagram profile for extra data
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

// Get campaign IDs
async function getCampaignIds(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  const campaignNames = ["JAN26 - Body Butter", "JAN26 - Pinstripe", "JAN26 - Uncategorized"];

  for (const name of campaignNames) {
    const { data } = await supabase.from("campaigns").select("id").eq("name", name).single();
    if (data) {
      ids[name] = data.id;
    }
  }
  return ids;
}

async function main() {
  const apifyCsvPath = "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-23_02-21-16-841.csv";

  console.log("Loading original data...");
  const originalData = await loadOriginalData();
  const postUrls = loadPostUrls();
  const campaignIds = await getCampaignIds();

  console.log(`Loaded ${originalData.size} original entries`);
  console.log(`Loaded ${postUrls.size} post URLs`);
  console.log(`Campaign IDs: ${JSON.stringify(campaignIds)}\n`);

  // Read Apify CSV
  console.log("Reading Apify CSV...\n");
  const content = fs.readFileSync(apifyCsvPath, "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  const apifyRows = parsed.data as Record<string, string>[];
  console.log(`Found ${apifyRows.length} Apify rows\n`);

  // Build shortcode->apify data map
  const apifyByShortcode = new Map<string, Record<string, string>>();
  for (const row of apifyRows) {
    const inputUrl = row["inputUrl"] || "";
    const shortcode = getShortcode(inputUrl);
    if (shortcode) {
      apifyByShortcode.set(shortcode, row);
    }
  }

  // Process each post URL
  for (const [name, url] of postUrls) {
    stats.total++;
    const shortcode = getShortcode(url);
    const apifyData = apifyByShortcode.get(shortcode);

    console.log(`[${stats.total}] ${name}`);

    if (!apifyData) {
      console.log(`  Not found in Apify data (shortcode: ${shortcode})`);
      stats.notInApify.push(name);
      continue;
    }

    const ownerUsername = apifyData["ownerUsername"]?.toLowerCase();
    const ownerFullName = apifyData["ownerFullName"] || name;

    if (!ownerUsername) {
      console.log(`  No username in Apify data`);
      stats.notInApify.push(name);
      continue;
    }

    console.log(`  Handle: @${ownerUsername} (${ownerFullName})`);

    // Get original row data for this influencer
    const originalRow = originalData.get(name);
    if (!originalRow) {
      console.log(`  Warning: No original data found for ${name}`);
    }

    const partnershipTypeRaw = originalRow?.["Partnership Type"] || "";
    const collection = originalRow?.["Collection"] || "";
    const partnershipType = mapPartnershipType(partnershipTypeRaw);
    const relationshipStatus = mapRelationshipStatus(originalRow?.["Comms Status"] || "");
    const approvalStatus = mapApprovalStatus(originalRow?.["Approval Status"] || "");
    const topSize = mapClothingSize(originalRow?.["Top Size"] || "");
    const bottomsSize = mapClothingSize(originalRow?.["Bottom Size"] || "");
    const email = (originalRow?.["Email"] || originalRow?.["Email Address"] || "").trim() || null;
    const phone = (originalRow?.["Phone Number"] || "").trim() || null;
    const mailingAddress = (originalRow?.["Shipping Info"] || "").trim() || null;
    const notes = (originalRow?.["Notes"] || "").trim() || null;

    // Check if influencer exists
    const { data: existing } = await supabase
      .from("influencers")
      .select("id, name, instagram_handle")
      .ilike("instagram_handle", ownerUsername)
      .single();

    let influencerId: string;

    if (existing) {
      influencerId = existing.id;
      console.log(`  Exists: ${existing.name}`);

      // Update with new data if provided
      const updates: Record<string, any> = {};
      if (topSize) updates.top_size = topSize;
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
      // Fetch Instagram profile for new influencer
      let profilePhotoUrl: string | null = null;
      let followerCount = 0;
      let fullName = ownerFullName;

      const profile = await fetchInstagramProfile(ownerUsername);
      await new Promise((r) => setTimeout(r, 1000));

      if (profile) {
        followerCount = profile.follower_count || 0;
        fullName = profile.full_name || ownerFullName;
        if (profile.profile_pic_url) {
          profilePhotoUrl = await uploadProfilePhoto(profile.profile_pic_url, ownerUsername);
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
          instagram_handle: ownerUsername,
          profile_photo_url: profilePhotoUrl,
          follower_count: followerCount,
          email,
          phone,
          mailing_address: mailingAddress,
          partnership_type: partnershipType,
          tier: "B",
          relationship_status: relationshipStatus,
          top_size: topSize,
          bottoms_size: bottomsSize,
          notes: notes ? `${notes}\nImported from JAN26 CSV (Apify)` : "Imported from JAN26 CSV (Apify)",
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

    // Add to campaign
    const campaignName = getCampaignName(collection);
    const campaignId = campaignIds[campaignName];

    if (!campaignId) {
      console.log(`  Campaign not found: ${campaignName}`);
      continue;
    }

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
        console.log(`  Error adding to campaign: ${linkError.message}`);
      } else {
        console.log(`  Added to ${campaignName}`);
        stats.campaignAssociations++;
      }
    } else {
      console.log(`  Already in ${campaignName}`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("IMPORT SUMMARY");
  console.log("=".repeat(50));
  console.log(`Total processed:         ${stats.total}`);
  console.log(`New profiles created:    ${stats.newProfiles}`);
  console.log(`Existing profiles updated: ${stats.updatedProfiles}`);
  console.log(`Campaign associations:   ${stats.campaignAssociations}`);
  console.log(`Not in Apify:            ${stats.notInApify.length}`);
  console.log(`Errors:                  ${stats.errors.length}`);

  if (stats.notInApify.length > 0) {
    console.log("\nNot found in Apify data:");
    stats.notInApify.forEach((n) => console.log(`  - ${n}`));
  }

  if (stats.errors.length > 0) {
    console.log("\nErrors:");
    stats.errors.forEach((e) => console.log(`  - ${e}`));
  }
  console.log("=".repeat(50));
}

main().catch(console.error);

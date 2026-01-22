import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const rapidApiKey = process.env.RAPIDAPI_KEY!;

function mapPartnershipType(value: string): string {
  const v = value.toLowerCase().trim();
  if (v === "paid") return "paid";
  if (v.includes("recurring")) return "gifted_recurring";
  if (v.includes("no ask")) return "gifted_no_ask";
  if (v.includes("soft ask")) return "gifted_soft_ask";
  if (v.includes("deliverable")) return "gifted_deliverable_ask";
  if (v === "gifted") return "gifted_no_ask";
  return "unassigned";
}

function mapRelationshipStatus(value: string): string {
  const statusMap: Record<string, string> = {
    prospect: "prospect",
    contacted: "contacted",
    "followed up": "followed_up",
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
    "lead dead", "followed up", "contacted", "prospect",
  ];

  for (const p of priority) {
    if (statuses.includes(p)) return statusMap[p] || "prospect";
  }
  return "prospect";
}

function mapClothingSize(value: string): string | null {
  const v = value.toLowerCase().trim();
  if (v === "xxs" || v === "extra small" || v === "xsmall" || v === "xs") return "XS";
  if (v === "small" || v === "s") return "S";
  if (v === "medium" || v === "m") return "M";
  if (v === "large" || v === "l") return "L";
  if (v === "xl" || v === "extra large" || v === "xlarge") return "XL";
  return null;
}

function loadApifyData(): Map<string, string> {
  const urlToHandle = new Map<string, string>();
  const apifyFiles = [
    "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_03-01-54-059.csv",
    "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_03-42-58-827.csv",
    "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_04-38-55-144.csv",
    "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_04-47-58-775.csv",
  ];

  for (const path of apifyFiles) {
    try {
      const content = fs.readFileSync(path, "utf-8");
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      for (const row of parsed.data as Record<string, string>[]) {
        const inputUrl = (row["inputUrl"] || "").trim();
        const ownerUsername = (row["ownerUsername"] || "").trim().toLowerCase();
        if (inputUrl && ownerUsername) {
          const normalizedUrl = inputUrl.split("?")[0].replace(/\/$/, "");
          urlToHandle.set(normalizedUrl, ownerUsername);
        }
      }
    } catch {}
  }
  return urlToHandle;
}

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

async function processCSV(
  csvPath: string,
  campaignId: string,
  campaignName: string,
  urlToHandle: Map<string, string>
) {
  const content = fs.readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  // Get handles already in campaign
  const { data: dbInfluencers } = await supabase
    .from("campaign_influencers")
    .select("influencer:influencers(instagram_handle)")
    .eq("campaign_id", campaignId);

  const dbHandles = new Set(
    dbInfluencers?.map((i) => i.influencer?.instagram_handle?.toLowerCase()).filter(Boolean)
  );

  let created = 0;
  let added = 0;

  for (const row of parsed.data as Record<string, string>[]) {
    const name = (row["Name"] || "").trim();
    const igValue = (row["IG"] || "").trim();
    const partnershipTypeRaw = (row["Partnership Type"] || "").trim();

    if (!name) continue;
    if (partnershipTypeRaw.toLowerCase() === "instructor") continue;
    if (!igValue.includes("/p/") && !igValue.includes("/reel/")) continue;

    const postUrl = igValue.split(/\s+/)[0].split("?")[0].replace(/\/$/, "");
    const handle = urlToHandle.get(postUrl);
    if (!handle) continue;
    if (dbHandles.has(handle)) continue;

    console.log(`${campaignName}: ${name} -> @${handle}`);

    // Check if influencer exists
    const { data: existing } = await supabase
      .from("influencers")
      .select("id, name")
      .ilike("instagram_handle", handle)
      .single();

    let influencerId: string;
    const partnershipType = mapPartnershipType(partnershipTypeRaw);
    const relationshipStatus = mapRelationshipStatus(row["Comms Status"] || "");
    const topSize = mapClothingSize(row["Top Size"] || "");
    const bottomsSize = mapClothingSize(row["Bottom Size"] || "");
    const notes = (row["Notes"] || "").trim() || null;

    if (existing) {
      influencerId = existing.id;
      console.log(`  Exists: ${existing.name}`);
    } else {
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
      }

      const { data: newInfluencer, error } = await supabase
        .from("influencers")
        .insert({
          name: fullName,
          instagram_handle: handle,
          profile_photo_url: profilePhotoUrl,
          follower_count: followerCount,
          partnership_type: partnershipType,
          tier: "B",
          relationship_status: relationshipStatus,
          top_size: topSize,
          bottoms_size: bottomsSize,
          notes: notes ? `${notes}\nImported via Apify` : "Imported via Apify",
        })
        .select("id")
        .single();

      if (error) {
        console.log(`  Error creating: ${error.message}`);
        continue;
      }

      influencerId = newInfluencer.id;
      console.log(`  Created (ID: ${influencerId})`);
      created++;
    }

    // Add to campaign
    const { error: linkError } = await supabase.from("campaign_influencers").insert({
      campaign_id: campaignId,
      influencer_id: influencerId,
      partnership_type: partnershipType,
      status: relationshipStatus,
      notes,
      content_posted: "none",
    });

    if (!linkError) {
      console.log(`  Added to ${campaignName}`);
      added++;
      dbHandles.add(handle);
    }
  }

  return { created, added };
}

async function main() {
  console.log("Loading Apify data...");
  const urlToHandle = loadApifyData();
  console.log(`Loaded ${urlToHandle.size} URL -> handle mappings\n`);

  const campaigns = [
    { id: "b0397715-54da-48b3-976f-09d6bdf13ad4", path: "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv", name: "October 2025" },
    { id: "e7c4e86d-fe55-470a-91f5-27c802cbb2d5", path: "/Users/shanepetersen/Downloads/Campaigns 25'-NOV25.csv", name: "November 2025" },
    { id: "a63fcee5-2289-45ea-865e-1c61cd7dc5a8", path: "/Users/shanepetersen/Downloads/Campaigns 25'-DEC25.csv", name: "December 2025" },
  ];

  let totalCreated = 0;
  let totalAdded = 0;

  for (const c of campaigns) {
    const result = await processCSV(c.path, c.id, c.name, urlToHandle);
    totalCreated += result.created;
    totalAdded += result.added;
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Total created: ${totalCreated}`);
  console.log(`Total added to campaigns: ${totalAdded}`);
  console.log("=".repeat(50));
}

main().catch(console.error);

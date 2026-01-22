import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Map content status from CSV to database value
// CSV values: "Stories", "Stories,In Feed Post", "Stories,Reel"
// DB values: 'none' | 'stories' | 'in_feed_post' | 'reel' | 'tiktok'
function mapContentStatus(value: string): string {
  const v = value.toLowerCase();

  // If multiple types, pick the "best" one (reel > in_feed_post > stories)
  if (v.includes("reel")) return "reel";
  if (v.includes("in feed post") || v.includes("in_feed_post")) return "in_feed_post";
  if (v.includes("stories") || v.includes("story")) return "stories";
  if (v.includes("tiktok")) return "tiktok";

  return "none";
}

function extractHandle(igValue: string): string | null {
  const value = igValue.trim();
  if (!value) return null;
  if (value.includes("/p/") || value.includes("/reel/") || value.includes("/reels/")) return null;

  const profileMatch = value.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
  if (profileMatch) return profileMatch[1].toLowerCase();
  if (value.startsWith("@")) return value.slice(1).toLowerCase();
  if (/^[a-zA-Z0-9._]+$/.test(value)) return value.toLowerCase();
  return null;
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

async function main() {
  const october2025Id = "b0397715-54da-48b3-976f-09d6bdf13ad4";
  const november2025Id = "e7c4e86d-fe55-470a-91f5-27c802cbb2d5";

  // Load Apify data for post URL lookups
  console.log("Loading Apify data...");
  const urlToHandle = new Map<string, string>();
  const apifyFiles = [
    "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_03-01-54-059.csv",
    "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_03-42-58-827.csv",
  ];
  for (const path of apifyFiles) {
    try {
      const map = getUrlToHandleMap(path);
      for (const [url, handle] of map) {
        urlToHandle.set(url, handle);
      }
    } catch (e) {
      // File might not exist
    }
  }
  console.log(`Loaded ${urlToHandle.size} URL -> handle mappings\n`);

  // Process both CSVs
  const files = [
    { path: "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv", campaignId: october2025Id, name: "OCT25" },
    { path: "/Users/shanepetersen/Downloads/Campaigns 25'-NOV25.csv", campaignId: november2025Id, name: "NOV25" },
  ];

  let updated = 0;
  let notFound = 0;

  for (const { path, campaignId, name } of files) {
    const content = fs.readFileSync(path, "utf-8");
    const parsed = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
    });

    console.log(`Processing ${name}...`);

    for (const row of parsed.data as Record<string, string>[]) {
      const contentStatus = (row["Content Status"] || "").trim();
      const igValue = (row["IG"] || "").trim();
      const csvName = row["Name"] || "";

      if (!contentStatus) continue;

      const dbStatus = mapContentStatus(contentStatus);
      if (dbStatus === "none") continue;

      // Try to get handle
      let handle = extractHandle(igValue);

      // If post URL, try Apify lookup
      if (!handle && (igValue.includes("/p/") || igValue.includes("/reel/"))) {
        const postUrl = igValue.split(/\s+/)[0];
        const normalizedUrl = postUrl.split("?")[0].replace(/\/$/, "");
        handle = urlToHandle.get(normalizedUrl) || null;
      }

      if (!handle) {
        console.log(`  ${csvName}: no handle found`);
        notFound++;
        continue;
      }

      // Find influencer
      const { data: inf } = await supabase
        .from("influencers")
        .select("id, name")
        .ilike("instagram_handle", handle)
        .single();

      if (!inf) {
        console.log(`  ${csvName} (@${handle}): not in database`);
        notFound++;
        continue;
      }

      // Update campaign_influencer
      const { error } = await supabase
        .from("campaign_influencers")
        .update({ content_posted: dbStatus })
        .eq("campaign_id", campaignId)
        .eq("influencer_id", inf.id);

      if (!error) {
        console.log(`  ${inf.name}: -> ${dbStatus}`);
        updated++;
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound}`);
  console.log("=".repeat(50));
}

main().catch(console.error);

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Map clothing size from CSV to database value
function mapClothingSize(value: string): string | null {
  const v = value.toLowerCase().trim();
  if (v === "xxs" || v === "extra small" || v === "xsmall" || v === "xs") return "XS";
  if (v === "small" || v === "s") return "S";
  if (v === "medium" || v === "m") return "M";
  if (v === "large" || v === "l") return "L";
  if (v === "xl" || v === "extra large" || v === "xlarge") return "XL";
  return null;
}

// Extract handle from Instagram URL
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

// Load Apify data for post URL lookups
function loadApifyData(): Map<string, string> {
  const urlToHandle = new Map<string, string>();
  const apifyFiles = [
    "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_03-01-54-059.csv",
    "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_03-42-58-827.csv",
  ];

  for (const path of apifyFiles) {
    try {
      const content = fs.readFileSync(path, "utf-8");
      const parsed = Papa.parse(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
      });

      for (const row of parsed.data as Record<string, string>[]) {
        const inputUrl = (row["inputUrl"] || "").trim();
        const ownerUsername = (row["ownerUsername"] || "").trim().toLowerCase();
        if (inputUrl && ownerUsername) {
          const normalizedUrl = inputUrl.split("?")[0].replace(/\/$/, "");
          urlToHandle.set(normalizedUrl, ownerUsername);
        }
      }
    } catch (e) {
      // File might not exist
    }
  }

  return urlToHandle;
}

async function main() {
  console.log("Loading Apify data...");
  const urlToHandle = loadApifyData();
  console.log(`Loaded ${urlToHandle.size} URL -> handle mappings\n`);

  const files = [
    "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv",
    "/Users/shanepetersen/Downloads/Campaigns 25'-NOV25.csv",
    "/Users/shanepetersen/Downloads/Campaigns 25'-DEC25.csv",
  ];

  let updated = 0;
  let notFound = 0;

  for (const file of files) {
    console.log(`Processing ${file.split("/").pop()}...`);

    const content = fs.readFileSync(file, "utf-8");
    const parsed = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
    });

    for (const row of parsed.data as Record<string, string>[]) {
      const topSizeRaw = (row["Top Size"] || "").trim();
      const bottomSizeRaw = (row["Bottom Size"] || "").trim();

      if (!topSizeRaw && !bottomSizeRaw) continue;

      const topSize = mapClothingSize(topSizeRaw);
      const bottomsSize = mapClothingSize(bottomSizeRaw);

      if (!topSize && !bottomsSize) continue;

      const igValue = (row["IG"] || "").trim();
      const name = row["Name"] || "";

      // Try to get handle
      let handle = extractHandle(igValue);

      // If post URL, try Apify lookup
      if (!handle && (igValue.includes("/p/") || igValue.includes("/reel/"))) {
        const postUrl = igValue.split(/\s+/)[0];
        const normalizedUrl = postUrl.split("?")[0].replace(/\/$/, "");
        handle = urlToHandle.get(normalizedUrl) || null;
      }

      if (!handle) continue;

      // Find influencer
      const { data: inf } = await supabase
        .from("influencers")
        .select("id, name, top_size, bottoms_size")
        .ilike("instagram_handle", handle)
        .single();

      if (!inf) {
        notFound++;
        continue;
      }

      // Check if needs update
      const updates: Record<string, string> = {};
      if (topSize && inf.top_size !== topSize) {
        updates.top_size = topSize;
      }
      if (bottomsSize && inf.bottoms_size !== bottomsSize) {
        updates.bottoms_size = bottomsSize;
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from("influencers").update(updates).eq("id", inf.id);
        console.log(`  ${inf.name}: ${Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(", ")}`);
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

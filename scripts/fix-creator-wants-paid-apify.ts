import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

  // Load Apify data from both CSVs
  const apifyOct = "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_03-01-54-059.csv";
  const apifyNov = "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_03-42-58-827.csv";

  console.log("Loading Apify data...");
  const urlToHandle = new Map<string, string>();

  for (const path of [apifyOct, apifyNov]) {
    const map = getUrlToHandleMap(path);
    for (const [url, handle] of map) {
      urlToHandle.set(url, handle);
    }
  }
  console.log(`Loaded ${urlToHandle.size} URL -> handle mappings\n`);

  // Process OCT25 CSV for "creator wants paid" with post URLs
  const oct25Path = "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv";
  const content = fs.readFileSync(oct25Path, "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  let updated = 0;

  for (const row of parsed.data as Record<string, string>[]) {
    const commsStatus = (row["Comms Status"] || "").toLowerCase();
    const igValue = (row["IG"] || "").trim();
    const name = row["Name"] || "";

    // Check if "creator wants paid" and has a post URL
    if (commsStatus.includes("creator wants paid") && (igValue.includes("/p/") || igValue.includes("/reel/"))) {
      const postUrl = igValue.split(/\s+/)[0];
      const normalizedUrl = postUrl.split("?")[0].replace(/\/$/, "");

      // Look up handle from Apify data
      const handle = urlToHandle.get(normalizedUrl);

      if (handle) {
        // Find influencer by handle
        const { data: inf } = await supabase
          .from("influencers")
          .select("id, name, relationship_status")
          .ilike("instagram_handle", handle)
          .single();

        if (inf) {
          // Update influencer
          await supabase
            .from("influencers")
            .update({ relationship_status: "creator_wants_paid" })
            .eq("id", inf.id);

          // Update campaign_influencer
          await supabase
            .from("campaign_influencers")
            .update({ status: "creator_wants_paid" })
            .eq("campaign_id", october2025Id)
            .eq("influencer_id", inf.id);

          console.log(`${name} -> @${handle}: updated to creator_wants_paid`);
          updated++;
        } else {
          console.log(`${name} -> @${handle}: not found in database`);
        }
      } else {
        console.log(`${name}: no Apify match for ${normalizedUrl}`);
      }
    }
  }

  console.log(`\nUpdated ${updated} influencers to creator_wants_paid`);
}

main().catch(console.error);

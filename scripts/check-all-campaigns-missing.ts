import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

function loadApifyData(): Set<string> {
  const urls = new Set<string>();
  const apifyFiles = [
    "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_03-01-54-059.csv",
    "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_03-42-58-827.csv",
    "/Users/shanepetersen/Downloads/dataset_instagram-post-scraper_2026-01-22_04-38-55-144.csv",
  ];
  for (const path of apifyFiles) {
    try {
      const content = fs.readFileSync(path, "utf-8");
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
      for (const row of parsed.data as Record<string, string>[]) {
        const inputUrl = (row["inputUrl"] || "").trim().split("?")[0].replace(/\/$/, "");
        if (inputUrl) urls.add(inputUrl);
      }
    } catch {}
  }
  return urls;
}

async function checkCampaign(campaignId: string, csvPath: string, campaignName: string) {
  const { data: dbInfluencers } = await supabase
    .from("campaign_influencers")
    .select("influencer:influencers(instagram_handle)")
    .eq("campaign_id", campaignId);

  const dbHandles = new Set(
    dbInfluencers?.map((i) => i.influencer?.instagram_handle?.toLowerCase()).filter(Boolean)
  );

  const content = fs.readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  const rows = parsed.data as Record<string, string>[];
  const postUrls: { name: string; url: string }[] = [];

  for (const row of rows) {
    const name = (row["Name"] || "").trim();
    const ig = (row["IG"] || "").trim();
    const partnershipType = (row["Partnership Type"] || "").trim();

    if (!name) continue;
    if (partnershipType.toLowerCase() === "instructor") continue;

    const handle = extractHandle(ig);
    const isPostUrl = ig.includes("/p/") || ig.includes("/reel/");

    if (handle && dbHandles.has(handle)) continue;

    if (isPostUrl) {
      const url = ig.split(/\s+/)[0].split("?")[0].replace(/\/$/, "");
      postUrls.push({ name, url });
    }
  }

  return { campaignName, inCampaign: dbHandles.size, postUrls };
}

async function main() {
  const alreadyInApify = loadApifyData();
  console.log("Already in Apify data:", alreadyInApify.size, "URLs\n");

  const campaigns = [
    { id: "b0397715-54da-48b3-976f-09d6bdf13ad4", path: "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv", name: "October 2025" },
    { id: "e7c4e86d-fe55-470a-91f5-27c802cbb2d5", path: "/Users/shanepetersen/Downloads/Campaigns 25'-NOV25.csv", name: "November 2025" },
    { id: "a63fcee5-2289-45ea-865e-1c61cd7dc5a8", path: "/Users/shanepetersen/Downloads/Campaigns 25'-DEC25.csv", name: "December 2025" },
  ];

  const allMissing: { name: string; url: string }[] = [];

  for (const c of campaigns) {
    const result = await checkCampaign(c.id, c.path, c.name);
    console.log("=".repeat(50));
    console.log(result.campaignName);
    console.log("In campaign:", result.inCampaign);
    console.log("Post URLs missing:", result.postUrls.length);

    for (const p of result.postUrls) {
      const normalized = p.url.split("?")[0].replace(/\/$/, "");
      if (alreadyInApify.has(normalized)) {
        console.log("  [HAVE]", p.name, "-", p.url);
      } else {
        console.log("  [NEED]", p.name, "-", p.url);
        allMissing.push(p);
      }
    }
  }

  // Dedupe URLs
  const uniqueUrls = [...new Set(allMissing.map((p) => p.url))];

  console.log("\n" + "=".repeat(50));
  console.log("URLS TO RUN THROUGH APIFY (" + uniqueUrls.length + "):");
  console.log("=".repeat(50));
  for (const url of uniqueUrls) {
    console.log(url);
  }

  // Save to file
  fs.writeFileSync("/Users/shanepetersen/Downloads/all-campaigns-apify-urls.txt", uniqueUrls.join("\n"));
  console.log("\nSaved to /Users/shanepetersen/Downloads/all-campaigns-apify-urls.txt");
}

main().catch(console.error);

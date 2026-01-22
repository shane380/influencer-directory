import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Extract handle from Instagram URL or value
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

async function main() {
  const november2025Id = "e7c4e86d-fe55-470a-91f5-27c802cbb2d5";
  const october2025Id = "b0397715-54da-48b3-976f-09d6bdf13ad4";

  // Process NOV25 CSV for paid influencers
  const nov25Path = "/Users/shanepetersen/Downloads/Campaigns 25'-NOV25.csv";
  const content = fs.readFileSync(nov25Path, "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  const paidHandles: string[] = [];

  for (const row of parsed.data as Record<string, string>[]) {
    const partnershipType = (row["Partnership Type"] || "").trim();
    const igValue = row["IG"] || row["Instagram Handle"] || "";
    const handle = extractHandle(igValue);

    if (partnershipType === "Paid" && handle) {
      paidHandles.push(handle);
    }
  }

  console.log(`Found ${paidHandles.length} paid influencers with handles\n`);

  let updated = 0;
  let campaignUpdated = 0;

  for (const handle of paidHandles) {
    const { data: influencer } = await supabase
      .from("influencers")
      .select("id, name, partnership_type")
      .ilike("instagram_handle", handle)
      .single();

    if (!influencer) {
      console.log(`Not found: @${handle}`);
      continue;
    }

    if (influencer.partnership_type !== "paid") {
      await supabase
        .from("influencers")
        .update({ partnership_type: "paid" })
        .eq("id", influencer.id);
      console.log(`${influencer.name}: ${influencer.partnership_type} -> paid`);
      updated++;
    }

    // Update campaign_influencers for both campaigns
    for (const campaignId of [november2025Id, october2025Id]) {
      const { data: link } = await supabase
        .from("campaign_influencers")
        .select("id, partnership_type")
        .eq("campaign_id", campaignId)
        .eq("influencer_id", influencer.id)
        .single();

      if (link && link.partnership_type !== "paid") {
        await supabase
          .from("campaign_influencers")
          .update({ partnership_type: "paid" })
          .eq("id", link.id);
        campaignUpdated++;
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("SUMMARY");
  console.log("=".repeat(50));
  console.log(`Influencers updated to paid: ${updated}`);
  console.log(`Campaign links updated:      ${campaignUpdated}`);
  console.log("=".repeat(50));
}

main().catch(console.error);

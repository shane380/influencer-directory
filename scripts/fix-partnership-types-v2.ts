import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Map partnership types from CSV to database values
function mapPartnershipType(value: string): string | null {
  const v = value.toLowerCase().trim();

  if (v === "paid") return "paid";
  if (v === "gifted (reccuring)" || v === "gifted (recurring)" || v === "gifted - recurring") return "gifted_recurring";
  if (v === "gifted no ask" || v === "gifted - no ask" || v === "gifted (no ask)") return "gifted_no_ask";
  if (v === "gifted (soft ask)" || v === "gifted - soft ask" || v === "gifted soft ask") return "gifted_soft_ask";
  if (v === "gifted (deliverable ask)" || v === "gifted - deliverable ask" || v === "gifted deliverable ask") return "gifted_deliverable_ask";
  if (v === "gifted") return "gifted_no_ask";

  return null;
}

// Extract handle from Instagram URL or value
function extractHandle(igValue: string): string | null {
  const value = igValue.trim();
  if (!value) return null;

  // Skip post/reel URLs
  if (value.includes("/p/") || value.includes("/reel/") || value.includes("/reels/")) {
    return null;
  }

  // Try to extract from profile URL
  const profileMatch = value.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
  if (profileMatch) {
    return profileMatch[1].toLowerCase();
  }

  // It might already be a handle
  if (value.startsWith("@")) {
    return value.slice(1).toLowerCase();
  }

  // Assume it's a handle if it looks like one
  if (/^[a-zA-Z0-9._]+$/.test(value)) {
    return value.toLowerCase();
  }

  return null;
}

interface InfluencerUpdate {
  handle: string;
  name: string;
  partnershipType: string;
  campaigns: string[];
}

async function processCSV(csvPath: string): Promise<InfluencerUpdate[]> {
  const content = fs.readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  const updates: InfluencerUpdate[] = [];
  const seen = new Set<string>();

  for (const row of parsed.data as Record<string, string>[]) {
    const name = (row["Name"] || "").trim();
    const igValue = row["IG"] || row["Instagram Handle"] || "";
    const partnershipValue = row["Partnership Type"] || "";
    const campaignsValue = row["Campaign"] || "";

    const handle = extractHandle(igValue);
    const partnershipType = mapPartnershipType(partnershipValue);

    if (handle && partnershipType && !seen.has(handle)) {
      seen.add(handle);
      updates.push({
        handle,
        name,
        partnershipType,
        campaigns: campaignsValue.split(",").map((c) => c.trim()).filter(Boolean),
      });
    }
  }

  return updates;
}

async function main() {
  const campaignMap: Record<string, string> = {
    "October 2025": "b0397715-54da-48b3-976f-09d6bdf13ad4",
    "November 2025": "e7c4e86d-fe55-470a-91f5-27c802cbb2d5",
    "FW25": "b0397715-54da-48b3-976f-09d6bdf13ad4",
    "NOV25": "e7c4e86d-fe55-470a-91f5-27c802cbb2d5",
  };

  // Process both CSVs
  console.log("Processing OCT25 CSV...");
  const oct25Path = "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv";
  const oct25Updates = await processCSV(oct25Path);
  console.log(`Found ${oct25Updates.length} influencers with partnership types`);

  // Show breakdown
  const oct25Breakdown: Record<string, number> = {};
  oct25Updates.forEach(u => {
    oct25Breakdown[u.partnershipType] = (oct25Breakdown[u.partnershipType] || 0) + 1;
  });
  console.log("  Breakdown:", oct25Breakdown);

  console.log("\nProcessing NOV25 CSV...");
  const nov25Path = "/Users/shanepetersen/Downloads/Campaigns 25'-NOV25.csv";
  const nov25Updates = await processCSV(nov25Path);
  console.log(`Found ${nov25Updates.length} influencers with partnership types`);

  const nov25Breakdown: Record<string, number> = {};
  nov25Updates.forEach(u => {
    nov25Breakdown[u.partnershipType] = (nov25Breakdown[u.partnershipType] || 0) + 1;
  });
  console.log("  Breakdown:", nov25Breakdown);

  // Combine updates (NOV25 takes precedence for duplicates)
  const allUpdates = new Map<string, InfluencerUpdate>();
  for (const update of oct25Updates) {
    allUpdates.set(update.handle, update);
  }
  for (const update of nov25Updates) {
    const existing = allUpdates.get(update.handle);
    if (existing) {
      update.campaigns = [...new Set([...existing.campaigns, ...update.campaigns])];
    }
    allUpdates.set(update.handle, update);
  }

  console.log(`\nTotal unique influencers to update: ${allUpdates.size}\n`);

  let influencerUpdates = 0;
  let campaignInfluencerUpdates = 0;
  let notFound = 0;

  for (const [handle, update] of allUpdates) {
    // Find influencer by handle
    const { data: influencer } = await supabase
      .from("influencers")
      .select("id, name, partnership_type")
      .ilike("instagram_handle", handle)
      .single();

    if (!influencer) {
      notFound++;
      continue;
    }

    // Update influencer's partnership type
    if (influencer.partnership_type !== update.partnershipType) {
      const { error } = await supabase
        .from("influencers")
        .update({ partnership_type: update.partnershipType })
        .eq("id", influencer.id);

      if (!error) {
        console.log(`${influencer.name}: ${influencer.partnership_type} -> ${update.partnershipType}`);
        influencerUpdates++;
      }
    }

    // Update campaign_influencers records
    for (const campaignName of update.campaigns) {
      const campaignId = campaignMap[campaignName];
      if (!campaignId) continue;

      const { data: link } = await supabase
        .from("campaign_influencers")
        .select("id, partnership_type")
        .eq("campaign_id", campaignId)
        .eq("influencer_id", influencer.id)
        .single();

      if (link && link.partnership_type !== update.partnershipType) {
        const { error } = await supabase
          .from("campaign_influencers")
          .update({ partnership_type: update.partnershipType })
          .eq("id", link.id);

        if (!error) {
          campaignInfluencerUpdates++;
        }
      }
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log("SUMMARY");
  console.log("=".repeat(50));
  console.log(`Influencers updated:          ${influencerUpdates}`);
  console.log(`Campaign associations updated: ${campaignInfluencerUpdates}`);
  console.log(`Not found in database:        ${notFound}`);
  console.log("=".repeat(50));
}

main().catch(console.error);

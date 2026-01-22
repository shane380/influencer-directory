import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
  const october2025Id = "b0397715-54da-48b3-976f-09d6bdf13ad4";
  const november2025Id = "e7c4e86d-fe55-470a-91f5-27c802cbb2d5";

  // Process both CSVs
  const files = [
    { path: "/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv", campaignId: october2025Id },
    { path: "/Users/shanepetersen/Downloads/Campaigns 25'-NOV25.csv", campaignId: november2025Id },
  ];

  let updated = 0;

  for (const { path, campaignId } of files) {
    const content = fs.readFileSync(path, "utf-8");
    const parsed = Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
    });

    console.log(`Processing ${path.split("/").pop()}...`);

    for (const row of parsed.data as Record<string, string>[]) {
      const commsStatus = (row["Comms Status"] || "").toLowerCase();
      const igValue = row["IG"] || row["Instagram Handle"] || "";
      const name = row["Name"] || "";

      if (commsStatus.includes("creator wants paid")) {
        const handle = extractHandle(igValue);

        if (handle) {
          // Find influencer
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
              .eq("campaign_id", campaignId)
              .eq("influencer_id", inf.id);

            console.log(`  ${inf.name} (@${handle}): -> creator_wants_paid`);
            updated++;
          } else {
            console.log(`  Not found: ${name} (@${handle})`);
          }
        } else {
          console.log(`  No handle for: ${name}`);
        }
      }
    }
  }

  console.log(`\nUpdated ${updated} influencers to creator_wants_paid`);
}

main().catch(console.error);

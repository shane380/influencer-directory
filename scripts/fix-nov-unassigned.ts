import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const november2025Id = "e7c4e86d-fe55-470a-91f5-27c802cbb2d5";

  // Read CSV to get partnership types for post URL influencers
  const content = fs.readFileSync("/Users/shanepetersen/Downloads/Campaigns 25'-NOV25.csv", "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  // Map name -> partnership type for post URL entries
  const nameToType: Record<string, string> = {};
  for (const row of parsed.data as Record<string, string>[]) {
    const name = (row["Name"] || "").trim().toLowerCase();
    const ig = row["IG"] || "";
    const pt = (row["Partnership Type"] || "").trim();

    if (ig.includes("/p/") || ig.includes("/reel/")) {
      nameToType[name] = pt;
    }
  }

  console.log("Post URL influencers in CSV:", Object.keys(nameToType));

  // Get unassigned influencers from November 2025
  const { data: unassigned } = await supabase
    .from("campaign_influencers")
    .select("id, influencer:influencers(id, name, instagram_handle)")
    .eq("campaign_id", november2025Id)
    .eq("partnership_type", "unassigned");

  console.log("\nFixing unassigned influencers:\n");

  for (const row of unassigned || []) {
    const name = row.influencer?.name?.toLowerCase() || "";
    const handle = row.influencer?.instagram_handle || "";

    // Try to match by name
    let pt = nameToType[name];

    // Also try partial matches
    if (!pt) {
      for (const [csvName, csvPt] of Object.entries(nameToType)) {
        if (name.includes(csvName) || csvName.includes(name)) {
          pt = csvPt;
          break;
        }
      }
    }

    if (pt) {
      const dbPt =
        pt === "Paid"
          ? "paid"
          : pt.includes("Soft Ask")
            ? "gifted_soft_ask"
            : pt.includes("Reccuring") || pt.includes("Recurring")
              ? "gifted_recurring"
              : pt.includes("Deliverable")
                ? "gifted_deliverable_ask"
                : pt.includes("No Ask")
                  ? "gifted_no_ask"
                  : "unassigned";

      if (dbPt !== "unassigned") {
        await supabase.from("campaign_influencers").update({ partnership_type: dbPt }).eq("id", row.id);

        await supabase.from("influencers").update({ partnership_type: dbPt }).eq("id", row.influencer?.id);

        console.log(`${row.influencer?.name} (@${handle}): unassigned -> ${dbPt}`);
      } else {
        console.log(`${row.influencer?.name} (@${handle}): could not map "${pt}"`);
      }
    } else {
      console.log(`${row.influencer?.name} (@${handle}): no match found in CSV`);
    }
  }
}

main().catch(console.error);

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

async function main() {
  const october2025Id = "b0397715-54da-48b3-976f-09d6bdf13ad4";

  // Read OCT25 CSV to get all name -> partnership type mappings
  const content = fs.readFileSync("/Users/shanepetersen/Downloads/Campaigns 25'-OCT25 (FW collection) (1).csv", "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  // Build name -> partnership type map (all entries, not just post URLs)
  const nameToType: Record<string, string> = {};
  for (const row of parsed.data as Record<string, string>[]) {
    const name = (row["Name"] || "").trim().toLowerCase();
    const pt = (row["Partnership Type"] || "").trim();
    if (name && pt) {
      nameToType[name] = pt;
    }
  }

  console.log(`Loaded ${Object.keys(nameToType).length} name->partnership mappings from CSV\n`);

  // Get all unassigned influencers from October 2025
  const { data: unassigned } = await supabase
    .from("campaign_influencers")
    .select("id, influencer:influencers(id, name, instagram_handle)")
    .eq("campaign_id", october2025Id)
    .eq("partnership_type", "unassigned");

  console.log(`Found ${unassigned?.length || 0} unassigned influencers\n`);

  let updated = 0;
  let notFound = 0;

  for (const row of unassigned || []) {
    const name = row.influencer?.name?.toLowerCase() || "";
    const handle = row.influencer?.instagram_handle || "";

    // Try exact match first
    let pt = nameToType[name];

    // Try partial matches
    if (!pt) {
      for (const [csvName, csvPt] of Object.entries(nameToType)) {
        // Match if names contain each other or first word matches
        const nameFirst = name.split(" ")[0];
        const csvFirst = csvName.split(" ")[0];
        if (
          name.includes(csvName) ||
          csvName.includes(name) ||
          (nameFirst.length > 3 && nameFirst === csvFirst)
        ) {
          pt = csvPt;
          break;
        }
      }
    }

    if (pt) {
      const dbPt = mapPartnershipType(pt);
      if (dbPt) {
        await supabase.from("campaign_influencers").update({ partnership_type: dbPt }).eq("id", row.id);
        await supabase.from("influencers").update({ partnership_type: dbPt }).eq("id", row.influencer?.id);
        console.log(`${row.influencer?.name}: unassigned -> ${dbPt}`);
        updated++;
      } else {
        console.log(`${row.influencer?.name}: could not map "${pt}"`);
      }
    } else {
      console.log(`${row.influencer?.name} (@${handle}): no match in CSV`);
      notFound++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`Updated: ${updated}`);
  console.log(`Not found in CSV: ${notFound}`);
  console.log("=".repeat(50));
}

main().catch(console.error);

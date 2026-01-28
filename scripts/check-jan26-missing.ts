import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  // Get all campaign IDs for JAN26
  const { data: campaigns } = await supabase.from("campaigns").select("id, name").ilike("name", "JAN26%");
  console.log("JAN26 Campaigns:", campaigns?.map(c => c.name).join(", "));

  const campaignIds = campaigns?.map(c => c.id) || [];

  // Get all influencers in those campaigns
  const { data: ciList } = await supabase.from("campaign_influencers").select("influencer_id").in("campaign_id", campaignIds);
  const influencerIds = new Set(ciList?.map(ci => ci.influencer_id) || []);
  console.log("Total in JAN26 campaigns:", influencerIds.size);

  // Read original CSV
  const content = fs.readFileSync("/Users/shanepetersen/Downloads/Campaigns 25'-JAN26 (1).csv", "utf-8");
  const parsed = Papa.parse(content, { header: true, skipEmptyLines: true, transformHeader: h => h.trim().replace(/^\uFEFF/, "") });
  const rows = parsed.data as Record<string, string>[];
  console.log("Total CSV rows:", rows.length);

  // Check each CSV row
  const missing: { name: string; ig: string }[] = [];
  for (const row of rows) {
    const name = (row["Name"] || "").trim();
    if (!name) continue;

    // Try to find by name or handle
    const igValue = row["IG"] || "";
    let handle: string | null = null;

    // Extract handle from URL
    const profileMatch = igValue.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
    if (profileMatch && !igValue.includes("/p/") && !igValue.includes("/reel/")) {
      handle = profileMatch[1].toLowerCase();
    }

    // Check if exists in DB
    let found = false;
    if (handle) {
      const { data } = await supabase.from("influencers").select("id").ilike("instagram_handle", handle).single();
      if (data && influencerIds.has(data.id)) found = true;
    }

    if (!found) {
      // Try by name (fuzzy)
      const { data } = await supabase.from("influencers").select("id, name").ilike("name", `%${name}%`);
      if (data && data.length > 0) {
        for (const inf of data) {
          if (influencerIds.has(inf.id)) {
            found = true;
            break;
          }
        }
      }
    }

    if (!found) {
      missing.push({ name, ig: igValue.substring(0, 80) });
    }
  }

  console.log("\nMissing from JAN26 campaigns (" + missing.length + "):");
  missing.forEach(m => console.log("  -", m.name, "|", m.ig));
}

main();

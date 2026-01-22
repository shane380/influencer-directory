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
  const december2025Id = "a63fcee5-2289-45ea-865e-1c61cd7dc5a8";

  // Count in database
  const { data: dbInfluencers } = await supabase
    .from("campaign_influencers")
    .select("influencer:influencers(name, instagram_handle)")
    .eq("campaign_id", december2025Id);

  console.log(`In December 2025 campaign: ${dbInfluencers?.length}`);

  // Get handles in DB
  const dbHandles = new Set(
    dbInfluencers?.map((i) => i.influencer?.instagram_handle?.toLowerCase()).filter(Boolean)
  );

  // Count in CSV
  const content = fs.readFileSync("/Users/shanepetersen/Downloads/Campaigns 25'-DEC25.csv", "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  const rows = parsed.data as Record<string, string>[];
  const withNames = rows.filter((r) => (r["Name"] || "").trim());
  console.log(`CSV total rows: ${rows.length}`);
  console.log(`CSV rows with names: ${withNames.length}`);

  // Find missing
  const missing: { name: string; ig: string; reason: string }[] = [];

  for (const row of withNames) {
    const name = (row["Name"] || "").trim();
    const ig = (row["IG"] || "").trim();
    const partnershipType = (row["Partnership Type"] || "").trim();

    // Skip instructors
    if (partnershipType.toLowerCase() === "instructor") {
      continue;
    }

    const handle = extractHandle(ig);
    const isPostUrl = ig.includes("/p/") || ig.includes("/reel/");

    if (handle && dbHandles.has(handle)) {
      // Already in campaign
      continue;
    }

    if (isPostUrl) {
      missing.push({ name, ig: ig.slice(0, 60), reason: "post URL" });
    } else if (!ig) {
      missing.push({ name, ig: "", reason: "no IG" });
    } else if (!handle) {
      missing.push({ name, ig: ig.slice(0, 60), reason: "could not extract handle" });
    } else {
      // Has handle but not in campaign - check if exists in DB at all
      const { data: exists } = await supabase
        .from("influencers")
        .select("id, name")
        .ilike("instagram_handle", handle)
        .single();

      if (exists) {
        missing.push({ name, ig: `@${handle}`, reason: "exists but not in DEC25 campaign" });
      } else {
        missing.push({ name, ig: `@${handle}`, reason: "not in database" });
      }
    }
  }

  console.log(`\nMissing from December 2025 campaign (${missing.length}):`);
  for (const m of missing) {
    console.log(`  ${m.name}: ${m.reason}${m.ig ? ` - ${m.ig}` : ""}`);
  }
}

main().catch(console.error);

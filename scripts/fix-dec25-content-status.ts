import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import Papa from "papaparse";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

function mapContentStatus(value: string): string {
  const v = value.toLowerCase();
  if (v.includes("reel")) return "reel";
  if (v.includes("in feed post") || v.includes("in_feed_post")) return "in_feed_post";
  if (v.includes("stories") || v.includes("story")) return "stories";
  if (v.includes("tiktok")) return "tiktok";
  return "none";
}

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

  const content = fs.readFileSync("/Users/shanepetersen/Downloads/Campaigns 25'-DEC25.csv", "utf-8");
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().replace(/^\uFEFF/, ""),
  });

  let updated = 0;

  console.log("Updating DEC25 content status...\n");

  for (const row of parsed.data as Record<string, string>[]) {
    const contentStatus = (row["Content Status"] || "").trim();
    const igValue = (row["IG"] || "").trim();
    const name = row["Name"] || "";

    if (!contentStatus) continue;

    const dbStatus = mapContentStatus(contentStatus);
    if (dbStatus === "none") continue;

    const handle = extractHandle(igValue);
    if (!handle) {
      console.log(`${name}: no handle found`);
      continue;
    }

    const { data: inf } = await supabase
      .from("influencers")
      .select("id, name")
      .ilike("instagram_handle", handle)
      .single();

    if (!inf) {
      console.log(`${name} (@${handle}): not in database`);
      continue;
    }

    const { error } = await supabase
      .from("campaign_influencers")
      .update({ content_posted: dbStatus })
      .eq("campaign_id", december2025Id)
      .eq("influencer_id", inf.id);

    if (!error) {
      console.log(`${inf.name}: -> ${dbStatus}`);
      updated++;
    }
  }

  console.log(`\nUpdated: ${updated}`);
}

main().catch(console.error);

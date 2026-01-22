import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findBadRecords() {
  const { data, error } = await supabase
    .from("influencers")
    .select("id, name, instagram_handle, follower_count, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error:", error);
    return;
  }

  const badRecords: any[] = [];

  for (const inf of data || []) {
    let reason: string | null = null;

    // Name starts with "-"
    if (inf.name.startsWith("-")) {
      reason = "Name starts with '-'";
    }
    // Name contains product keywords
    else if (/body\s*(butter|bamboo|soft)/i.test(inf.name) ||
             /leggings|bra|jacket|headband|shrug|contour/i.test(inf.name)) {
      reason = "Name contains product description";
    }
    // Name looks like an address
    else if (/\d+\s+(st|street|ave|avenue|road|rd|dr|drive|lane|ln|blvd)\b/i.test(inf.name) ||
             /,\s*(fl|ca|tx|ny|on)\s*\d/i.test(inf.name)) {
      reason = "Name looks like an address";
    }
    // Handle looks like a location
    else if (/^(benowa|okehampton|london|miami|toronto|california|los angeles|new york|sydney|melbourne)$/i.test(inf.instagram_handle) ||
             /^\d+\s+\w+\s+(st|street|ave|road)/i.test(inf.instagram_handle) ||
             /^[a-z]+\s+(on|fl|ca|tx|ny)\s*$/i.test(inf.instagram_handle)) {
      reason = "Handle looks like a location";
    }
    // 0 followers and suspicious name/handle
    else if (inf.follower_count === 0 && (
      inf.name.includes(",") ||
      /^\d/.test(inf.name) ||
      inf.instagram_handle.includes(",") ||
      inf.instagram_handle.length > 50
    )) {
      reason = "0 followers with suspicious data";
    }

    if (reason) {
      badRecords.push({ ...inf, reason });
    }
  }

  console.log(`Found ${badRecords.length} potentially bad records:\n`);
  badRecords.forEach((r, i) => {
    console.log(`${i + 1}. ID: ${r.id}`);
    console.log(`   Name: "${r.name}"`);
    console.log(`   Handle: @${r.instagram_handle}`);
    console.log(`   Followers: ${r.follower_count}`);
    console.log(`   Reason: ${r.reason}`);
    console.log();
  });

  // Output IDs for easy deletion
  if (badRecords.length > 0) {
    console.log("--- IDs for deletion ---");
    console.log(badRecords.map(r => r.id).join("\n"));
  }
}

findBadRecords();

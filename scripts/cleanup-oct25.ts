import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client with service role for admin access
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Patterns that indicate garbage records (not real influencer names)
const garbagePatterns = [
  /^-?body\s*(butter|bamboo|soft)/i,
  /^-?\d+\s*body/i,
  /^address\s*-/i,
  /^\d+\s+\w+\s+(st|street|ave|avenue|road|rd|dr|drive|lane|ln)/i,
  /^west hollywood$/i,
  /^-headband/i,
  /^-contour/i,
  /^m\d[a-z]\d[a-z]\d,/i,  // postal code pattern
  /^\d+\s+leimen/i,
  /^,\d+\s+n\s+denver/i,
  /^unit\s+\d+/i,
];

// Garbage handle patterns (addresses, postal codes, etc.)
const garbageHandlePatterns = [
  /^unit\s+\d+$/i,
  /^california\s+\d+$/i,
  /^los\s+angeles$/i,
  /^toronto\s+on$/i,
  /^\d+\s+scotts\s+lane$/i,
  /^\d+\s+märsta$/i,
  /^\d+\s+wharf/i,
  /tx\s+\d+,/i,
  /in feed post/i,
  /dmed instead/i,
  /highland utah/i,
  /mcallen tx/i,
];

async function cleanup() {
  console.log("Finding garbage records...\n");

  // Find influencers with 0 followers (couldn't be looked up)
  const { data: zeroFollowers, error } = await supabase
    .from("influencers")
    .select("id, name, instagram_handle, follower_count")
    .eq("follower_count", 0);

  if (error) {
    console.error("Error fetching influencers:", error);
    return;
  }

  console.log(`Found ${zeroFollowers?.length || 0} influencers with 0 followers\n`);

  const toDelete: string[] = [];

  for (const inf of zeroFollowers || []) {
    let isGarbage = false;
    let reason = "";

    // Check name against garbage patterns
    for (const pattern of garbagePatterns) {
      if (pattern.test(inf.name)) {
        isGarbage = true;
        reason = `Name matches garbage pattern: ${pattern}`;
        break;
      }
    }

    // Check handle against garbage patterns
    if (!isGarbage) {
      for (const pattern of garbageHandlePatterns) {
        if (pattern.test(inf.instagram_handle)) {
          isGarbage = true;
          reason = `Handle matches garbage pattern: ${pattern}`;
          break;
        }
      }
    }

    // Check for names that look like addresses or product names
    if (!isGarbage) {
      const nameWords = inf.name.toLowerCase();
      if (
        nameWords.includes("leggings") ||
        nameWords.includes("bra") ||
        nameWords.includes("jacket") ||
        nameWords.includes("headband") ||
        nameWords.includes("shrug") ||
        nameWords.includes("street") ||
        nameWords.includes("avenue") ||
        nameWords.includes(",") && nameWords.match(/\d/)
      ) {
        isGarbage = true;
        reason = "Name contains product or address keywords";
      }
    }

    if (isGarbage) {
      console.log(`GARBAGE: "${inf.name}" (@${inf.instagram_handle}) - ${reason}`);
      toDelete.push(inf.id);
    } else {
      console.log(`KEEP: "${inf.name}" (@${inf.instagram_handle})`);
    }
  }

  console.log(`\n\nFound ${toDelete.length} garbage records to delete\n`);

  if (toDelete.length > 0) {
    // First delete campaign associations
    console.log("Deleting campaign associations...");
    const { error: linkError } = await supabase
      .from("campaign_influencers")
      .delete()
      .in("influencer_id", toDelete);

    if (linkError) {
      console.error("Error deleting campaign links:", linkError);
      return;
    }

    // Then delete the influencers
    console.log("Deleting influencer records...");
    const { error: deleteError } = await supabase
      .from("influencers")
      .delete()
      .in("id", toDelete);

    if (deleteError) {
      console.error("Error deleting influencers:", deleteError);
      return;
    }

    console.log(`\nSuccessfully deleted ${toDelete.length} garbage records`);
  }
}

cleanup().catch(console.error);

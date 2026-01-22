import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function updateInfluencer(handle: string, partnershipType: string) {
  const october2025Id = "b0397715-54da-48b3-976f-09d6bdf13ad4";

  const { data: inf } = await supabase
    .from("influencers")
    .select("id, name")
    .ilike("instagram_handle", handle)
    .single();

  if (inf) {
    await supabase.from("influencers").update({ partnership_type: partnershipType }).eq("id", inf.id);
    await supabase
      .from("campaign_influencers")
      .update({ partnership_type: partnershipType })
      .eq("campaign_id", october2025Id)
      .eq("influencer_id", inf.id);
    console.log(`${inf.name} (@${handle}): -> ${partnershipType}`);
  } else {
    console.log(`Not found: @${handle}`);
  }
}

async function main() {
  // Manual mappings based on CSV search
  const updates: [string, string][] = [
    ["phoew", "gifted_deliverable_ask"], // Phoebe Williams
    ["allie_eklund", "gifted_soft_ask"], // Allie Eklund
    ["britaingradyy", "gifted_soft_ask"], // Britain Grady
    ["aleksandra_dabros", "gifted_soft_ask"], // aleksandra_dabros
    ["beatrixramosaj", "gifted_no_ask"], // Beatrix ramosaj
    ["lilianavenz", "gifted_soft_ask"], // Lilian
    ["thespinaparianos", "gifted_deliverable_ask"], // thespinaparianos
    ["sabrinaminford", "gifted_recurring"], // Sabrina
    ["jasminsarakatariina", "gifted_recurring"], // Sara Johansen
    ["alisharevel", "gifted_no_ask"], // Alisha Revel (Ambassador -> gifted_no_ask)
    ["sophiebatzloff", "gifted_soft_ask"], // Sophie Batzloff (assume soft ask)
  ];

  for (const [handle, pt] of updates) {
    await updateInfluencer(handle, pt);
  }
}

main().catch(console.error);

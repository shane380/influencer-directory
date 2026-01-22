import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const nov25Id = "6bd19627-a516-4296-9772-f618d79f6ee4";
  const november2025Id = "e7c4e86d-fe55-470a-91f5-27c802cbb2d5";

  // Get all influencers in NOV25
  const { data: nov25Links, error: fetchError } = await supabase
    .from("campaign_influencers")
    .select("*")
    .eq("campaign_id", nov25Id);

  if (fetchError) {
    console.log("Error fetching:", fetchError.message);
    return;
  }

  console.log(`Found ${nov25Links?.length || 0} influencers in NOV25`);

  let moved = 0;
  let alreadyExists = 0;

  for (const link of nov25Links || []) {
    // Check if already in November 2025
    const { data: existing } = await supabase
      .from("campaign_influencers")
      .select("id")
      .eq("campaign_id", november2025Id)
      .eq("influencer_id", link.influencer_id)
      .single();

    if (existing) {
      alreadyExists++;
      continue;
    }

    // Move to November 2025
    const { error: insertError } = await supabase
      .from("campaign_influencers")
      .insert({
        campaign_id: november2025Id,
        influencer_id: link.influencer_id,
        partnership_type: link.partnership_type,
        status: link.status,
        notes: link.notes,
        approval_status: link.approval_status,
        content_posted: link.content_posted || "none",
      });

    if (insertError) {
      console.log(`Error moving ${link.influencer_id}: ${insertError.message}`);
    } else {
      moved++;
    }
  }

  console.log(`Moved: ${moved}`);
  console.log(`Already in November 2025: ${alreadyExists}`);

  // Delete all from NOV25
  const { error: deleteLinksError } = await supabase
    .from("campaign_influencers")
    .delete()
    .eq("campaign_id", nov25Id);

  if (deleteLinksError) {
    console.log("Error deleting links:", deleteLinksError.message);
    return;
  }

  // Delete NOV25 campaign
  const { error: deleteCampaignError } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", nov25Id);

  if (deleteCampaignError) {
    console.log("Error deleting campaign:", deleteCampaignError.message);
  } else {
    console.log("Deleted NOV25 campaign");
  }
}

main().catch(console.error);

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function moveCampaign(fromId: string, fromName: string, toId: string, toName: string) {
  console.log(`\nMoving ${fromName} -> ${toName}`);

  // Get all influencers in source campaign
  const { data: links, error: fetchError } = await supabase
    .from("campaign_influencers")
    .select("*")
    .eq("campaign_id", fromId);

  if (fetchError) {
    console.log("Error fetching:", fetchError.message);
    return;
  }

  console.log(`Found ${links?.length || 0} influencers in ${fromName}`);

  let moved = 0;
  let alreadyExists = 0;

  for (const link of links || []) {
    // Check if already in target campaign
    const { data: existing } = await supabase
      .from("campaign_influencers")
      .select("id")
      .eq("campaign_id", toId)
      .eq("influencer_id", link.influencer_id)
      .single();

    if (existing) {
      alreadyExists++;
      continue;
    }

    // Move to target campaign
    const { error: insertError } = await supabase
      .from("campaign_influencers")
      .insert({
        campaign_id: toId,
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
  console.log(`Already in ${toName}: ${alreadyExists}`);

  // Delete all from source campaign
  const { error: deleteLinksError } = await supabase
    .from("campaign_influencers")
    .delete()
    .eq("campaign_id", fromId);

  if (deleteLinksError) {
    console.log("Error deleting links:", deleteLinksError.message);
    return;
  }

  // Delete source campaign
  const { error: deleteCampaignError } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", fromId);

  if (deleteCampaignError) {
    console.log("Error deleting campaign:", deleteCampaignError.message);
  } else {
    console.log(`Deleted ${fromName} campaign`);
  }
}

async function main() {
  // FW25 -> October 2025
  const fw25Id = "bc080c02-658e-44ea-91a5-2569aa6a134f";
  const october2025Id = "b0397715-54da-48b3-976f-09d6bdf13ad4";
  await moveCampaign(fw25Id, "FW25", october2025Id, "October 2025");

  // JAN26 -> January 2026 (create if needed)
  const jan26Id = "065f017b-8eb4-463c-be1b-78c58751586c";

  // Check if January 2026 exists
  let { data: jan2026 } = await supabase
    .from("campaigns")
    .select("id")
    .eq("name", "January 2026")
    .single();

  if (!jan2026) {
    // Create January 2026
    const { data: newCampaign, error } = await supabase
      .from("campaigns")
      .insert({ name: "January 2026", status: "planning" })
      .select("id")
      .single();

    if (error) {
      console.log("Error creating January 2026:", error.message);
      return;
    }
    jan2026 = newCampaign;
    console.log("\nCreated January 2026 campaign");
  }

  await moveCampaign(jan26Id, "JAN26", jan2026.id, "January 2026");

  // Also delete Import Test if it exists
  const importTestId = "130318e5-3a5e-458f-88d6-780b2d1ae883";

  // Delete links first
  await supabase
    .from("campaign_influencers")
    .delete()
    .eq("campaign_id", importTestId);

  const { error: deleteTestError } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", importTestId);

  if (!deleteTestError) {
    console.log("\nDeleted Import Test campaign");
  }

  console.log("\n=== Done ===");
}

main().catch(console.error);

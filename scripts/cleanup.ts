import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function cleanup() {
  // Delete the incorrectly imported record
  const { error } = await supabase
    .from("influencers")
    .delete()
    .eq("id", "a2744b73-b5f7-4cef-babe-945b3418014e");

  if (error) {
    console.log("Error:", error.message);
  } else {
    console.log("Deleted bad import");
  }
}

cleanup();

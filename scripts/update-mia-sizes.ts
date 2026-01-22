import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function updateMiaSizes() {
  // From CSV: Bottom Size = Small, Top Size = Medium
  const { error } = await supabase
    .from("influencers")
    .update({
      top_size: "M",
      bottoms_size: "S",
    })
    .eq("instagram_handle", "miaflorentia");

  if (error) {
    console.log("Error:", error.message);
  } else {
    console.log("Updated Mia's sizes: Top = M, Bottoms = S");
  }
}

updateMiaSizes();

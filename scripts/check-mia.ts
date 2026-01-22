import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

async function check() {
  const { data, error } = await supabase
    .from("influencers")
    .select("id, name, instagram_handle, profile_photo_url, follower_count")
    .ilike("instagram_handle", "miaflorentia")
    .single();

  if (error) {
    console.log("Error:", error.message);
  } else {
    console.log("Mia's record:", JSON.stringify(data, null, 2));
  }
}

check();

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function isEmailTriggerEnabled(key: string): Promise<boolean> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await supabase
      .from("app_settings")
      .select("email_triggers")
      .eq("id", "default")
      .single();

    if (!data?.email_triggers) return true; // Default to enabled if no settings
    return data.email_triggers[key] !== false;
  } catch {
    return true; // Default to enabled on error
  }
}

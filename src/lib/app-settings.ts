import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface EmailTemplateOverride {
  subject?: string;
  heading?: string;
  body?: string;
  ctaText?: string;
}

export async function getEmailTemplate(templateKey: string): Promise<EmailTemplateOverride | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await (supabase.from("app_settings") as any)
      .select("value")
      .eq("key", "email_templates")
      .single();

    if (!data?.value) return null;
    const templates = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return templates[templateKey] || null;
  } catch {
    return null;
  }
}

export async function isEmailTriggerEnabled(key: string): Promise<boolean> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data } = await (supabase.from("app_settings") as any)
      .select("value")
      .eq("key", "email_triggers")
      .single();

    if (!data?.value) return true;
    const triggers = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return triggers[key] !== false;
  } catch {
    return true;
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

async function verifyAdminOrManager() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("is_admin, is_manager")
    .eq("id", user.id)
    .single();

  return (profile?.is_admin || profile?.is_manager) ? user : null;
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const DEFAULT_TRIGGERS = {
  campaign_assigned: true,
  content_approved: true,
  revision_requested: true,
  partner_invite: false,
};

async function getSetting(supabase: ReturnType<typeof getAdminClient>, key: string) {
  const { data } = await (supabase.from("app_settings") as any)
    .select("value")
    .eq("key", key)
    .single();
  if (!data?.value) return null;
  return typeof data.value === "string" ? JSON.parse(data.value) : data.value;
}

async function setSetting(supabase: ReturnType<typeof getAdminClient>, key: string, value: unknown) {
  const { data, error } = await (supabase.from("app_settings") as any)
    .upsert({
      key,
      value: JSON.stringify(value),
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" })
    .select("value")
    .single();
  if (error) throw error;
  return typeof data.value === "string" ? JSON.parse(data.value) : data.value;
}

// GET: Fetch app settings
export async function GET() {
  const admin = await verifyAdminOrManager();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = getAdminClient();
  const triggers = (await getSetting(supabase, "email_triggers")) || DEFAULT_TRIGGERS;
  const suspendedCountries = (await getSetting(supabase, "suspended_shipping_countries")) || [];

  return NextResponse.json({ email_triggers: triggers, suspended_shipping_countries: suspendedCountries });
}

// PATCH: Update app settings
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdminOrManager();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  const supabase = getAdminClient();
  const result: Record<string, unknown> = {};

  if (body.email_triggers && typeof body.email_triggers === "object") {
    result.email_triggers = await setSetting(supabase, "email_triggers", body.email_triggers);
  }

  if (Array.isArray(body.suspended_shipping_countries)) {
    result.suspended_shipping_countries = await setSetting(supabase, "suspended_shipping_countries", body.suspended_shipping_countries);
  }

  return NextResponse.json(result);
}

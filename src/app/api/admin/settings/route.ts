import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

async function verifyAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("is_admin")
    .eq("id", user.id)
    .single();

  return profile?.is_admin ? user : null;
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET: Fetch app settings
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const supabase = getAdminClient();
  const { data } = await supabase
    .from("app_settings")
    .select("email_triggers")
    .eq("id", "default")
    .single();

  return NextResponse.json({
    email_triggers: data?.email_triggers || {
      campaign_assigned: true,
      content_approved: true,
      revision_requested: true,
      partner_invite: false,
    },
  });
}

// PATCH: Update app settings
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json();
  const { email_triggers } = body;

  if (!email_triggers || typeof email_triggers !== "object") {
    return NextResponse.json({ error: "email_triggers required" }, { status: 400 });
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase
    .from("app_settings")
    .update({
      email_triggers,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default")
    .select("email_triggers")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ email_triggers: data.email_triggers });
}

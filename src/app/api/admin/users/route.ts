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
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET: Fetch all users (admin + partner) with last sign-in
export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const adminClient = getAdminClient();

  // Fetch admin/employee profiles
  const { data: profiles } = await adminClient.from("profiles").select("*").order("created_at", { ascending: false });

  // Fetch auth users for last_sign_in_at
  const { data: authData } = await adminClient.auth.admin.listUsers({ perPage: 200 });
  const authUsers = authData?.users || [];
  const authMap = new Map(authUsers.map(u => [u.id, u]));

  const enrichedProfiles = (profiles || []).map((p: any) => {
    const authUser = authMap.get(p.id);
    return {
      ...p,
      last_sign_in: authUser?.last_sign_in_at || null,
      role_meta: authUser?.user_metadata?.role || null,
    };
  });

  // Fetch partner/creator users
  const { data: creators } = await adminClient
    .from("creators")
    .select("id, creator_name, email, user_id, status, onboarded_at")
    .order("onboarded_at", { ascending: false });

  const enrichedCreators = (creators || []).map((c: any) => {
    const authUser = authMap.get(c.user_id);
    return {
      ...c,
      last_sign_in: authUser?.last_sign_in_at || null,
    };
  });

  return NextResponse.json({ profiles: enrichedProfiles, creators: enrichedCreators });
}

// DELETE: Remove a user
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { userId, type } = await request.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // Prevent self-deletion
  if (userId === admin.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const adminClient = getAdminClient();

  if (type === "creator") {
    // Delete creator record, then auth user
    const { data: creator } = await adminClient.from("creators").select("user_id").eq("id", userId).single();
    if (creator?.user_id) {
      await adminClient.from("creators").delete().eq("id", userId);
      await adminClient.auth.admin.deleteUser(creator.user_id);
    }
  } else {
    // Delete profile, then auth user
    await adminClient.from("profiles").delete().eq("id", userId);
    await adminClient.auth.admin.deleteUser(userId);
  }

  return NextResponse.json({ success: true });
}

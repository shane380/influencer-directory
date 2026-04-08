import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";

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

  const enrichedProfiles = (profiles || [])
    .map((p: any) => {
      const authUser = authMap.get(p.id);
      return {
        ...p,
        last_sign_in: authUser?.last_sign_in_at || null,
        role_meta: authUser?.user_metadata?.role || null,
      };
    })
    .filter((p: any) => p.role_meta !== "creator");

  // Fetch partner/creator users
  const { data: creators } = await adminClient
    .from("creators")
    .select("id, creator_name, email, user_id, status, onboarded_at, last_active_at, login_count")
    .order("onboarded_at", { ascending: false });

  const enrichedCreators = (creators || []).map((c: any) => {
    return {
      ...c,
      last_sign_in: c.last_active_at || null,
      sign_in_count: c.login_count || null,
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

// PATCH: Update a user's role
export async function PATCH(request: NextRequest) {
  // Only admins (not managers) can change roles
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const adminClient = getAdminClient();

  // Verify the caller is specifically an admin (not just a manager)
  const { data: callerProfile } = await adminClient.from("profiles").select("is_admin").eq("id", admin.id).single();
  if (!callerProfile?.is_admin) {
    return NextResponse.json({ error: "Only admins can change roles" }, { status: 403 });
  }

  const { userId, role } = await request.json();
  if (!userId || !role) return NextResponse.json({ error: "userId and role required" }, { status: 400 });

  if (!["admin", "manager", "member"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // Prevent changing your own role
  if (userId === admin.id) {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 400 });
  }

  const updateData = {
    is_admin: role === "admin",
    is_manager: role === "manager",
  };

  const { error } = await adminClient.from("profiles").update(updateData).eq("id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

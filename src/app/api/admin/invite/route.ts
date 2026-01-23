import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { email, displayName } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Verify the requester is an admin
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await (supabase.from("profiles") as any)
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Use service role to invite user
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if user already exists
    const { data: existingUsers } = await adminClient
      .from("profiles")
      .select("email")
      .eq("email", email);

    if (existingUsers && existingUsers.length > 0) {
      return NextResponse.json(
        { error: "A user with this email already exists" },
        { status: 400 }
      );
    }

    // Invite user via Supabase Auth
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        display_name: displayName,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login`,
    });

    if (inviteError) {
      console.error("Invite error:", inviteError);
      return NextResponse.json(
        { error: inviteError.message || "Failed to send invite" },
        { status: 400 }
      );
    }

    // Create profile for the invited user
    if (inviteData.user) {
      await adminClient.from("profiles").upsert({
        id: inviteData.user.id,
        email: email,
        display_name: displayName || email.split("@")[0],
        is_admin: false,
      });
    }

    return NextResponse.json({ success: true, message: `Invite sent to ${email}` });
  } catch (error: any) {
    console.error("Invite error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send invite" },
      { status: 500 }
    );
  }
}

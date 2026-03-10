import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";

export async function POST(request: NextRequest) {
  try {
    // Verify the requester is an authenticated admin
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await (supabase.from("profiles") as any)
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const { to, subject, html } = await request.json();

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: "to, subject, and html are required" },
        { status: 400 }
      );
    }

    const data = await sendEmail({ to, subject, html });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to send email";
    console.error("Email send error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

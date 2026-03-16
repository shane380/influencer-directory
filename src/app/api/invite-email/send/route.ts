import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { inviteEmail } from "@/lib/email-templates";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await (supabase.from("profiles") as any)
      .select("is_admin, is_manager")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin && !profile?.is_manager) {
      return NextResponse.json(
        { error: "Admin or manager access required" },
        { status: 403 }
      );
    }

    const { firstName, inviteUrl, recipientEmail } = await request.json();

    if (!recipientEmail || !inviteUrl) {
      return NextResponse.json(
        { error: "recipientEmail and inviteUrl are required" },
        { status: 400 }
      );
    }

    const { subject, html } = await inviteEmail({
      firstName: firstName || "there",
      inviteUrl,
      recipientEmail,
    });

    const data = await sendEmail({ to: recipientEmail, subject, html });

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to send invite email";
    console.error("Invite email send error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

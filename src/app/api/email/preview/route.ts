import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendEmail, renderEmailTemplate } from "@/lib/email";

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "");
}

function bodyToHtml(body: string, vars: Record<string, string>): string {
  const text = replacePlaceholders(body, vars);
  const paragraphs = text.split("\n\n").filter((p) => p.trim());
  return paragraphs
    .map((p) => {
      const html = p.trim().replace(/\n/g, "<br />");
      return `<p style="margin:0 0 16px;">${html}</p>`;
    })
    .join("\n");
}

const SAMPLE_VARS: Record<string, string> = {
  firstName: "Sarah",
  campaignName: "Summer Collection 2026",
  description: "We're launching our new summer line and would love your creative take on styling these pieces.",
  feedback: "Love the concept! Could you reshoot the second clip with natural lighting? The indoor shots were a bit dark.",
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await (supabase.from("profiles") as any)
      .select("is_admin, is_manager")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin && !profile?.is_manager) {
      return NextResponse.json({ error: "Access required" }, { status: 403 });
    }

    const { to, template } = await request.json() as {
      to: string;
      template: { subject: string; heading: string; body: string; ctaText: string };
    };

    if (!to || !template) {
      return NextResponse.json({ error: "to and template are required" }, { status: 400 });
    }

    // Use the recipient's first name from the "to" address prefix, or the logged-in user's name
    const senderName = (user.user_metadata?.full_name || user.email?.split("@")[0] || "").split(" ")[0];
    const vars = { ...SAMPLE_VARS, firstName: senderName || SAMPLE_VARS.firstName };

    const subject = replacePlaceholders(template.subject, vars) + " [PREVIEW]";
    const html = renderEmailTemplate({
      preheader: "This is a preview email",
      heading: replacePlaceholders(template.heading, vars),
      bodyHtml: bodyToHtml(template.body, vars),
      ctaText: template.ctaText + " \u2192",
      ctaUrl: "https://creators.namaclo.com/creator/dashboard",
    });

    const data = await sendEmail({ to, subject, html });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send preview";
    console.error("Preview email error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

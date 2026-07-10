import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";
import {
  sendEmail,
  renderEmailTemplate,
  replacePlaceholders,
  bodyToHtml,
} from "@/lib/email";
import { getUnsubscribeUrl } from "@/lib/unsubscribe";

export const maxDuration = 60;

// Resend allows 2 requests/sec by default; keep chunks small and pace sends
const MAX_RECIPIENTS_PER_REQUEST = 10;
const SEND_DELAY_MS = 550;

interface BlastContent {
  subject: string;
  heading: string;
  body: string;
  ctaText?: string;
  ctaUrl?: string;
}

function buildEmail(content: BlastContent, firstName: string, email: string) {
  const vars = { firstName };
  return {
    subject: replacePlaceholders(content.subject, vars),
    html: renderEmailTemplate({
      heading: replacePlaceholders(content.heading, vars),
      bodyHtml: bodyToHtml(content.body, vars),
      ctaText: content.ctaText?.trim() || undefined,
      ctaUrl: content.ctaUrl?.trim() || undefined,
      unsubscribeUrl: getUnsubscribeUrl(email),
    }),
  };
}

export async function GET() {
  const user = await verifyAdmin();
  if (!user) {
    return NextResponse.json({ error: "Admin or manager access required" }, { status: 403 });
  }

  const adminClient = getAdminClient();
  const { data: creators, error } = await adminClient
    .from("creators")
    .select("id, creator_name, email, status, notification_preferences")
    .eq("status", "active")
    .not("email", "is", null)
    .order("creator_name");

  if (error) {
    return NextResponse.json({ error: "Failed to load partners" }, { status: 500 });
  }

  const recipients = (creators || []).map((c: any) => ({
    id: c.id,
    name: c.creator_name,
    email: c.email,
    unsubscribed: c.notification_preferences?.email_campaigns === false,
  }));

  // Blast history is best-effort: the log tables may not exist yet
  let blasts: any[] = [];
  try {
    const { data } = await adminClient
      .from("email_blasts")
      .select("id, subject, created_at, email_blast_recipients(status)")
      .order("created_at", { ascending: false })
      .limit(10);
    blasts = (data || []).map((b: any) => ({
      id: b.id,
      subject: b.subject,
      created_at: b.created_at,
      sent: (b.email_blast_recipients || []).filter((r: any) => r.status === "sent").length,
      failed: (b.email_blast_recipients || []).filter((r: any) => r.status !== "sent").length,
    }));
  } catch {}

  return NextResponse.json({ recipients, blasts });
}

export async function POST(request: NextRequest) {
  const user = await verifyAdmin();
  if (!user) {
    return NextResponse.json({ error: "Admin or manager access required" }, { status: 403 });
  }

  try {
    const payload = await request.json();
    const content: BlastContent = {
      subject: payload.subject,
      heading: payload.heading,
      body: payload.body,
      ctaText: payload.ctaText,
      ctaUrl: payload.ctaUrl,
    };

    if (!content.subject?.trim() || !content.heading?.trim() || !content.body?.trim()) {
      return NextResponse.json(
        { error: "subject, heading, and body are required" },
        { status: 400 }
      );
    }

    // Test mode: send a single email to the given address with a [TEST] marker
    if (payload.test) {
      const to = String(payload.to || "").trim();
      if (!to) {
        return NextResponse.json({ error: "to is required for a test send" }, { status: 400 });
      }
      const firstName = (user.user_metadata?.full_name || to.split("@")[0]).split(" ")[0];
      const { subject, html } = buildEmail(content, firstName, to);
      await sendEmail({ to, subject: `[TEST] ${subject}`, html });
      return NextResponse.json({ success: true });
    }

    const creatorIds: string[] = Array.isArray(payload.creatorIds) ? payload.creatorIds : [];
    if (creatorIds.length === 0) {
      return NextResponse.json({ error: "creatorIds is required" }, { status: 400 });
    }
    if (creatorIds.length > MAX_RECIPIENTS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Send at most ${MAX_RECIPIENTS_PER_REQUEST} recipients per request` },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    const { data: creators, error: fetchError } = await adminClient
      .from("creators")
      .select("id, creator_name, email, status, notification_preferences")
      .in("id", creatorIds);

    if (fetchError) {
      return NextResponse.json({ error: "Failed to load recipients" }, { status: 500 });
    }

    // First chunk creates the blast log row; later chunks reuse its id.
    // Logging is best-effort so sends still work before the tables exist.
    let blastId: string | null = payload.blastId || null;
    if (!blastId) {
      try {
        const { data: blast } = await (adminClient.from("email_blasts") as any)
          .insert({
            subject: content.subject,
            heading: content.heading,
            body: content.body,
            cta_text: content.ctaText || null,
            cta_url: content.ctaUrl || null,
            sent_by: user.id,
          })
          .select("id")
          .single();
        blastId = blast?.id || null;
      } catch {}
    }

    const results: { creatorId: string; email: string; status: string; error?: string }[] = [];

    for (const creator of (creators || []) as any[]) {
      if (creator.status !== "active" || !creator.email) {
        results.push({ creatorId: creator.id, email: creator.email || "", status: "skipped", error: "Not an active partner" });
        continue;
      }
      if (creator.notification_preferences?.email_campaigns === false) {
        results.push({ creatorId: creator.id, email: creator.email, status: "skipped", error: "Unsubscribed from campaign emails" });
        continue;
      }

      const firstName = (creator.creator_name || "there").split(" ")[0];
      const { subject, html } = buildEmail(content, firstName, creator.email);

      try {
        await sendEmail({ to: creator.email, subject, html });
        results.push({ creatorId: creator.id, email: creator.email, status: "sent" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Send failed";
        results.push({ creatorId: creator.id, email: creator.email, status: "failed", error: message });
      }

      await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
    }

    if (blastId) {
      try {
        await (adminClient.from("email_blast_recipients") as any).insert(
          results.map((r) => ({
            blast_id: blastId,
            creator_id: r.creatorId,
            email: r.email,
            status: r.status,
            error: r.error || null,
          }))
        );
      } catch {}
    }

    return NextResponse.json({ blastId, results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send blast";
    console.error("Email blast error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";
import { sendEmail } from "@/lib/email";
import {
  BLAST_AUDIENCES,
  CAMPAIGN_BLAST_FIELDS,
  blastVars,
  buildBlastEmail,
  filterAudience,
  loadCampaignRecipients,
  processBlast,
  type BlastAudience,
  type BlastCampaign,
  type BlastContent,
} from "@/lib/campaign-blast";

// Admin/manager-only: email the people in a campaign, now or at a scheduled
// time. Scheduled blasts are sent by /api/cron/send-scheduled-blasts.

export const maxDuration = 300;
// Leave headroom under maxDuration; anything unsent is finished by the cron.
const SEND_BUDGET_MS = 240_000;

const MIGRATION_HINT =
  "Scheduling tables are not set up yet — run migration 20261126000000_campaign_email_blasts.sql first.";

type Params = { params: Promise<{ id: string }> };

async function loadCampaign(admin: ReturnType<typeof getAdminClient>, id: string) {
  const { data } = await admin.from("campaigns").select(CAMPAIGN_BLAST_FIELDS).eq("id", id).single();
  return (data as BlastCampaign | null) || null;
}

function parseContent(payload: any): { content?: BlastContent; error?: string } {
  const content: BlastContent = {
    subject: String(payload.subject || "").trim(),
    heading: String(payload.heading || "").trim(),
    body: String(payload.body || "").trim(),
    ctaText: String(payload.ctaText || "").trim() || null,
    ctaUrl: String(payload.ctaUrl || "").trim() || null,
  };
  if (!content.subject || !content.heading || !content.body) {
    return { error: "Subject, heading, and body are required" };
  }
  if (!!content.ctaText !== !!content.ctaUrl) {
    return { error: "A button needs both text and a link" };
  }
  if (content.ctaUrl) {
    try {
      const url = new URL(content.ctaUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      content.ctaUrl = url.toString();
    } catch {
      return { error: "Button link must be a full https:// URL" };
    }
  }
  return { content };
}

export async function GET(_request: NextRequest, { params }: Params) {
  const user = await verifyAdmin();
  if (!user) {
    return NextResponse.json({ error: "Admin or manager access required" }, { status: 403 });
  }
  const { id } = await params;
  const admin = getAdminClient();
  const campaign = await loadCampaign(admin, id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const recipients = await loadCampaignRecipients(admin, id);

  // Fails until the migration is applied; the dialog then says so.
  const { data: blastRows, error: blastError } = await admin
    .from("email_blasts")
    .select("id, subject, audience, status, scheduled_for, sent_at, created_at, email_blast_recipients(status)")
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  const blasts = (blastRows || []).map((b: any) => ({
    id: b.id,
    subject: b.subject,
    audience: b.audience,
    status: b.status,
    scheduled_for: b.scheduled_for,
    sent_at: b.sent_at,
    created_at: b.created_at,
    sent: (b.email_blast_recipients || []).filter((r: any) => r.status === "sent").length,
    failed: (b.email_blast_recipients || []).filter((r: any) => r.status === "failed").length,
    skipped: (b.email_blast_recipients || []).filter((r: any) => r.status === "skipped").length,
  }));

  return NextResponse.json({
    vars: blastVars(campaign, ""),
    eventMode: !!campaign.gift_event_mode,
    recipients,
    blasts,
    ready: !blastError,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await verifyAdmin();
  if (!user) {
    return NextResponse.json({ error: "Admin or manager access required" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const payload = await request.json();
    const { content, error: contentError } = parseContent(payload);
    if (!content) {
      return NextResponse.json({ error: contentError }, { status: 400 });
    }

    const admin = getAdminClient();
    const campaign = await loadCampaign(admin, id);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const senderName = String(user.user_metadata?.full_name || user.email || "").split("@")[0];

    if (payload.action === "preview") {
      const name = String(payload.previewName || "") || senderName;
      return NextResponse.json(buildBlastEmail(content, campaign, name, user.email || "preview@example.com"));
    }

    if (payload.action === "test") {
      const to = String(payload.to || "").trim();
      if (!to) {
        return NextResponse.json({ error: "Enter an address for the test send" }, { status: 400 });
      }
      const { subject, html } = buildBlastEmail(content, campaign, senderName, to);
      await sendEmail({ to, subject: `[TEST] ${subject}`, html });
      return NextResponse.json({ success: true });
    }

    if (payload.action !== "send") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const audience = payload.audience as BlastAudience;
    if (!BLAST_AUDIENCES.includes(audience)) {
      return NextResponse.json({ error: "Choose who to send to" }, { status: 400 });
    }
    const recipientIds: string[] =
      audience === "selected" && Array.isArray(payload.recipientIds) ? payload.recipientIds.map(String) : [];

    let scheduledFor: Date | null = null;
    if (payload.scheduledFor) {
      scheduledFor = new Date(payload.scheduledFor);
      if (Number.isNaN(scheduledFor.getTime())) {
        return NextResponse.json({ error: "Invalid schedule time" }, { status: 400 });
      }
      if (scheduledFor.getTime() < Date.now() + 60_000) {
        return NextResponse.json({ error: "Schedule time must be in the future" }, { status: 400 });
      }
    }

    // A send-now with nobody reachable is a mistake. A scheduled one may be
    // waiting on people who haven't joined the audience yet, so it is allowed.
    if (!scheduledFor) {
      const reachable = filterAudience(await loadCampaignRecipients(admin, id), audience, recipientIds).filter(
        (r) => r.email && !r.unsubscribed,
      );
      if (reachable.length === 0) {
        return NextResponse.json({ error: "Nobody in that audience can be emailed" }, { status: 400 });
      }
    } else if (audience === "selected" && recipientIds.length === 0) {
      return NextResponse.json({ error: "No recipients selected" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: blast, error: insertError } = await admin
      .from("email_blasts")
      .insert({
        subject: content.subject,
        heading: content.heading,
        body: content.body,
        cta_text: content.ctaText,
        cta_url: content.ctaUrl,
        sent_by: user.id,
        campaign_id: id,
        audience,
        recipient_ids: audience === "selected" ? recipientIds : null,
        status: scheduledFor ? "scheduled" : "sending",
        scheduled_for: scheduledFor ? scheduledFor.toISOString() : now,
        started_at: scheduledFor ? null : now,
      })
      .select("*")
      .single();
    if (insertError || !blast) {
      console.error("Campaign blast insert error:", insertError?.message);
      return NextResponse.json({ error: MIGRATION_HINT }, { status: 500 });
    }

    if (scheduledFor) {
      return NextResponse.json({ scheduled: true, blastId: blast.id });
    }

    const { done, results } = await processBlast(admin, blast, SEND_BUDGET_MS);
    return NextResponse.json({ blastId: blast.id, done, results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send";
    console.error("Campaign blast error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Cancel a blast that is still waiting to send.
export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await verifyAdmin();
  if (!user) {
    return NextResponse.json({ error: "Admin or manager access required" }, { status: 403 });
  }
  const { id } = await params;
  const blastId = request.nextUrl.searchParams.get("blastId");
  if (!blastId) {
    return NextResponse.json({ error: "blastId is required" }, { status: 400 });
  }

  // Conditional on status so a blast the cron has already claimed can't be
  // "cancelled" while it is going out.
  const { data, error } = await getAdminClient()
    .from("email_blasts")
    .update({ status: "cancelled" })
    .eq("id", blastId)
    .eq("campaign_id", id)
    .eq("status", "scheduled")
    .select("id");
  if (error) {
    return NextResponse.json({ error: "Failed to cancel" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "That email has already started sending" }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}

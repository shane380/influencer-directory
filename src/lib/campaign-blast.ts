import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail, renderEmailTemplate, replacePlaceholders, bodyToHtml } from "@/lib/email";
import { getUnsubscribeUrl } from "@/lib/unsubscribe";
import { formatGiftEventTime } from "@/lib/gift";

// Campaign email blasts: one-off emails to the people in a campaign (event
// confirmations, reminders), sent now or queued for the cron to send later.
// Shared by the admin route and /api/cron/send-scheduled-blasts.

export type BlastAudience = "all" | "submitted" | "not_submitted" | "selected";
export const BLAST_AUDIENCES: BlastAudience[] = ["all", "submitted", "not_submitted", "selected"];

export interface BlastContent {
  subject: string;
  heading: string;
  body: string;
  ctaText?: string | null;
  ctaUrl?: string | null;
}

export interface BlastCampaign {
  id: string;
  name: string;
  start_date: string | null;
  gift_event_mode: boolean | null;
  gift_event_time: string | null;
  gift_event_location: string | null;
}

export interface BlastRecipient {
  influencerId: string;
  name: string;
  email: string | null;
  submitted: boolean;
  unsubscribed: boolean;
}

export interface BlastResult {
  influencerId: string;
  email: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
}

// Resend allows 2 requests/sec by default.
const SEND_DELAY_MS = 550;
// A blast left in "sending" this long was cut off mid-run (function timeout,
// deploy) and is safe for the cron to pick back up. Must exceed the longest
// route maxDuration (300s) so two runs never overlap.
export const STALE_SENDING_MS = 10 * 60 * 1000;

export const CAMPAIGN_BLAST_FIELDS =
  "id, name, start_date, gift_event_mode, gift_event_time, gift_event_location";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// "2026-12-09" → "Wednesday, December 9". Parsed as calendar parts so the
// server's timezone can't shift the day.
export function formatEventDate(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!m) return "";
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function blastVars(campaign: BlastCampaign, recipientName: string): Record<string, string> {
  return {
    firstName: (recipientName || "").trim().split(/\s+/)[0] || "there",
    campaignName: campaign.name || "",
    eventDate: formatEventDate(campaign.start_date),
    eventTime: formatGiftEventTime(campaign.gift_event_time) || "",
    // A blank line would split the address into separate paragraphs.
    eventLocation: (campaign.gift_event_location || "").trim().replace(/\n{2,}/g, "\n"),
  };
}

export function buildBlastEmail(
  content: BlastContent,
  campaign: BlastCampaign,
  recipientName: string,
  email: string,
): { subject: string; html: string } {
  const vars = blastVars(campaign, recipientName);
  // Names and locations can come from public forms; the subject is plain text
  // but everything that lands in the HTML is escaped.
  const htmlVars = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, escapeHtml(v)]));
  const ctaText = content.ctaText?.trim();
  const ctaUrl = content.ctaUrl?.trim();
  return {
    subject: replacePlaceholders(content.subject, vars),
    html: renderEmailTemplate({
      heading: replacePlaceholders(content.heading, htmlVars),
      bodyHtml: bodyToHtml(content.body, htmlVars),
      ctaText: ctaText && ctaUrl ? escapeHtml(replacePlaceholders(ctaText, vars)) : undefined,
      ctaUrl: ctaText && ctaUrl ? ctaUrl : undefined,
      unsubscribeUrl: getUnsubscribeUrl(email),
    }),
  };
}

// Everyone in the campaign, flagged so the UI and the sender agree on who is
// reachable. Unsubscribes live on `creators` (that is what /api/unsubscribe
// writes), matched here by email.
export async function loadCampaignRecipients(
  admin: SupabaseClient,
  campaignId: string,
): Promise<BlastRecipient[]> {
  const { data, error } = await admin
    .from("campaign_influencers")
    .select("influencer_id, gift_submitted_at, influencers!inner(name, email)")
    .eq("campaign_id", campaignId);
  if (error) throw new Error("Failed to load campaign recipients");

  const rows = (data || []).map((row: any) => {
    const inf = Array.isArray(row.influencers) ? row.influencers[0] : row.influencers;
    return {
      influencerId: row.influencer_id as string,
      name: String(inf?.name || ""),
      email: (String(inf?.email || "").trim() || null) as string | null,
      submitted: !!row.gift_submitted_at,
      unsubscribed: false,
    };
  });

  const emails = Array.from(
    new Set(rows.flatMap((r) => (r.email ? [r.email, r.email.toLowerCase()] : []))),
  );
  if (emails.length > 0) {
    const { data: creators } = await admin
      .from("creators")
      .select("email, notification_preferences")
      .in("email", emails);
    const optedOut = new Set(
      (creators || [])
        .filter((c: any) => c.notification_preferences?.email_campaigns === false)
        .map((c: any) => String(c.email || "").toLowerCase()),
    );
    for (const r of rows) {
      if (r.email && optedOut.has(r.email.toLowerCase())) r.unsubscribed = true;
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export function filterAudience(
  recipients: BlastRecipient[],
  audience: BlastAudience,
  recipientIds: string[] | null | undefined,
): BlastRecipient[] {
  if (audience === "submitted") return recipients.filter((r) => r.submitted);
  if (audience === "not_submitted") return recipients.filter((r) => !r.submitted);
  if (audience === "selected") {
    const ids = new Set(recipientIds || []);
    return recipients.filter((r) => ids.has(r.influencerId));
  }
  return recipients;
}

// Sends a blast that the caller has already claimed (status = 'sending').
// Recipients are resolved now, not when the blast was scheduled, so someone
// who joins the audience in between still gets the email. Every attempt is
// logged as it happens, which is what makes a cut-off run resumable: anyone
// already in the log is skipped next time.
export async function processBlast(
  admin: SupabaseClient,
  blast: any,
  budgetMs: number,
): Promise<{ done: boolean; results: BlastResult[] }> {
  const startedAt = Date.now();
  const results: BlastResult[] = [];

  const { data: campaign } = await admin
    .from("campaigns")
    .select(CAMPAIGN_BLAST_FIELDS)
    .eq("id", blast.campaign_id)
    .single();
  if (!campaign) throw new Error("Campaign not found");

  const recipients = filterAudience(
    await loadCampaignRecipients(admin, blast.campaign_id),
    blast.audience as BlastAudience,
    blast.recipient_ids,
  );

  const { data: logged } = await admin
    .from("email_blast_recipients")
    .select("influencer_id, email")
    .eq("blast_id", blast.id);
  const doneIds = new Set((logged || []).map((r: any) => r.influencer_id));
  const doneEmails = new Set((logged || []).map((r: any) => String(r.email || "").toLowerCase()).filter(Boolean));

  const content: BlastContent = {
    subject: blast.subject,
    heading: blast.heading,
    body: blast.body,
    ctaText: blast.cta_text,
    ctaUrl: blast.cta_url,
  };

  let done = true;
  for (const r of recipients) {
    if (doneIds.has(r.influencerId)) continue;
    if (Date.now() - startedAt > budgetMs) {
      done = false;
      break;
    }

    let result: BlastResult;
    let sent = false;
    if (!r.email) {
      result = { influencerId: r.influencerId, email: "", status: "skipped", error: "No email on file" };
    } else if (r.unsubscribed) {
      result = { influencerId: r.influencerId, email: r.email, status: "skipped", error: "Unsubscribed from emails" };
    } else if (doneEmails.has(r.email.toLowerCase())) {
      result = { influencerId: r.influencerId, email: r.email, status: "skipped", error: "Duplicate email address" };
    } else {
      try {
        const { subject, html } = buildBlastEmail(content, campaign as BlastCampaign, r.name, r.email);
        await sendEmail({ to: r.email, subject, html });
        result = { influencerId: r.influencerId, email: r.email, status: "sent" };
      } catch (err) {
        result = {
          influencerId: r.influencerId,
          email: r.email,
          status: "failed",
          error: err instanceof Error ? err.message : "Send failed",
        };
      }
      sent = true;
      doneEmails.add(r.email.toLowerCase());
    }

    await admin.from("email_blast_recipients").insert({
      blast_id: blast.id,
      influencer_id: result.influencerId,
      email: result.email,
      status: result.status,
      error: result.error || null,
    });
    results.push(result);
    if (sent) await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS));
  }

  if (done) {
    await admin
      .from("email_blasts")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", blast.id);
  }
  return { done, results };
}

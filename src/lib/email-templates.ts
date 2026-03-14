import { renderEmailTemplate } from "./email";
import { getEmailTemplate } from "./app-settings";
import { getUnsubscribeUrl } from "./unsubscribe";

function replacePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || "");
}

// Default templates — used when no DB override exists
const DEFAULTS = {
  campaign_assigned: {
    subject: "You have a new campaign brief",
    heading: "New Campaign Brief",
    body: "Hi {{firstName}},\n\nA new campaign has been assigned to you: {{campaignName}}\n\n{{description}}\n\nHead to your dashboard to view the full brief and confirm your participation.",
    ctaText: "View Campaign",
  },
  content_approved: {
    subject: "Your content has been approved",
    heading: "Content Approved",
    body: "Hi {{firstName}},\n\nGreat news! Your content submission for {{campaignName}} has been approved.\n\nThank you for your work on this campaign.",
    ctaText: "View Details",
  },
  revision_requested: {
    subject: "Revision requested on your submission",
    heading: "Revision Requested",
    body: "Hi {{firstName}},\n\nA revision has been requested on your content submission for {{campaignName}}.\n\n{{feedback}}\n\nPlease review the feedback and resubmit your content.",
    ctaText: "View Details",
  },
  partner_invite: {
    subject: "You've been invited to join Nama Partners",
    heading: "You're Invited",
    body: "Hi {{firstName}},\n\nWe'd love to partner with you. We've put together an offer based on your content and audience.\n\nQuestions? Reply to this email.",
    ctaText: "View Your Offer",
  },
};

export function getDefaultTemplates() {
  return DEFAULTS;
}

function bodyToHtml(body: string, vars: Record<string, string>): string {
  const text = replacePlaceholders(body, vars);
  // Convert newline-separated paragraphs to styled HTML
  const paragraphs = text.split("\n\n").filter((p) => p.trim());
  return paragraphs
    .map((p) => {
      const trimmed = p.trim();
      // Bold campaign names and key phrases
      const html = trimmed
        .replace(/\n/g, "<br />")
        .replace(vars.campaignName ? new RegExp(`(${escapeRegExp(vars.campaignName)})`, "g") : /(?!)/g, "<strong>$1</strong>");
      // Check if this looks like feedback content (from revision_requested)
      if (vars.feedback && trimmed === vars.feedback) {
        return `<div style="margin:0 0 16px;padding:12px 16px;background-color:#f9f9f9;border-left:3px solid #000000;font-size:14px;color:#333333;">${html}</div>`;
      }
      return `<p style="margin:0 0 16px;">${html}</p>`;
    })
    .join("\n");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function campaignAssignedEmail({
  firstName,
  campaignName,
  description,
  recipientEmail,
}: {
  firstName: string;
  campaignName: string;
  description?: string;
  recipientEmail: string;
}): Promise<{ subject: string; html: string }> {
  const override = await getEmailTemplate("campaign_assigned");
  const tmpl = { ...DEFAULTS.campaign_assigned, ...override };
  const vars: Record<string, string> = {
    firstName,
    campaignName,
    description: description || "",
  };

  return {
    subject: replacePlaceholders(tmpl.subject, vars),
    html: renderEmailTemplate({
      preheader: `New campaign: ${campaignName}`,
      heading: replacePlaceholders(tmpl.heading, vars),
      bodyHtml: bodyToHtml(tmpl.body, vars),
      ctaText: tmpl.ctaText + " \u2192",
      ctaUrl: "https://creators.namaclo.com/creator/dashboard?tab=campaigns",
      unsubscribeUrl: getUnsubscribeUrl(recipientEmail),
    }),
  };
}

export async function contentStatusEmail({
  firstName,
  campaignName,
  status,
  feedback,
  recipientEmail,
}: {
  firstName: string;
  campaignName: string;
  status: "approved" | "revision_requested";
  feedback?: string;
  recipientEmail: string;
}): Promise<{ subject: string; html: string }> {
  const templateKey = status === "approved" ? "content_approved" : "revision_requested";
  const override = await getEmailTemplate(templateKey);
  const tmpl = { ...DEFAULTS[templateKey], ...override };
  const vars: Record<string, string> = {
    firstName,
    campaignName,
    feedback: feedback || "",
  };

  return {
    subject: replacePlaceholders(tmpl.subject, vars),
    html: renderEmailTemplate({
      preheader: status === "approved"
        ? `Content approved for ${campaignName}`
        : `Revision needed for ${campaignName}`,
      heading: replacePlaceholders(tmpl.heading, vars),
      bodyHtml: bodyToHtml(tmpl.body, vars),
      ctaText: tmpl.ctaText + " \u2192",
      ctaUrl: "https://creators.namaclo.com/creator/dashboard?tab=campaigns",
      unsubscribeUrl: getUnsubscribeUrl(recipientEmail),
    }),
  };
}

export async function inviteEmail({
  firstName,
  inviteUrl,
  recipientEmail,
}: {
  firstName: string;
  inviteUrl: string;
  recipientEmail: string;
}): Promise<{ subject: string; html: string }> {
  const override = await getEmailTemplate("partner_invite");
  const tmpl = { ...DEFAULTS.partner_invite, ...override };
  const vars: Record<string, string> = { firstName };

  return {
    subject: replacePlaceholders(tmpl.subject, vars),
    html: renderEmailTemplate({
      preheader: "We'd love to partner with you.",
      heading: replacePlaceholders(tmpl.heading, vars),
      bodyHtml: bodyToHtml(tmpl.body, vars),
      ctaText: tmpl.ctaText + " \u2192",
      ctaUrl: inviteUrl,
      unsubscribeUrl: getUnsubscribeUrl(recipientEmail),
    }),
  };
}

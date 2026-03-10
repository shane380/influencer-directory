import { renderEmailTemplate } from "./email";

export function inviteEmail({
  firstName,
  inviteUrl,
}: {
  firstName: string;
  inviteUrl: string;
}): { subject: string; html: string } {
  return {
    subject: "You've been invited to join Nama Partners",
    html: renderEmailTemplate({
      preheader: "We'd love to partner with you.",
      heading: "You're Invited",
      bodyHtml: `
        <p style="margin:0 0 16px;">Hi ${firstName},</p>
        <p style="margin:0 0 16px;">We'd love to partner with you. We've put together an offer based on your content and audience.</p>
        <p style="margin:0 0 4px;font-size:13px;color:#999999;">Questions? Reply to this email.</p>
      `,
      ctaText: "View Your Offer \u2192",
      ctaUrl: inviteUrl,
    }),
  };
}

export function campaignAssignedEmail({
  firstName,
  campaignName,
  description,
}: {
  firstName: string;
  campaignName: string;
  description?: string;
}): { subject: string; html: string } {
  return {
    subject: "You have a new campaign brief",
    html: renderEmailTemplate({
      preheader: `New campaign: ${campaignName}`,
      heading: "New Campaign Brief",
      bodyHtml: `
        <p style="margin:0 0 16px;">Hi ${firstName},</p>
        <p style="margin:0 0 16px;">A new campaign has been assigned to you: <strong>${campaignName}</strong></p>
        ${description ? `<p style="margin:0 0 16px;color:#555555;">${description}</p>` : ""}
        <p style="margin:0;">Head to your dashboard to view the full brief and confirm your participation.</p>
      `,
      ctaText: "View Campaign \u2192",
      ctaUrl: "https://creators.namaclo.com/creator/dashboard",
    }),
  };
}

export function contentStatusEmail({
  firstName,
  campaignName,
  status,
  feedback,
}: {
  firstName: string;
  campaignName: string;
  status: "approved" | "revision_requested";
  feedback?: string;
}): { subject: string; html: string } {
  if (status === "approved") {
    return {
      subject: "Your content has been approved",
      html: renderEmailTemplate({
        preheader: `Content approved for ${campaignName}`,
        heading: "Content Approved",
        bodyHtml: `
          <p style="margin:0 0 16px;">Hi ${firstName},</p>
          <p style="margin:0 0 16px;">Great news! Your content submission for <strong>${campaignName}</strong> has been approved.</p>
          <p style="margin:0;">Thank you for your work on this campaign.</p>
        `,
        ctaText: "View Details \u2192",
        ctaUrl: "https://creators.namaclo.com/creator/dashboard",
      }),
    };
  }

  // revision_requested
  return {
    subject: "Revision requested on your submission",
    html: renderEmailTemplate({
      preheader: `Revision needed for ${campaignName}`,
      heading: "Revision Requested",
      bodyHtml: `
        <p style="margin:0 0 16px;">Hi ${firstName},</p>
        <p style="margin:0 0 16px;">A revision has been requested on your content submission for <strong>${campaignName}</strong>.</p>
        ${feedback ? `<div style="margin:0 0 16px;padding:12px 16px;background-color:#f9f9f9;border-left:3px solid #000000;font-size:14px;color:#333333;">${feedback}</div>` : ""}
        <p style="margin:0;">Please review the feedback and resubmit your content.</p>
      `,
      ctaText: "View Details \u2192",
      ctaUrl: "https://creators.namaclo.com/creator/dashboard",
    }),
  };
}

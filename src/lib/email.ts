import { Resend } from "resend";
import { getUnsubscribeUrl } from "./unsubscribe";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const unsubUrl = getUnsubscribeUrl(to);
  const { data, error } = await getResend().emails.send({
    from: "Nama Partners <partners@partners.namaclo.com>",
    to,
    subject,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });

  if (error) {
    console.error("Resend email error:", error);
    throw new Error(error.message || "Failed to send email");
  }

  return data;
}

export function renderEmailTemplate({
  preheader,
  heading,
  bodyHtml,
  ctaText,
  ctaUrl,
  unsubscribeUrl,
}: {
  preheader?: string;
  heading: string;
  bodyHtml: string;
  ctaText: string;
  ctaUrl: string;
  unsubscribeUrl?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${heading}</title>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap" rel="stylesheet" />
  <!--[if mso]>
  <style>
    * { font-family: Arial, Helvetica, sans-serif !important; }
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#ffffff;-webkit-font-smoothing:antialiased;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="https://creators.namaclo.com/nama-logo.png" alt="Nama" width="100" style="display:block;border:0;width:100px;height:auto;margin:0 auto;" />
              <div style="margin-top:4px;font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#999999;">Partners</div>
            </td>
          </tr>

          <!-- Heading -->
          <tr>
            <td style="padding-bottom:24px;">
              <h1 style="margin:0;font-family:'Playfair Display',Georgia,serif;font-size:24px;font-weight:600;color:#000000;line-height:1.3;text-align:center;">
                ${heading}
              </h1>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding-bottom:24px;">
              <hr style="border:none;border-top:1px solid #e5e5e5;margin:0;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding-bottom:32px;font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#333333;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- CTA Button -->
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <a href="${ctaUrl}" target="_blank" style="display:inline-block;background-color:#000000;color:#ffffff;font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:4px;letter-spacing:0.5px;">
                ${ctaText}
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding-bottom:24px;">
              <hr style="border:none;border-top:1px solid #e5e5e5;margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="font-family:'Helvetica Neue',Arial,Helvetica,sans-serif;font-size:13px;color:#999999;text-align:center;line-height:1.5;">
              <span style="font-family:'Playfair Display',Georgia,serif;font-weight:600;color:#666666;">Nama Partners</span>
              <br />
              <a href="https://creators.namaclo.com/creator/dashboard" target="_blank" style="color:#999999;text-decoration:underline;">
                Go to your dashboard &rarr;
              </a>
              ${unsubscribeUrl ? `<br /><br /><a href="${unsubscribeUrl}" target="_blank" style="color:#bbbbbb;text-decoration:underline;font-size:12px;">Unsubscribe from emails</a>` : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

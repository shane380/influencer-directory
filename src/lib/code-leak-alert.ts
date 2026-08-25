import { sendInternalEmail } from "./email";
import type { LeakSignal, Severity } from "./code-leak-scan";

/**
 * Digest email for affiliate-code leak findings.
 *
 * Sends only when a scan turns up something new. A clean fortnight sends
 * nothing — an alert that arrives every time stops being read.
 */

const SEVERITY_LABEL: Record<Severity, string> = {
  confirmed: "Confirmed leak",
  high: "Likely leak",
  medium: "Worth a look",
};

const SEVERITY_COLOR: Record<Severity, string> = {
  confirmed: "#b42318",
  high: "#b54708",
  medium: "#475467",
};

/**
 * Digest recipients, comma-separated. Set in Vercel and .env.local rather than
 * committed, so addresses stay out of the repo.
 */
export function leakAlertRecipients(): string[] {
  return (process.env.LEAK_ALERT_RECIPIENTS || "shane@namaclo.com")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Resolve codes to creator names so the digest reads like a person, not a token. */
export async function loadCodeOwners(db: any, codes: string[]): Promise<Map<string, string>> {
  const owners = new Map<string, string>();
  if (codes.length === 0) return owners;

  const { data: creators } = await (db.from("creators") as any)
    .select("creator_name, affiliate_code")
    .not("affiliate_code", "is", null);
  for (const c of creators || []) {
    if (c.affiliate_code && c.creator_name) {
      owners.set(String(c.affiliate_code).toUpperCase(), c.creator_name);
    }
  }

  try {
    const { data: legacy } = await (db.from("legacy_affiliates") as any)
      .select("name, discount_code")
      .not("discount_code", "is", null);
    for (const l of legacy || []) {
      const key = String(l.discount_code).toUpperCase();
      if (l.name && !owners.has(key)) owners.set(key, l.name);
    }
  } catch {
    // legacy_affiliates may not exist in all envs
  }

  return owners;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Stacked bar of the referrer split — the whole argument in one glance. */
function mixBar(mix: any): string {
  const t = mix?.window?.total || 0;
  if (!t) return "";
  const seg = (n: number, color: string, label: string) => {
    const w = Math.round((n / t) * 100);
    if (w <= 0) return "";
    return `<td style="width:${w}%;background:${color};color:#fff;font-size:10px;` +
      `text-align:center;padding:3px 0;white-space:nowrap;">${w >= 12 ? label : ""}</td>`;
  };
  const w = mix.window;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;` +
    `border-collapse:collapse;margin:8px 0;border-radius:3px;overflow:hidden;"><tr>` +
    seg(w.social, "#12b76a", "social") +
    seg(w.search, "#f79009", "search") +
    seg(w.coupon, "#b42318", "coupon") +
    seg(w.direct, "#98a2b3", "direct") +
    seg(w.other, "#d0d5dd", "other") +
    `</tr></table>`;
}

export function buildDigestHtml(opts: {
  signals: LeakSignal[];
  owners: Map<string, string>;
  windowStart: string;
  windowEnd: string;
  storeUrl: string | null;
  appUrl: string;
}): string {
  const { signals, owners, windowStart, windowEnd, storeUrl, appUrl } = opts;

  const cards = signals.map((s) => {
    const owner = owners.get(s.affiliate_code);
    const mix = s.evidence?.mix;
    const samples = (s.evidence?.samples || []) as Array<{
      order_id: number; created_at: string; referring_site: string | null;
    }>;

    const sampleRows = samples.map((o) => {
      const date = (o.created_at || "").slice(0, 10);
      const ref = o.referring_site ? esc(o.referring_site).slice(0, 60) : "(direct)";
      const link = storeUrl
        ? `https://${storeUrl}/admin/orders/${o.order_id}`
        : null;
      const cell = link
        ? `<a href="${link}" style="color:#1570ef;">#${o.order_id}</a>`
        : `#${o.order_id}`;
      return `<tr><td style="padding:2px 8px 2px 0;color:#667085;">${date}</td>` +
        `<td style="padding:2px 8px 2px 0;">${cell}</td>` +
        `<td style="padding:2px 0;color:#667085;word-break:break-all;">${ref}</td></tr>`;
    }).join("");

    return `
      <div style="border:1px solid #e4e7ec;border-left:3px solid ${SEVERITY_COLOR[s.severity]};
                  border-radius:6px;padding:14px 16px;margin:0 0 12px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:.4px;
                    color:${SEVERITY_COLOR[s.severity]};font-weight:700;">
          ${SEVERITY_LABEL[s.severity]}
        </div>
        <div style="font-size:17px;font-weight:700;margin:4px 0 2px;">
          ${esc(s.affiliate_code)}${owner ? ` <span style="font-weight:400;color:#667085;">· ${esc(owner)}</span>` : ""}
        </div>
        <div style="font-size:14px;color:#344054;margin:0 0 4px;">${esc(s.summary)}</div>
        ${mix ? mixBar(mix) : ""}
        ${sampleRows ? `<table style="font-size:12px;border-collapse:collapse;margin-top:6px;">${sampleRows}</table>` : ""}
      </div>`;
  }).join("");

  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
              max-width:640px;margin:0 auto;padding:24px;color:#101828;">
    <div style="font-size:20px;font-weight:700;margin:0 0 4px;">Affiliate code leak scan</div>
    <div style="font-size:13px;color:#667085;margin:0 0 20px;">
      ${signals.length} finding${signals.length === 1 ? "" : "s"} ·
      orders from ${windowStart} to ${windowEnd}
    </div>
    ${cards}
    <div style="margin:20px 0 0;">
      <a href="${appUrl}/partnerships/affiliate-codes"
         style="display:inline-block;background:#101828;color:#fff;text-decoration:none;
                padding:10px 18px;border-radius:6px;font-size:14px;">
        Review and resolve
      </a>
    </div>
    <div style="font-size:12px;color:#98a2b3;margin-top:20px;line-height:1.5;">
      A healthy creator code is redeemed by traffic arriving from Instagram. Redemptions
      arriving from search, direct, or a coupon site are people who got the code
      somewhere other than the creator.
    </div>
  </div>`;
}

/**
 * Send the digest. Returns the recipients mailed, or [] when there was nothing
 * new to say.
 *
 * Uses sendInternalEmail, not sendEmail: recipients here are staff, and several
 * of them also have `creators` rows. A creator-marketing unsubscribe link on an
 * ops alert would let one click blank their notification_preferences — or shut
 * off this alerting entirely.
 */
export async function sendLeakDigest(opts: {
  db: any;
  signals: LeakSignal[];
  windowStart: string;
  windowEnd: string;
  storeUrl: string | null;
}): Promise<string[]> {
  const { db, signals, windowStart, windowEnd, storeUrl } = opts;
  if (signals.length === 0) return [];

  const recipients = leakAlertRecipients();
  if (recipients.length === 0) return [];

  const owners = await loadCodeOwners(db, signals.map((s) => s.affiliate_code));
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://influencer-directory-self.vercel.app";

  const html = buildDigestHtml({ signals, owners, windowStart, windowEnd, storeUrl, appUrl });
  const confirmed = signals.filter((s) => s.severity === "confirmed").length;
  const subject =
    `[Nama Ops] ${signals.length} affiliate code${signals.length === 1 ? "" : "s"} flagged` +
    (confirmed ? ` — ${confirmed} confirmed leak${confirmed === 1 ? "" : "s"}` : "");

  const sent: string[] = [];
  for (const to of recipients) {
    try {
      await sendInternalEmail({ to, subject, html });
      sent.push(to);
    } catch (err: any) {
      // One bad address must not cost the other recipient their alert.
      console.error(`[code-leak-alert] send failed for a recipient: ${err?.message || err}`);
    }
  }
  return sent;
}

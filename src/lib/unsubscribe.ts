import crypto from "crypto";

const SECRET = process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-secret";

export function generateUnsubscribeToken(email: string): string {
  const hmac = crypto.createHmac("sha256", SECRET);
  hmac.update(email.toLowerCase());
  return hmac.digest("hex").slice(0, 32);
}

export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = generateUnsubscribeToken(email);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export function getUnsubscribeUrl(email: string): string {
  const token = generateUnsubscribeToken(email);
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://creators.namaclo.com";
  return `${base}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

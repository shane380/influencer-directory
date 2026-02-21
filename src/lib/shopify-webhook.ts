import crypto from "crypto";

export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string
): boolean {
  const secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!secret) {
    console.error("SHOPIFY_CLIENT_SECRET not configured");
    return false;
  }

  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(hmacHeader)
    );
  } catch {
    return false;
  }
}

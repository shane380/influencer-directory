import { NextRequest, NextResponse } from "next/server";

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;

export async function GET(request: NextRequest) {
  if (!SHOPIFY_STORE_URL || !SHOPIFY_CLIENT_ID) {
    return NextResponse.json(
      { error: "Shopify credentials not configured" },
      { status: 500 }
    );
  }

  // Get the host for the redirect URI
  const host = request.headers.get("host");
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const redirectUri = `${protocol}://${host}/api/shopify/auth/callback`;

  // Scopes needed for the integration
  const scopes = [
    "read_products",
    "read_customers",
    "write_customers",
    "read_draft_orders",
    "write_draft_orders",
    "read_inventory",
    "read_locations",
  ].join(",");

  // Build the authorization URL
  const authUrl = new URL(`https://${SHOPIFY_STORE_URL}/admin/oauth/authorize`);
  authUrl.searchParams.set("client_id", SHOPIFY_CLIENT_ID);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(authUrl.toString());
}

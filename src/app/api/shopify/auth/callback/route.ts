import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { clearTokenCache } from "@/lib/shopify";

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

export async function GET(request: NextRequest) {
  if (!SHOPIFY_STORE_URL || !SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Shopify credentials not configured" },
      { status: 500 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json(
      { error: "Authorization code not provided" },
      { status: 400 }
    );
  }

  try {
    // Exchange the authorization code for an access token
    const tokenResponse = await fetch(
      `https://${SHOPIFY_STORE_URL}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: SHOPIFY_CLIENT_ID,
          client_secret: SHOPIFY_CLIENT_SECRET,
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error("Token exchange error:", errorText);
      return NextResponse.json(
        { error: "Failed to exchange authorization code" },
        { status: 500 }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Store the access token in Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Upsert the token into a settings table
    const { error: upsertError } = await supabase
      .from("app_settings")
      .upsert(
        {
          key: "shopify_access_token",
          value: accessToken,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      );

    if (upsertError) {
      console.error("Error storing token:", upsertError);
      // If the table doesn't exist, we'll store it differently
      // For now, log the token so user can manually add it
      console.log("Access token (save this):", accessToken);
    }

    // Clear the token cache so the new token is used
    clearTokenCache();

    // Redirect to the main app with success message
    const host = request.headers.get("host");
    const protocol = process.env.NODE_ENV === "production" ? "https" : "http";

    return NextResponse.redirect(
      `${protocol}://${host}/?shopify_connected=true`
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.json(
      { error: "OAuth callback failed" },
      { status: 500 }
    );
  }
}

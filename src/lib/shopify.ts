import { createClient } from "@supabase/supabase-js";

let cachedToken: string | null = null;

export async function getShopifyAccessToken(): Promise<string | null> {
  // Return cached token if available
  if (cachedToken) {
    return cachedToken;
  }

  // Try to get from environment first (for backward compatibility)
  if (process.env.SHOPIFY_ACCESS_TOKEN && process.env.SHOPIFY_ACCESS_TOKEN !== "shpat_xxxxx") {
    cachedToken = process.env.SHOPIFY_ACCESS_TOKEN;
    return cachedToken;
  }

  // Get from Supabase
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "shopify_access_token")
      .single();

    if (error || !data) {
      console.error("Error fetching Shopify token:", error);
      return null;
    }

    cachedToken = data.value;
    return cachedToken;
  } catch (error) {
    console.error("Error getting Shopify token:", error);
    return null;
  }
}

export function getShopifyStoreUrl(): string | null {
  return process.env.SHOPIFY_STORE_URL || null;
}

export function clearTokenCache() {
  cachedToken = null;
}

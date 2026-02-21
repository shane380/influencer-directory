import { NextRequest, NextResponse } from "next/server";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

const WEBHOOK_TOPICS = [
  "orders/create",
  "orders/fulfilled",
  "fulfillments/update",
  "orders/cancelled",
];

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();

  if (!storeUrl || !accessToken) {
    return NextResponse.json(
      { error: "Shopify not configured" },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return NextResponse.json(
      { error: "NEXT_PUBLIC_APP_URL not configured" },
      { status: 500 }
    );
  }

  const results: { topic: string; success: boolean; error?: string }[] = [];

  for (const topic of WEBHOOK_TOPICS) {
    try {
      const response = await fetch(
        `https://${storeUrl}/admin/api/2024-01/webhooks.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            webhook: {
              topic,
              address: `${appUrl}/api/shopify/webhooks/orders`,
              format: "json",
            },
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        results.push({
          topic,
          success: false,
          error: JSON.stringify(errorData.errors || errorData),
        });
      } else {
        results.push({ topic, success: true });
      }
    } catch (error) {
      results.push({
        topic,
        success: false,
        error: String(error),
      });
    }
  }

  const allSuccess = results.every((r) => r.success);
  return NextResponse.json(
    { results },
    { status: allSuccess ? 200 : 207 }
  );
}

import { NextRequest, NextResponse } from "next/server";

// Webhook endpoint for Apify to call when a content scrape run completes.
// Delegates to the scrape-stories endpoint which handles all processing.
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();

    if (!payload?.resource?.defaultDatasetId) {
      return NextResponse.json(
        { error: "Invalid webhook payload" },
        { status: 400 }
      );
    }

    // Trigger the scrape endpoint to process results
    const origin = request.nextUrl.origin;
    const response = await fetch(`${origin}/api/content/scrape-stories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const result = await response.json();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return NextResponse.json(
      { error: `Webhook failed: ${err.message}` },
      { status: 500 }
    );
  }
}

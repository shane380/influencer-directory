import { NextRequest, NextResponse } from "next/server";
import { giftServiceClient } from "@/lib/gift-server";

// Marks the first open of a gift link. Idempotent, fire-and-forget from the
// page; always returns ok so it can't leak token validity via status codes.

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token && token.length >= 16 && token.length <= 64) {
    await giftServiceClient()
      .from("campaign_influencers")
      .update({ gift_viewed_at: new Date().toISOString() })
      .eq("gift_token", token)
      .is("gift_viewed_at", null);
  }
  return NextResponse.json({ ok: true });
}

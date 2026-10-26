import { NextRequest, NextResponse } from "next/server";
import { giftServiceClient } from "@/lib/gift-server";
import { GENUINE_OPEN_DELAY_MS } from "@/lib/gift";

// Marks the first open of a gift link. Idempotent, fire-and-forget from the
// page; always returns ok so it can't leak token validity via status codes.
//
// A load within GENUINE_OPEN_DELAY_MS of the invite is the sender (copying the
// link, previewing it, an email scanner), not the creator. Recording it would
// claim the one "first view" slot and lose the creator's real open, so loads
// inside that window are ignored.

export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (token && token.length >= 16 && token.length <= 64) {
    const now = Date.now();
    const invitedBefore = new Date(now - GENUINE_OPEN_DELAY_MS).toISOString();
    await giftServiceClient()
      .from("campaign_influencers")
      .update({ gift_viewed_at: new Date(now).toISOString() })
      .eq("gift_token", token)
      .is("gift_viewed_at", null)
      .or(`gift_invited_at.is.null,gift_invited_at.lte.${invitedBefore}`);
  }
  return NextResponse.json({ ok: true });
}

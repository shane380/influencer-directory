import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { giftInviteEmail } from "@/lib/email-templates";
import { isEmailTriggerEnabled } from "@/lib/app-settings";
import { generateGiftToken, giftUrl } from "@/lib/gift";

// Admin/manager-only: emails a campaign gift-selection invite to an
// influencer, generating (and persisting) the gift token if none exists yet.
// NOT under /api/gift/t/ — this route stays behind the auth wall.

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: profile } = await (supabase.from("profiles") as any)
      .select("is_admin, is_manager")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin && !profile?.is_manager) {
      return NextResponse.json({ error: "Admin or manager access required" }, { status: 403 });
    }

    const { campaignInfluencerId } = await request.json();
    if (!campaignInfluencerId) {
      return NextResponse.json({ error: "campaignInfluencerId is required" }, { status: 400 });
    }

    const { data: ci } = await admin
      .from("campaign_influencers")
      .select(
        `id, status, gift_token, gift_invited_at,
         campaigns!inner(name, gift_enabled),
         influencers!inner(name, email)`
      )
      .eq("id", campaignInfluencerId)
      .single();
    if (!ci) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    const campaign = Array.isArray((ci as any).campaigns) ? (ci as any).campaigns[0] : (ci as any).campaigns;
    const influencer = Array.isArray((ci as any).influencers) ? (ci as any).influencers[0] : (ci as any).influencers;

    if (!campaign?.gift_enabled) {
      return NextResponse.json({ error: "Gift page is not enabled for this campaign" }, { status: 400 });
    }
    if (!influencer?.email) {
      return NextResponse.json({ error: "Influencer has no email on file" }, { status: 400 });
    }
    if (!(await isEmailTriggerEnabled("gift_invite"))) {
      return NextResponse.json({ skipped: true, reason: "gift_invite trigger disabled" });
    }

    let token = (ci as any).gift_token as string | null;
    const patch: Record<string, unknown> = {
      gift_email_sent_at: new Date().toISOString(),
      gift_invited_at: (ci as any).gift_invited_at || new Date().toISOString(),
    };
    if (!token) {
      token = generateGiftToken();
      patch.gift_token = token;
    }
    if ((ci as any).status === "prospect") {
      patch.status = "contacted";
    }

    const firstName = (influencer.name || "").trim().split(/\s+/)[0] || "there";
    const url = giftUrl(token);
    const { subject, html } = await giftInviteEmail({
      firstName,
      campaignName: campaign.name,
      giftUrl: url,
      recipientEmail: influencer.email,
    });

    await sendEmail({ to: influencer.email, subject, html });
    await admin.from("campaign_influencers").update(patch).eq("id", campaignInfluencerId);

    return NextResponse.json({ success: true, url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send gift invite";
    console.error("Gift invite send error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/admin-auth";

const EMPTY = {
  ads: [],
  totals: { spend: 0, impressions: 0 },
  monthly: [],
  mtd: { spend: 0, impressions: 0 },
  lastMtd: { spend: 0, impressions: 0 },
};

// GET: Read cached ad performance from Supabase (no Meta API calls).
// Creators may only read their own handle's data; admins may read any handle.
export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get("handle");
  if (!handle) {
    return NextResponse.json({ error: "handle is required" }, { status: 400 });
  }

  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = getAdminClient();

  if (user.user_metadata?.role === "creator") {
    // Resolve the caller's own handle server-side: creators row by user_id →
    // creator_invites.influencer_id → influencers.instagram_handle.
    let ownHandle: string | null = null;
    const { data: creator } = await (supabase.from("creators") as any)
      .select("invite_id")
      .eq("user_id", user.id)
      .single();
    if (creator?.invite_id) {
      const { data: invite } = await (supabase.from("creator_invites") as any)
        .select("influencer_id")
        .eq("id", creator.invite_id)
        .single();
      if (invite?.influencer_id) {
        const { data: inf } = await (supabase.from("influencers") as any)
          .select("instagram_handle")
          .eq("id", invite.influencer_id)
          .single();
        ownHandle = inf?.instagram_handle || null;
      }
    }
    if (!ownHandle || ownHandle.toLowerCase() !== handle.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await (supabase.from("creator_ad_performance") as any)
    .select("ads, totals, monthly, mtd, last_mtd, synced_at, sync_error")
    .eq("instagram_handle", handle)
    .single();

  if (error || !data) {
    return NextResponse.json(EMPTY);
  }

  return NextResponse.json({
    ads: data.ads || [],
    totals: data.totals || EMPTY.totals,
    monthly: data.monthly || [],
    mtd: data.mtd || EMPTY.mtd,
    lastMtd: data.last_mtd || EMPTY.lastMtd,
    syncedAt: data.synced_at,
    syncError: data.sync_error,
  });
}

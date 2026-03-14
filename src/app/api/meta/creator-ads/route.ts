import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const EMPTY = {
  ads: [],
  totals: { spend: 0, impressions: 0 },
  monthly: [],
  mtd: { spend: 0, impressions: 0 },
  lastMtd: { spend: 0, impressions: 0 },
};

// GET: Read cached ad performance from Supabase (no Meta API calls)
export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get("handle");
  if (!handle) {
    return NextResponse.json({ error: "handle is required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { syncCreator, syncAllCreators, getServiceClient } from "@/lib/meta-sync";

async function verifyAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await (supabase.from("profiles") as any)
    .select("is_admin, is_manager")
    .eq("id", user.id)
    .single();

  return !!(profile?.is_admin || profile?.is_manager);
}

// POST: Trigger manual Meta ad sync (admin only)
export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const startTime = Date.now();

  try {
    const body = await request.json().catch(() => ({}));
    const db = getServiceClient();

    if (body.handle) {
      // Single creator sync
      const result = await syncCreator(body.handle, body.influencer_id || null, db);
      return NextResponse.json({
        ...result,
        duration_ms: Date.now() - startTime,
      });
    }

    // Full sync
    const result = await syncAllCreators(db);
    return NextResponse.json({
      ...result,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Sync failed" },
      { status: 500 }
    );
  }
}

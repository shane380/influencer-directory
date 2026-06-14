import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { resolveAffiliateContext } from "@/lib/affiliate-context";

// GET /api/creator/affiliate-config[?creator_id=...]
// Resolves a creator's affiliate status server-side. legacy_affiliates is
// service-role-only (RLS), so the browser client cannot read it — this route
// performs the lookup and returns just what the dashboard needs to gate the
// affiliate section and pick the rate/code.
export async function GET(request: NextRequest) {
  const auth = await createServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const isAdmin = user.user_metadata?.role !== "creator";
  const creatorId = request.nextUrl.searchParams.get("creator_id");

  const ctx = await resolveAffiliateContext({ userId: user.id, creatorId, isAdmin });
  if (!ctx) {
    return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  }

  return NextResponse.json({
    enabled: ctx.enabled,
    rate: ctx.rate,
    code: ctx.code,
    source: ctx.source,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";

// Public lookup of ONE invite by its slug, for the invite and terms pages.
// It lives under /invite so the existing public prefix in middleware covers it.
// The pages used to read creator_invites straight from the browser, which
// meant the table had to be readable while logged out — and so could be listed
// in full by anyone. Internal notes are never returned.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await getAdminClient()
    .from("creator_invites")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const invite: Record<string, unknown> = { ...data };
  delete invite.notes;
  return NextResponse.json(
    { invite },
    { headers: { "Cache-Control": "no-store" } }
  );
}

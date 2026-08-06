import { NextRequest, NextResponse } from "next/server";
import { getAdsUser } from "@/lib/ads-guard";
import { requestPartnershipPermission, MetaApiError } from "@/lib/meta-ads";

// Sends the account-level partnership ads access request — the creator gets
// the approval prompt in their Instagram app, same as Ads Manager's
// "Add partners" flow.

export async function POST(request: NextRequest) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const handle = String(body.instagram_handle || "").trim().replace(/^@+/, "").toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) {
    return NextResponse.json({ error: "Enter a valid Instagram handle" }, { status: 400 });
  }

  try {
    await requestPartnershipPermission(handle);
  } catch (err: any) {
    const msg = err instanceof MetaApiError ? err.userMessage : "Meta rejected the request";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  return NextResponse.json({ ok: true, instagram_handle: handle });
}

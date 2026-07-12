import { NextResponse } from "next/server";
import { getDefaults, MetaApiError } from "@/lib/meta-ads";
import { verifyAdmin } from "@/lib/admin-auth";

export async function GET() {
  const user = await verifyAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const defaults = await getDefaults();
    return NextResponse.json(defaults);
  } catch (err) {
    const message = err instanceof MetaApiError ? err.userMessage : "Failed to load defaults";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

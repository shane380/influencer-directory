import { NextResponse } from "next/server";
import { listTargets, MetaApiError } from "@/lib/meta-ads";
import { verifyAdmin } from "@/lib/admin-auth";

export async function GET() {
  const user = await verifyAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const targets = await listTargets();
    return NextResponse.json(targets);
  } catch (err) {
    const message = err instanceof MetaApiError ? err.userMessage : "Failed to load campaigns";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

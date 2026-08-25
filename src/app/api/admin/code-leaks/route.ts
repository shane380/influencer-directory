import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin, getAdminClient } from "@/lib/admin-auth";
import { scanCodeLeaks } from "@/lib/code-leak-scan";
import { sendLeakDigest, loadCodeOwners } from "@/lib/code-leak-alert";
import { getShopifyStoreUrl } from "@/lib/shopify";

export const maxDuration = 300;

const VALID_STATUSES = ["open", "acknowledged", "resolved", "ignored"] as const;

// GET: list leak findings for the admin page.
// `?status=open,acknowledged` (default) — pass `all` for everything.
export async function GET(request: NextRequest) {
  const user = await verifyAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminClient();
  const statusParam = request.nextUrl.searchParams.get("status") || "open,acknowledged";

  let query = (db.from("affiliate_code_leak_signals") as any)
    .select("*")
    .order("last_detected_at", { ascending: false });

  if (statusParam !== "all") {
    const statuses = statusParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) query = query.in("status", statuses);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const signals = data || [];
  const owners = await loadCodeOwners(db, signals.map((s: any) => s.affiliate_code));

  const { data: statusRow } = await (db.from("app_settings") as any)
    .select("value")
    .eq("key", "code_leak_scan_status")
    .maybeSingle();

  let lastScan: any = null;
  try {
    lastScan = statusRow?.value ? JSON.parse(statusRow.value) : null;
  } catch {
    // A malformed status blob must not take the page down.
  }

  return NextResponse.json({
    signals: signals.map((s: any) => ({
      ...s,
      owner_name: owners.get(String(s.affiliate_code).toUpperCase()) || null,
    })),
    store_url: getShopifyStoreUrl(),
    last_scan: lastScan,
  });
}

// PATCH: change a finding's status (acknowledge / resolve / ignore / reopen).
export async function PATCH(request: NextRequest) {
  const user = await verifyAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { id, status, notes } = body || {};

  if (!id || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `id and a status of ${VALID_STATUSES.join(" | ")} are required` },
      { status: 400 },
    );
  }

  const update: Record<string, any> = { status };
  // Only a terminal state stamps resolved_at; reopening clears it so the
  // timestamp never claims a finding was closed when it isn't.
  update.resolved_at =
    status === "resolved" || status === "ignored" ? new Date().toISOString() : null;
  if (typeof notes === "string") update.notes = notes;

  const db = getAdminClient();
  const { data, error } = await (db.from("affiliate_code_leak_signals") as any)
    .update(update)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ signal: data });
}

// POST: run a scan now from the admin page. Calls the same function the cron
// does rather than re-entering the cron route, which is CRON_SECRET-guarded.
export async function POST(request: NextRequest) {
  const user = await verifyAdmin();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const dryRun = !!body?.dry;

  try {
    const db = getAdminClient();
    const result = await scanCodeLeaks({ dryRun, supabase: db });

    let emailed: string[] = [];
    if (!dryRun && result.alertSignals.length > 0) {
      emailed = await sendLeakDigest({
        db,
        signals: result.alertSignals,
        windowStart: result.windowStart,
        windowEnd: result.windowEnd,
        storeUrl: getShopifyStoreUrl(),
      });
    }

    return NextResponse.json({ ...result, emailed_count: emailed.length });
  } catch (err: any) {
    console.error("[admin/code-leaks] Scan failed:", err);
    return NextResponse.json({ error: err.message || "Scan failed" }, { status: 500 });
  }
}

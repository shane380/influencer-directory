import { NextRequest, NextResponse } from "next/server";
import { getAdminClient } from "@/lib/admin-auth";
import { processBlast, STALE_SENDING_MS } from "@/lib/campaign-blast";

export const maxDuration = 300;
const SEND_BUDGET_MS = 240_000;

// GET: every 5 minutes — send campaign email blasts whose scheduled time has
// arrived, and finish any that an earlier run was cut off in the middle of.
//
// Each blast is claimed with a conditional update before anything is sent, so
// overlapping invocations can't both send the same one.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  // Fails closed: this route sends mail, so no secret means no access.
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getAdminClient();
  const startedAt = Date.now();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS).toISOString();

  const { data: due, error } = await admin
    .from("email_blasts")
    .select("id, status")
    .not("campaign_id", "is", null)
    .or(
      `and(status.eq.scheduled,scheduled_for.lte.${now.toISOString()}),and(status.eq.sending,started_at.lt.${staleBefore})`,
    )
    .order("scheduled_for", { ascending: true })
    .limit(10);
  if (error) {
    return NextResponse.json({ error: "Failed to load scheduled blasts" }, { status: 500 });
  }

  const summary: { id: string; done: boolean; sent: number; failed: number; skipped: number; error?: string }[] = [];

  for (const row of due || []) {
    const remaining = SEND_BUDGET_MS - (Date.now() - startedAt);
    if (remaining < 10_000) break;

    let claim = admin
      .from("email_blasts")
      .update({ status: "sending", started_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", row.status);
    if (row.status === "sending") claim = claim.lt("started_at", staleBefore);
    const { data: claimed } = await claim.select("*");
    const blast = claimed?.[0];
    if (!blast) continue; // cancelled, or another run got there first

    try {
      const { done, results } = await processBlast(admin, blast, remaining);
      summary.push({
        id: blast.id,
        done,
        sent: results.filter((r) => r.status === "sent").length,
        failed: results.filter((r) => r.status === "failed").length,
        skipped: results.filter((r) => r.status === "skipped").length,
      });
    } catch (err) {
      // Left in "sending"; retried once it goes stale.
      const message = err instanceof Error ? err.message : "Blast failed";
      console.error("Scheduled blast error:", blast.id, message);
      summary.push({ id: blast.id, done: false, sent: 0, failed: 0, skipped: 0, error: message });
    }
  }

  return NextResponse.json({ processed: summary.length, blasts: summary });
}

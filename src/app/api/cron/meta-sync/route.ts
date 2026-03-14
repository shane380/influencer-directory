import { NextRequest, NextResponse } from "next/server";
import { syncAllCreators, getServiceClient } from "@/lib/meta-sync";

// GET: Daily cron job to sync Meta ad data for all creators
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const db = getServiceClient();
    const result = await syncAllCreators(db);

    console.log(
      `[cron/meta-sync] Complete in ${Date.now() - startTime}ms: ` +
      `${result.synced} synced, ${result.failed} failed, stoppedEarly=${result.stoppedEarly}`
    );

    return NextResponse.json({
      message: "Meta sync complete",
      ...result,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error("[cron/meta-sync] Fatal error:", err);
    return NextResponse.json(
      { error: err.message || "Sync failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { syncAllCreators, getServiceClient } from "@/lib/meta-sync";

export const maxDuration = 300;

// GET: Daily cron job to sync Meta ad data for all creators
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();

  // Daily-insights window, expressed as days-back-from-today.
  //
  //   ?window=7            (default) the routine run — ~4 pages, ~60s, always
  //                        finishes, and covers where nearly all restatement
  //                        happens.
  //   ?window=35&until=21  a reconcile SLICE — days 21-35 only. Meta restates
  //                        for ~28 days, but a single 35-day sweep is ~20 pages
  //                        (~280s) and would be killed by the function timeout,
  //                        so the horizon is walked in bounded chunks.
  const windowParam = parseInt(request.nextUrl.searchParams.get("window") || "", 10);
  const windowDays = Number.isFinite(windowParam) && windowParam > 0
    ? Math.min(windowParam, 90)
    : 7;
  const untilParam = parseInt(request.nextUrl.searchParams.get("until") || "", 10);
  const untilDaysAgo = Number.isFinite(untilParam) && untilParam >= 0
    ? Math.min(untilParam, windowDays)
    : 0;

  try {
    const db = getServiceClient();
    const result = await syncAllCreators(db, undefined, windowDays, untilDaysAgo);

    console.log(
      `[cron/meta-sync] Complete in ${Date.now() - startTime}ms ` +
      `(window=${windowDays}d, until=${untilDaysAgo}d ago): ` +
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

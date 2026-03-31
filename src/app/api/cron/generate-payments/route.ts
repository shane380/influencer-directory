import { NextRequest, NextResponse } from "next/server";

// Cron: auto-generate payments on the last day of the month
// Schedule: "0 0 28-31 * *" (runs at midnight on days 28-31, checks if it's actually the last day)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Allow manual month override via query param, otherwise use current month
  const monthParam = request.nextUrl.searchParams.get("month");
  let month: string;

  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    month = monthParam;
  } else {
    // Only run on the actual last day of the month
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDate() !== 1) {
      return NextResponse.json({ skipped: true, reason: "Not the last day of the month" });
    }
    month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    const res = await fetch(`${baseUrl}/api/admin/payments/generate?month=${month}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
      },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`[cron/generate-payments] Failed for ${month}:`, data);
      return NextResponse.json({ error: "Generation failed", month, details: data }, { status: 500 });
    }

    console.log(`[cron/generate-payments] Generated payments for ${month}:`, data.summary || data);
    return NextResponse.json({ success: true, month, ...data });
  } catch (err) {
    console.error(`[cron/generate-payments] Error:`, err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

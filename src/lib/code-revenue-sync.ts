import { createClient } from "@supabase/supabase-js";
import { listBulkAffiliateOrdersGrossByDay } from "./affiliate";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Refresh the creator_code_revenue_daily cache for all active affiliate codes
 * over [startDate, endDate]. Existing rows in that window get overwritten via
 * upsert on (affiliate_code, date). Rows outside the window are untouched.
 */
export async function syncCodeRevenue(
  startDate: Date,
  endDate: Date,
  supabase?: any,
): Promise<{
  codesProcessed: number;
  rowsUpserted: number;
  durationMs: number;
}> {
  const t0 = Date.now();
  const db = supabase || getServiceClient();

  // Collect every distinct affiliate_code on the creators table, plus any
  // legacy_affiliates if that table exists. We only need codes — anything that
  // gets recorded against an order's discount_codes counts.
  const { data: creators } = await (db.from("creators") as any)
    .select("affiliate_code")
    .not("affiliate_code", "is", null);
  const creatorCodes = (creators || [])
    .map((c: any) => c.affiliate_code as string)
    .filter(Boolean);

  let legacyCodes: string[] = [];
  try {
    const { data: legacy } = await (db.from("legacy_affiliates") as any)
      .select("discount_code")
      .not("discount_code", "is", null);
    legacyCodes = (legacy || []).map((l: any) => l.discount_code as string).filter(Boolean);
  } catch {
    // legacy_affiliates table may not exist in all envs
  }

  const codes = Array.from(new Set([...creatorCodes, ...legacyCodes].map((c) => c.toUpperCase())));
  if (codes.length === 0) {
    return { codesProcessed: 0, rowsUpserted: 0, durationMs: Date.now() - t0 };
  }

  const byCode = await listBulkAffiliateOrdersGrossByDay(codes, startDate, endDate);

  // Flatten to upsert rows
  const rows: Array<{
    affiliate_code: string;
    date: string;
    gross_amount: number;
    order_count: number;
    synced_at: string;
  }> = [];
  const syncedAt = new Date().toISOString();
  for (const [code, byDay] of byCode) {
    for (const [day, { gross, orders }] of byDay) {
      rows.push({
        affiliate_code: code,
        date: day,
        gross_amount: Math.round(gross * 100) / 100,
        order_count: orders,
        synced_at: syncedAt,
      });
    }
  }

  // Chunk to keep payloads modest
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await (db.from("creator_code_revenue_daily") as any).upsert(
      rows.slice(i, i + CHUNK),
      { onConflict: "affiliate_code,date" },
    );
    if (error) {
      console.warn(`[code-revenue-sync] upsert chunk failed:`, error.message);
      break;
    }
  }

  return { codesProcessed: codes.length, rowsUpserted: rows.length, durationMs: Date.now() - t0 };
}

/**
 * Shared Meta Graph API primitives: the rate-limited fetch wrapper and the
 * helpers that unpack Meta's action arrays.
 *
 * Extracted verbatim from meta-sync.ts so meta-account-sync.ts shares ONE call
 * counter with it. Two independent counters would each think they had the full
 * hourly budget and together blow through it — the exact failure mode this
 * refactor exists to fix.
 */

export const META_API_VERSION = "v25.0";
const MAX_CALLS_PER_HOUR = 400;
// Per-request ceiling. Insights pages normally take ~14s on this account; 90s
// leaves generous headroom for a slow-but-healthy page while still cutting off
// a hung connection well inside a serverless budget.
const REQUEST_TIMEOUT_MS = 90_000;

// In-memory call counter, shared across every module that imports metaFetch.
let callCount = 0;
let callCountResetAt = Date.now() + 3600_000;

function checkRateLimit() {
  if (Date.now() > callCountResetAt) {
    callCount = 0;
    callCountResetAt = Date.now() + 3600_000;
  }
  if (callCount >= MAX_CALLS_PER_HOUR) {
    throw new Error(`Rate limit reached: exceeded ${MAX_CALLS_PER_HOUR} Meta API calls this hour`);
  }
}

/** Calls made since the counter last reset — for run summaries and logging. */
export function metaCallCount(): number {
  return callCount;
}

export async function metaFetch(url: string, retries = 3): Promise<any> {
  checkRateLimit();
  callCount++;

  for (let attempt = 0; attempt <= retries; attempt++) {
    // A dropped connection used to throw straight out of here and abort the
    // caller. That was survivable when every call was small and independent;
    // now a single sweep is ~20 sequential pages, so one blip would discard the
    // whole run's data. Transport errors get the same backoff as throttles.
    let res: Response;
    try {
      // Node's fetch has NO default timeout. Observed in production: a single
      // insights page hung for 508s while every other page took ~14s — long
      // enough on its own to blow a serverless function's whole budget. Failing
      // fast and retrying is strictly better than hanging.
      res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err: any) {
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s
        console.warn(`[meta-fetch] Network error (${err?.message || err}), retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }

    if (res.status === 429 && attempt < retries) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.warn(`[meta-fetch] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    const data = await res.json();

    // 4  = "too many calls"
    // 2  = "Service temporarily unavailable" — Meta returns this transiently,
    //      and also as collateral once another call has tripped a rate limit.
    //      It was previously NOT retried, so one blip aborted a whole sweep.
    // 17 = "User request limit reached"
    // 613 = calls-per-second throttle
    const retryableCodes = [2, 4, 17, 613];
    if (retryableCodes.includes(data.error?.code) && attempt < retries) {
      // Longer backoff than the 429 path: these are account-level throttles, and
      // retrying in one second just burns another call against the same limit.
      const delay = Math.pow(2, attempt) * 3000; // 3s, 6s, 12s
      console.warn(
        `[meta-fetch] Meta error code ${data.error.code} (${data.error.message}), retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    return data;
  }
}

// Meta returns action_values / outbound_clicks / purchase_roas as arrays of
// {action_type, value}. These helpers extract the numeric we care about.

export function sumActionValue(arr: any[] | undefined, actionType?: string): number {
  if (!Array.isArray(arr)) return 0;
  let total = 0;
  for (const row of arr) {
    if (!row) continue;
    if (actionType && row.action_type !== actionType) continue;
    total += parseFloat(row.value || "0");
  }
  return total;
}

export function pickActionValue(arr: any[] | undefined, actionType: string): number | null {
  if (!Array.isArray(arr)) return null;
  for (const row of arr) {
    if (row?.action_type === actionType) {
      const v = parseFloat(row.value || "0");
      return isFinite(v) ? v : null;
    }
  }
  return null;
}

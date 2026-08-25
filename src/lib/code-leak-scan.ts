import { getShopifyAccessToken, getShopifyStoreUrl } from "./shopify";
import { shopifyFetch } from "./affiliate";
import { getServiceClient, listAllAffiliateCodes } from "./code-revenue-sync";

/**
 * Affiliate-code leak detection.
 *
 * A leaked code keeps paying commission on orders the creator never drove.
 * Shopify records `referring_site` on each order, which turns out to separate
 * leaked codes from healthy ones cleanly: a creator's own audience arrives from
 * Instagram, while a leaked code arrives from Google search, direct, or a
 * coupon aggregator.
 *
 * Measured over 4,000 orders (2026-07-18 → 2026-08-25):
 *   MOLLYDALTON     n=342  social 70%  search  6%   <- healthy, the control
 *   KRISTAL         n= 78  social 17%  search 32%   <- leak-shaped
 *   DAISYMCDERMOTT  n= 34  social 12%  search 38%   <- plus a simplycodes.com
 *                                                      referral on 2026-08-08
 *
 * Three detectors run off one pass over recent orders. Detector C additionally
 * reads creator_code_revenue_daily, which the nightly sync already populates.
 */

// ---------------------------------------------------------------------------
// Referrer classification
// ---------------------------------------------------------------------------

// Coupon aggregators. A redemption referred from one of these is proof the code
// is public, not an inference — simplycodes.com already shows up in live data.
const COUPON_DOMAINS = [
  "simplycodes", "retailmenot", "slickdeals", "couponbirds", "dealspotr",
  "wethrift", "knoji", "couponfollow", "honey", "joinhoney", "dealsplus",
  "coupons.com", "groupon", "hotukdeals", "ozbargain", "couponxoo",
  "promocodes", "coupert", "dontpayfull", "couponcabin", "offers.com",
  "savings.com", "bravodeal", "couponkirin", "picodi", "vouchercodes",
];

const SOCIAL_DOMAINS = [
  "instagram", "tiktok", "facebook", "pinterest", "snapchat", "youtube",
  "twitter", "x.com", "threads", "linkedin", "reddit",
];

const SEARCH_DOMAINS = [
  "google.", "bing.", "duckduckgo", "yahoo", "search.brave", "ecosia",
  "yandex", "baidu", "chatgpt", "perplexity",
];

export type ReferrerBucket = "social" | "search" | "coupon" | "direct" | "other";

/** Lower-cased host of a referring_site URL, or "" when there is none. */
export function referrerHost(url: string | null | undefined): string {
  if (!url) return "";
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  const host = (m ? m[1] : url).toLowerCase().trim();
  return host.startsWith("www.") ? host.slice(4) : host;
}

/**
 * Bucket a referrer. Order matters: coupon is checked before search so a
 * coupon site that happens to contain a search-ish token can't be misfiled.
 *
 * `referring_site` is null on roughly a third of real orders — that is normal
 * (direct traffic, app webviews, stripped referrers), not an error, so it
 * buckets as "direct" rather than being skipped.
 */
export function bucketReferrer(url: string | null | undefined): ReferrerBucket {
  const host = referrerHost(url);
  if (!host) return "direct";
  if (COUPON_DOMAINS.some((d) => host.includes(d))) return "coupon";
  if (SOCIAL_DOMAINS.some((d) => host.includes(d))) return "social";
  if (SEARCH_DOMAINS.some((d) => host.includes(d))) return "search";
  // The store's own domain means an on-site navigation (checkout bounce,
  // returns portal) — no information about acquisition either way.
  return "other";
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Days of orders fetched in one pass: detection window + baseline. */
export const DEFAULT_SCAN_DAYS = 60;
/**
 * Trailing days treated as "recent". Deliberately wider than the 15-day gap
 * between the 1st-and-15th cron runs so consecutive scans overlap and no order
 * falls into a gap.
 */
export const DETECTION_WINDOW_DAYS = 16;

/**
 * Minimum orders before the mix detector is allowed an opinion. At ~1-2
 * affiliate orders/day brand-wide, a code with 6 orders can read 50% search on
 * pure noise — below this gate we say nothing rather than cry wolf.
 */
const MIX_MIN_ORDERS = 10;
const MIX_SEARCH_SHARE = 0.25;
const MIX_SOCIAL_SHARE = 0.40;
const MIX_DRIFT_MULTIPLE = 2;

const SPIKE_MIN_ORDERS = 5;
const SPIKE_MULTIPLE = 3;
const DORMANT_WAKE_ORDERS = 8;

const MAX_SAMPLE_ORDERS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignalType = "coupon_referrer" | "referrer_mix" | "usage_spike";
export type Severity = "confirmed" | "high" | "medium";

export interface LeakSignal {
  affiliate_code: string;
  signal_type: SignalType;
  severity: Severity;
  summary: string;
  evidence: Record<string, any>;
  window_start: string;
  window_end: string;
}

export interface ScanResult {
  windowStart: string;
  windowEnd: string;
  baselineStart: string;
  codesTracked: number;
  ordersScanned: number;
  affiliateOrders: number;
  signals: LeakSignal[];
  /** Findings not already tracked as open — the only ones worth emailing about. */
  newSignals: LeakSignal[];
  durationMs: number;
  dryRun: boolean;
}

interface ScanOrder {
  id: number;
  created_at: string;
  gross: number;
  codes: string[];
  referring_site: string | null;
  bucket: ReferrerBucket;
}

// ---------------------------------------------------------------------------
// Shopify pass
// ---------------------------------------------------------------------------

/**
 * Page through orders once, keeping only those that redeemed a tracked code.
 *
 * `fields=` keeps payloads small — ~26 pages at 250/page for a 60-day window,
 * which fits inside the route's 300s budget with room. Uses the retrying
 * shopifyFetch from affiliate.ts: a non-OK page mid-pagination would silently
 * truncate the order set and turn a leaked code into a clean one.
 */
async function fetchAffiliateOrders(
  codes: Set<string>,
  since: Date,
): Promise<{ orders: ScanOrder[]; ordersScanned: number }> {
  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();
  if (!storeUrl || !accessToken || codes.size === 0) {
    return { orders: [], ordersScanned: 0 };
  }

  const orders: ScanOrder[] = [];
  let ordersScanned = 0;
  let pageUrl: string | null =
    `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250` +
    `&created_at_min=${since.toISOString()}` +
    `&fields=id,created_at,subtotal_price,discount_codes,referring_site`;

  while (pageUrl) {
    const res: Response = await shopifyFetch(pageUrl, accessToken);
    if (!res.ok) {
      throw new Error(`Shopify orders page returned ${res.status} during leak scan`);
    }
    const data = await res.json();

    for (const order of data.orders || []) {
      ordersScanned++;
      // discount_codes is an array and can hold non-code strings (an AfterShip
      // returns exchange writes a human label there), so match against the
      // tracked set rather than trusting the field.
      const matched = Array.from(
        new Set(
          (order.discount_codes || [])
            .map((dc: any) => (dc?.code || "").toUpperCase())
            .filter((c: string) => c && codes.has(c)),
        ),
      ) as string[];
      if (matched.length === 0) continue;

      orders.push({
        id: order.id,
        created_at: order.created_at,
        gross: parseFloat(order.subtotal_price || "0") || 0,
        codes: matched,
        referring_site: order.referring_site || null,
        bucket: bucketReferrer(order.referring_site),
      });
    }

    const linkHeader = res.headers.get("Link");
    const match = linkHeader?.match(/<([^>]+)>;\s*rel="next"/);
    pageUrl = match ? match[1] : null;
  }

  return { orders, ordersScanned };
}

// ---------------------------------------------------------------------------
// Detectors
// ---------------------------------------------------------------------------

type Buckets = Record<ReferrerBucket, number>;

function emptyBuckets(): Buckets {
  return { social: 0, search: 0, coupon: 0, direct: 0, other: 0 };
}

function total(b: Buckets): number {
  return b.social + b.search + b.coupon + b.direct + b.other;
}

/** Share as a 0-1 fraction. Returns 0 for an empty bucket set — never NaN. */
function share(count: number, n: number): number {
  return n > 0 ? count / n : 0;
}

function pct(x: number): number {
  return Math.round(x * 1000) / 10;
}

export function runDetectors(opts: {
  codes: string[];
  orders: ScanOrder[];
  windowStart: Date;
  baselineStart: Date;
  windowEnd: Date;
  revenueByCode: Map<string, { recent: number; baseline: number; baselineDays: number }>;
}): LeakSignal[] {
  const { codes, orders, windowStart, baselineStart, windowEnd, revenueByCode } = opts;
  const winStartIso = windowStart.toISOString().slice(0, 10);
  const winEndIso = windowEnd.toISOString().slice(0, 10);
  const windowStartMs = windowStart.getTime();

  const recent = new Map<string, Buckets>();
  const baseline = new Map<string, Buckets>();
  const couponHits = new Map<string, ScanOrder[]>();
  const recentSamples = new Map<string, ScanOrder[]>();

  for (const code of codes) {
    recent.set(code, emptyBuckets());
    baseline.set(code, emptyBuckets());
  }

  for (const order of orders) {
    const t = new Date(order.created_at).getTime();
    if (!Number.isFinite(t)) continue;
    const isRecent = t >= windowStartMs;
    for (const code of order.codes) {
      const target = isRecent ? recent.get(code) : baseline.get(code);
      if (!target) continue;
      target[order.bucket]++;
      if (isRecent && order.bucket === "coupon") {
        const list = couponHits.get(code) || [];
        list.push(order);
        couponHits.set(code, list);
      }
      if (isRecent && (order.bucket === "search" || order.bucket === "coupon")) {
        const list = recentSamples.get(code) || [];
        if (list.length < MAX_SAMPLE_ORDERS) {
          list.push(order);
          recentSamples.set(code, list);
        }
      }
    }
  }

  const sampleOf = (list: ScanOrder[] | undefined) =>
    (list || []).slice(0, MAX_SAMPLE_ORDERS).map((o) => ({
      order_id: o.id,
      created_at: o.created_at,
      referring_site: o.referring_site,
    }));

  const signals: LeakSignal[] = [];

  for (const code of codes) {
    const r = recent.get(code)!;
    const b = baseline.get(code)!;
    const nRecent = total(r);
    const nBaseline = total(b);

    const mix = {
      window: { ...r, total: nRecent },
      baseline: { ...b, total: nBaseline },
      social_pct: pct(share(r.social, nRecent)),
      search_pct: pct(share(r.search, nRecent)),
      direct_pct: pct(share(r.direct, nRecent)),
      baseline_search_pct: pct(share(b.search, nBaseline)),
      baseline_days: Math.round(
        (windowStart.getTime() - baselineStart.getTime()) / 86_400_000,
      ),
    };

    // --- Detector A: coupon-site referrer (proof) --------------------------
    const hits = couponHits.get(code);
    if (hits && hits.length > 0) {
      const domains = Array.from(new Set(hits.map((o) => referrerHost(o.referring_site))));
      signals.push({
        affiliate_code: code,
        signal_type: "coupon_referrer",
        severity: "confirmed",
        summary:
          `${hits.length} order${hits.length === 1 ? "" : "s"} referred from ` +
          `${domains.join(", ")} — this code is published on a coupon site.`,
        evidence: { coupon_orders: hits.length, domains, mix, samples: sampleOf(hits) },
        window_start: winStartIso,
        window_end: winEndIso,
      });
    }

    // --- Detector B: referrer mix shift ------------------------------------
    if (nRecent >= MIX_MIN_ORDERS) {
      const searchShare = share(r.search, nRecent);
      const socialShare = share(r.social, nRecent);
      const baseSearchShare = share(b.search, nBaseline);

      const absolute = searchShare >= MIX_SEARCH_SHARE && socialShare < MIX_SOCIAL_SHARE;
      const drift =
        nBaseline >= MIX_MIN_ORDERS &&
        baseSearchShare > 0 &&
        searchShare >= baseSearchShare * MIX_DRIFT_MULTIPLE;

      if (absolute || drift) {
        signals.push({
          affiliate_code: code,
          signal_type: "referrer_mix",
          severity: "high",
          summary: absolute
            ? `${pct(searchShare)}% of redemptions came from search and only ` +
              `${pct(socialShare)}% from social — a creator's own audience arrives from social.`
            : `Search-referred redemptions jumped from ${pct(baseSearchShare)}% to ` +
              `${pct(searchShare)}% versus the previous ${mix.baseline_days} days.`,
          evidence: {
            rule: absolute ? "absolute" : "drift",
            mix,
            samples: sampleOf(recentSamples.get(code)),
          },
          window_start: winStartIso,
          window_end: winEndIso,
        });
      }
    }

    // --- Detector C: usage spike -------------------------------------------
    const rev = revenueByCode.get(code);
    if (rev) {
      const windowDays = Math.max(
        1,
        Math.round((windowEnd.getTime() - windowStart.getTime()) / 86_400_000),
      );
      // Scale the baseline's daily rate up to the detection window's length so
      // the two are comparable. A code with no baseline is dormant, not zero:
      // it gets the flat DORMANT_WAKE_ORDERS test instead of a ratio.
      const expected =
        rev.baselineDays > 0 ? (rev.baseline / rev.baselineDays) * windowDays : 0;
      const spiked =
        expected > 0
          ? rev.recent >= Math.max(SPIKE_MIN_ORDERS, expected * SPIKE_MULTIPLE)
          : rev.recent >= DORMANT_WAKE_ORDERS;

      if (spiked) {
        signals.push({
          affiliate_code: code,
          signal_type: "usage_spike",
          severity: "medium",
          summary:
            expected > 0
              ? `${rev.recent} orders in ${windowDays} days against an expected ` +
                `~${Math.round(expected)} at this code's own recent rate.`
              : `${rev.recent} orders in ${windowDays} days on a code that had no ` +
                `prior activity.`,
          evidence: {
            recent_orders: rev.recent,
            baseline_orders: rev.baseline,
            baseline_days: rev.baselineDays,
            expected_orders: Math.round(expected * 10) / 10,
            window_days: windowDays,
            mix,
          },
          window_start: winStartIso,
          window_end: winEndIso,
        });
      }
    }
  }

  const rank: Record<Severity, number> = { confirmed: 0, high: 1, medium: 2 };
  signals.sort((a, b) => rank[a.severity] - rank[b.severity] ||
    a.affiliate_code.localeCompare(b.affiliate_code));
  return signals;
}

// ---------------------------------------------------------------------------
// Revenue baselines (free — reads the cache the nightly cron already fills)
// ---------------------------------------------------------------------------

async function loadRevenueBaselines(
  db: any,
  codes: string[],
  baselineStart: Date,
  windowStart: Date,
): Promise<Map<string, { recent: number; baseline: number; baselineDays: number }>> {
  const out = new Map<string, { recent: number; baseline: number; baselineDays: number }>();
  if (codes.length === 0) return out;

  const baselineStartIso = baselineStart.toISOString().slice(0, 10);
  const windowStartIso = windowStart.toISOString().slice(0, 10);
  const baselineDays = Math.max(
    0,
    Math.round((windowStart.getTime() - baselineStart.getTime()) / 86_400_000),
  );

  const { data, error } = await (db.from("creator_code_revenue_daily") as any)
    .select("affiliate_code, date, order_count")
    .gte("date", baselineStartIso);

  // The cache is an optimisation for this detector, not a dependency. If it is
  // empty or unreadable, A and B still run — they read Shopify directly.
  if (error || !data) return out;

  for (const row of data) {
    const code = (row.affiliate_code || "").toUpperCase();
    if (!code) continue;
    const entry = out.get(code) || { recent: 0, baseline: 0, baselineDays };
    const n = row.order_count || 0;
    if (row.date >= windowStartIso) entry.recent += n;
    else entry.baseline += n;
    out.set(code, entry);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Run one leak scan. With `dryRun` it computes and returns findings without
 * writing rows — used by `?dry=1` to check thresholds against live data.
 */
export async function scanCodeLeaks(opts: {
  days?: number;
  windowDays?: number;
  dryRun?: boolean;
  supabase?: any;
} = {}): Promise<ScanResult> {
  const t0 = Date.now();
  const db = opts.supabase || getServiceClient();
  const dryRun = !!opts.dryRun;

  // A wider detection window is what you want on a first run or a manual
  // catch-up sweep: the fortnightly default only looks back far enough to
  // cover the gap since the last scan, so an older leak sits just outside it.
  const windowDays = Math.max(1, Math.min(opts.windowDays ?? DETECTION_WINDOW_DAYS, 365));
  const days = Math.max(windowDays + 1, Math.min(opts.days ?? DEFAULT_SCAN_DAYS, 400));

  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - windowDays * 86_400_000);
  const baselineStart = new Date(windowEnd.getTime() - days * 86_400_000);

  const codes = await listAllAffiliateCodes(db);
  const codeSet = new Set(codes);

  const { orders, ordersScanned } = await fetchAffiliateOrders(codeSet, baselineStart);
  const revenueByCode = await loadRevenueBaselines(db, codes, baselineStart, windowStart);

  const signals = runDetectors({
    codes, orders, windowStart, baselineStart, windowEnd, revenueByCode,
  });

  let newSignals = signals;
  if (!dryRun) {
    newSignals = await persistSignals(db, signals);
    await (db.from("app_settings") as any).upsert(
      {
        key: "code_leak_scan_status",
        value: JSON.stringify({
          last_run_at: new Date().toISOString(),
          window_days: windowDays,
          scan_days: days,
          codes_scanned: codes.length,
          orders_scanned: ordersScanned,
          affiliate_orders: orders.length,
          signals_found: signals.length,
          new_signals: newSignals.length,
          duration_ms: Date.now() - t0,
        }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  }

  return {
    windowStart: windowStart.toISOString().slice(0, 10),
    windowEnd: windowEnd.toISOString().slice(0, 10),
    baselineStart: baselineStart.toISOString().slice(0, 10),
    codesTracked: codes.length,
    ordersScanned,
    affiliateOrders: orders.length,
    signals,
    newSignals,
    durationMs: Date.now() - t0,
    dryRun,
  };
}

/**
 * Write findings, returning how many were genuinely new.
 *
 * Re-detecting an existing finding refreshes its evidence and bumps
 * last_detected_at rather than inserting a duplicate, so a fortnightly scan
 * doesn't stack rows — and only genuinely new findings trigger an email.
 *
 * The three closed states mean different things here:
 *   acknowledged — seen, still open work: stays put, no repeat email.
 *   ignored      — "not a leak": suppresses re-detection for good, otherwise
 *                  dismissing a false positive would re-alert every fortnight
 *                  and the digest would train you to ignore it.
 *   resolved     — "code rotated": does NOT suppress. If the same code shows
 *                  leak signals again it is a genuinely new leak and you want
 *                  to hear about it, with the old row kept as history.
 */
async function persistSignals(db: any, signals: LeakSignal[]): Promise<LeakSignal[]> {
  const created: LeakSignal[] = [];

  for (const s of signals) {
    const { data: existing } = await (db.from("affiliate_code_leak_signals") as any)
      .select("id, status")
      .ilike("affiliate_code", s.affiliate_code)
      .eq("signal_type", s.signal_type)
      .in("status", ["open", "acknowledged", "ignored"])
      .maybeSingle();

    if (existing) {
      await (db.from("affiliate_code_leak_signals") as any)
        .update({
          // status is deliberately untouched — refreshing evidence must not
          // reopen something a human already closed.
          severity: s.severity,
          evidence: { ...s.evidence, summary: s.summary },
          window_start: s.window_start,
          window_end: s.window_end,
          last_detected_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      continue;
    }

    const { error } = await (db.from("affiliate_code_leak_signals") as any).insert({
      affiliate_code: s.affiliate_code,
      signal_type: s.signal_type,
      severity: s.severity,
      evidence: { ...s.evidence, summary: s.summary },
      window_start: s.window_start,
      window_end: s.window_end,
      status: "open",
    });
    // A unique-violation here means a concurrent run beat us to it — not an
    // error worth failing the scan over.
    if (!error) created.push(s);
    else console.warn(`[code-leak-scan] insert skipped for ${s.affiliate_code}: ${error.message}`);
  }

  return created;
}

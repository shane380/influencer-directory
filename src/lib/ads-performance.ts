/**
 * Shared shaping for the Ad Performance page: formatting, period-over-period
 * trends, and aggregation.
 *
 * Kept out of the component so the aggregation rules — which are opinionated and
 * easy to get subtly wrong — are stated once and testable in isolation.
 */

export interface PerfAd {
  ad_id: string;
  name: string | null;
  campaign: string | null;
  adset: string | null;
  status: string | null;
  format: string | null;
  hook: string | null;
  thumbnail_url: string | null;
  has_video: boolean;
  has_carousel: boolean;
  partnership: boolean;
  handle: string | null;
  created_time: string | null;
  days_live: number | null;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number | null;
  revenue: number;
  roas: number | null;
  ctr: number | null;
  cpa: number | null;
  aov: number | null;
  /** Null when the ad had no delivery in the comparison window. */
  prev: PerfMetrics | null;
  in_range: boolean;
}

export interface PerfMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  /** Null when any contributing ad-day had an unknown purchase count. */
  purchases: number | null;
  revenue: number;
  roas: number | null;
  ctr: number | null;
  cpa: number | null;
  aov: number | null;
}

export type MetricKey = "spend" | "revenue" | "roas" | "purchases" | "ctr" | "cpa" | "aov";

export const METRIC_LABEL: Record<MetricKey, string> = {
  spend: "Spend",
  revenue: "Revenue",
  roas: "ROAS",
  purchases: "Purchases",
  ctr: "Link CTR",
  cpa: "CPA",
  aov: "AOV",
};

/**
 * Which direction is good for each metric.
 * Spend is informational — more spend is neither good nor bad on its own, so it
 * never gets a red/green treatment.
 */
const GOOD_WHEN_UP: Record<MetricKey, boolean | null> = {
  spend: null,
  revenue: true,
  roas: true,
  purchases: true,
  ctr: true,
  cpa: false, // cheaper is better
  aov: true,
};

// ── Formatting ──────────────────────────────────────────────────────────────

export function money(n: number | null | undefined, decimals = 0): string {
  if (n == null || !isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function formatMetric(key: MetricKey, v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  switch (key) {
    case "spend":
    case "revenue":
      return money(v, 0);
    case "cpa":
      return money(v, 2);
    case "aov":
      return money(v, 0);
    case "roas":
      return `${v.toFixed(2)}x`;
    case "ctr":
      return `${v.toFixed(2)}%`;
    case "purchases":
      return v.toLocaleString("en-US");
  }
}

// ── Trends ──────────────────────────────────────────────────────────────────

export interface Trend {
  /** "New" when there is no comparable prior period. */
  label: string;
  /** Tailwind text colour class. */
  className: string;
}

const NEUTRAL = "text-gray-400";
const INFO = "text-gray-500";
const GOOD = "text-emerald-600";
const BAD = "text-amber-600";

/**
 * Period-over-period change.
 *
 * `prev == null` means the ad did not exist in the comparison window, which
 * renders "New" rather than a fabricated +100% — a brand new ad is not an
 * infinite improvement.
 */
export function trend(key: MetricKey, current: number | null, prev: number | null | undefined): Trend {
  if (prev === null || prev === undefined) return { label: "New", className: NEUTRAL };
  if (current == null || !isFinite(current) || !isFinite(prev)) return { label: "—", className: NEUTRAL };
  if (prev === 0) return { label: current === 0 ? "0%" : "New", className: NEUTRAL };

  const pct = ((current - prev) / Math.abs(prev)) * 100;
  // Sub-half-percent moves are noise; showing "▲ 0%" in green implies a signal
  // that isn't there.
  if (Math.abs(pct) < 0.5) return { label: "0%", className: NEUTRAL };

  const up = pct > 0;
  const goodWhenUp = GOOD_WHEN_UP[key];
  const className = goodWhenUp === null ? INFO : up === goodWhenUp ? GOOD : BAD;
  return { label: `${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}%`, className };
}

// ── Ranking eligibility ─────────────────────────────────────────────────────

/**
 * Minimum volume before a RATE is trustworthy enough to rank on.
 *
 * Without these, "best" is always won by noise. Measured on real data: the
 * top-ROAS ad in a 30-day window was 76.93x off $2.51 of spend, and the top
 * link-CTR ad was 33.33% off a single click on three impressions. Neither tells
 * anyone anything, and both crowd out the ads actually worth looking at.
 *
 * Spend and purchases are volume measures rather than rates, so they rank
 * unfiltered — the biggest spender genuinely is the biggest spender.
 */
export const MIN_IMPRESSIONS_FOR_RATE = 1000;
export const MIN_SPEND_FOR_RETURN = 100;

export function eligibleForRanking(metric: MetricKey, ad: PerfAd): boolean {
  switch (metric) {
    case "ctr":
      return ad.impressions >= MIN_IMPRESSIONS_FOR_RATE;
    case "roas":
      return ad.spend >= MIN_SPEND_FOR_RETURN;
    case "cpa":
    case "aov":
      // Purchase-derived, so an ad with an unknown count cannot be ranked here.
      return ad.spend >= MIN_SPEND_FOR_RETURN && (ad.purchases ?? 0) > 0;
    default:
      return true;
  }
}

/**
 * Rank a scope on one metric, dropping ads whose volume makes the number
 * meaningless. Falls back to the unfiltered set if the floor removes everything,
 * so a small account still sees something rather than an empty section.
 */
export function rankBy(ads: PerfAd[], metric: MetricKey, limit: number): PerfAd[] {
  const eligible = ads.filter((a) => eligibleForRanking(metric, a));
  const pool = eligible.length > 0 ? eligible : ads;
  const asc = metric === "cpa";
  return [...pool]
    .sort((a, b) => {
      const av = a[metric] ?? (asc ? Infinity : -Infinity);
      const bv = b[metric] ?? (asc ? Infinity : -Infinity);
      return asc ? av - bv : bv - av;
    })
    .slice(0, limit);
}

// ── Aggregation ─────────────────────────────────────────────────────────────

export function emptyMetrics(): PerfMetrics {
  return {
    spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0,
    roas: null, ctr: null, cpa: null, aov: null,
  } as PerfMetrics;
}

/**
 * Sum a set of ads into one metric block.
 *
 * Rates are derived from summed numerators/denominators, never averaged across
 * ads — averaging rates would weight a $5 ad the same as a $5,000 one.
 */
export function aggregate(
  ads: { spend: number; impressions: number; clicks: number; purchases: number | null; revenue: number }[],
): PerfMetrics {
  const t = emptyMetrics();
  // One unknown contributor makes the whole sum unknown. Adding the known ones
  // and presenting the result as a total would understate it by exactly the
  // amount nobody can see.
  let purchases = 0;
  let purchasesKnown = true;
  for (const a of ads) {
    t.spend += a.spend;
    t.impressions += a.impressions;
    t.clicks += a.clicks;
    t.revenue += a.revenue;
    if (a.purchases == null) purchasesKnown = false;
    else purchases += a.purchases;
  }
  t.spend = Math.round(t.spend * 100) / 100;
  t.revenue = Math.round(t.revenue * 100) / 100;
  t.purchases = purchasesKnown ? purchases : null;
  t.roas = t.spend > 0 ? t.revenue / t.spend : null;
  t.ctr = t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null;
  t.cpa = purchasesKnown && purchases > 0 ? t.spend / purchases : null;
  t.aov = purchasesKnown && purchases > 0 ? t.revenue / purchases : null;
  return t;
}

/**
 * Aggregate the PREVIOUS period across a set of ads — counting only ads that
 * existed in BOTH periods.
 *
 * This is deliberate and it has a visible consequence: the summary strip will
 * not equal the sum of the rows beneath it whenever new ads launched in range.
 * The alternative is worse — comparing "this period including 30 new ads"
 * against "last period without them" makes every metric look like it improved
 * simply because more ads were running.
 */
export function aggregatePrev(ads: PerfAd[]): { metrics: PerfMetrics; comparable: number } {
  const comparable = ads.filter((a) => a.prev !== null);
  return {
    metrics: aggregate(comparable.map((a) => a.prev as PerfMetrics)),
    comparable: comparable.length,
  };
}

/** Current-period aggregate over the same ads used for the previous-period one. */
export function aggregateComparable(ads: PerfAd[]): PerfMetrics {
  return aggregate(ads.filter((a) => a.prev !== null));
}

/**
 * Status for a recently-launched ad, judged against the blended ROAS of the
 * scope it belongs to rather than an absolute threshold.
 */
export function launchStatus(
  ad: PerfAd,
  blendedRoas: number | null,
): { label: string; className: string } {
  if (ad.days_live != null && ad.days_live < 3) {
    return { label: "Too early", className: "bg-gray-100 text-gray-600" };
  }
  if (blendedRoas == null || ad.roas == null) {
    return { label: "Tracking", className: "bg-gray-100 text-gray-600" };
  }
  if (ad.roas >= blendedRoas * 1.15) {
    return { label: "Early winner", className: "bg-emerald-50 text-emerald-700" };
  }
  if (ad.roas < blendedRoas * 0.7) {
    return { label: "Underperforming", className: "bg-amber-50 text-amber-700" };
  }
  return { label: "Tracking", className: "bg-gray-100 text-gray-600" };
}

/**
 * Group partnership ads by creator handle.
 *
 * Ranked by REVENUE (spend x roas), not by spend or ROAS alone: a creator only
 * ranks high if they took real budget AND returned on it. Ranking by ROAS alone
 * puts a $40 ad at 9x above a $40,000 ad at 3x.
 */
export function groupByCreator(ads: PerfAd[]) {
  const byHandle = new Map<string, PerfAd[]>();
  for (const a of ads) {
    if (!a.partnership || !a.handle) continue;
    const list = byHandle.get(a.handle) || [];
    list.push(a);
    byHandle.set(a.handle, list);
  }

  const rows = Array.from(byHandle.entries()).map(([handle, list]) => {
    const cur = aggregate(list);
    const prev = aggregatePrev(list);
    return { handle, ads: list, current: cur, previous: prev.metrics, comparable: prev.comparable };
  });

  rows.sort((a, b) => b.current.revenue - a.current.revenue);
  const top = rows[0]?.current.revenue || 0;
  return rows.map((r) => ({
    ...r,
    index: top > 0 ? Math.round((r.current.revenue / top) * 100) : 0,
  }));
}

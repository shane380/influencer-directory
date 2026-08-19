"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, ChevronDown, ChevronRight, Play, Images } from "lucide-react";
import { DateRangePicker, type ResolvedRange, resolveRange } from "@/components/partnerships/date-range-picker";
import {
  type PerfAd,
  type MetricKey,
  METRIC_LABEL,
  aggregate,
  aggregatePrev,
  aggregateComparable,
  formatMetric,
  groupByCreator,
  launchStatus,
  rankBy,
  MIN_IMPRESSIONS_FOR_RATE,
  MIN_SPEND_FOR_RETURN,
  money,
  trend,
} from "@/lib/ads-performance";

type Tab = "all" | "wl";
type SortKey = "spend" | "ctr" | "roas";
type Scope = "All" | "Partnership" | "Non-partnership";

const TABLE_COLUMNS: MetricKey[] = ["spend", "revenue", "roas", "purchases", "ctr", "cpa"];
const CARD_METRICS: MetricKey[] = ["spend", "revenue", "roas", "purchases", "ctr", "cpa"];
const ROWS_PER_PAGE = 25;

/** Uppercase micro-label used throughout, matching the app's existing tables. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">{children}</div>
  );
}

function Delta({
  metric,
  current,
  prev,
  show = true,
}: {
  metric: MetricKey;
  current: number | null;
  prev: number | null | undefined;
  /** False when stored history does not cover the comparison window. */
  show?: boolean;
}) {
  if (!show) return null;
  const t = trend(metric, current, prev);
  return <span className={`text-[11px] font-semibold ${t.className}`}>{t.label}</span>;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex bg-gray-100 rounded-lg p-1 gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-md text-[13px] transition-colors ${
            value === o.value
              ? "bg-white text-gray-900 font-medium shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Creative thumbnail with a play/carousel affordance. */
function Thumb({ ad, className }: { ad: PerfAd; className: string }) {
  return (
    <div className={`relative bg-gray-100 overflow-hidden flex-shrink-0 ${className}`}>
      {ad.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full bg-gray-100" />
      )}
      {(ad.has_video || ad.has_carousel) && (
        <div className="absolute bottom-1 right-1 bg-black/55 rounded p-0.5">
          {ad.has_video ? (
            <Play className="h-2.5 w-2.5 text-white fill-white" />
          ) : (
            <Images className="h-2.5 w-2.5 text-white" />
          )}
        </div>
      )}
    </div>
  );
}

export function PerformanceDashboard() {
  const [range, setRange] = useState<ResolvedRange>(() => resolveRange("30d"));
  const [data, setData] = useState<{
    ads: PerfAd[];
    campaigns: string[];
    creators: string[];
    previous: { start: string; end: string };
    data_since: string | null;
    comparison_complete: boolean;
    purchases_complete: boolean;
    purchases_unknown_share: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<SortKey>("spend");
  const [launchWindow, setLaunchWindow] = useState(7);
  const [scope, setScope] = useState<Scope>("All");
  const [query, setQuery] = useState("");
  const [campaign, setCampaign] = useState("All campaigns");
  const [creator, setCreator] = useState("All creators");
  const [tableSort, setTableSort] = useState<MetricKey | "name">("spend");
  const [page, setPage] = useState(0);
  const [openCreator, setOpenCreator] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/ads/performance?start=${range.start}&end=${range.end}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Request failed (${r.status})`);
        return r.json();
      })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [range.start, range.end]);

  // Switching tabs resets every downstream control — leaving a creator filter
  // applied while moving to "All ads" silently hides most of the account.
  function switchTab(next: Tab) {
    setTab(next);
    setPage(0);
    setOpenCreator(null);
    setCreator("All creators");
    setCampaign("All campaigns");
    setQuery("");
    setScope("All");
  }

  const allAds = data?.ads || [];

  // When the comparison window starts before the fact table does, the previous
  // period is only partially covered and every delta would overstate growth by
  // the size of the gap. Showing nothing is the honest option — a wrong number
  // here is worse than no number, because it reads as a real trend.
  const showDeltas = data?.comparison_complete !== false;

  // Purchase counts only exist from the point the account-wide sync started.
  // Ranges reaching into backfilled history render Purchases, CPA and AOV as
  // "—" rather than a number that is understated by an unknowable amount.
  const purchasesKnown = data?.purchases_complete !== false;
  // Non-zero but under the suppression threshold: the figures stand, with a note.
  const purchasesApprox = purchasesKnown && (data?.purchases_unknown_share ?? 0) > 0;

  // Ads that actually delivered in the selected range. An ad present only
  // because it ran in the COMPARISON window would otherwise show up as a $0 row.
  const scoped = useMemo(
    () => allAds.filter((a) => a.in_range && (tab === "all" || a.partnership)),
    [allAds, tab],
  );

  const summary = useMemo(() => {
    const cur = aggregate(scoped);
    const { metrics: prev, comparable } = aggregatePrev(scoped);
    // Compare like with like: the current figure used for the delta covers only
    // the ads that also existed last period.
    const curComparable = aggregateComparable(scoped);
    return { cur, prev, curComparable, comparable, newCount: scoped.length - comparable };
  }, [scoped]);

  const topAds = useMemo(() => rankBy(scoped, sort, 4), [scoped, sort]);

  const leaders = useMemo(() => {
    const keys: SortKey[] = ["spend", "ctr", "roas"];
    const titles = { spend: "Top spending", ctr: "Best link CTR", roas: "Best ROAS" };
    return keys
      .map((k) => {
        const best = rankBy(scoped, k, 1)[0];
        return best ? { key: k, title: titles[k], ad: best } : null;
      })
      .filter(Boolean) as { key: SortKey; title: string; ad: PerfAd }[];
  }, [scoped]);

  const compare = useMemo(() => {
    const inRange = allAds.filter((a) => a.in_range);
    const totalSpend = inRange.reduce((s, a) => s + a.spend, 0);
    return [
      { title: "Whitelisting", list: inRange.filter((a) => a.partnership), accent: "bg-indigo-600" },
      { title: "Brand ads", list: inRange.filter((a) => !a.partnership), accent: "bg-gray-900" },
    ].map((c) => {
      const cur = aggregate(c.list);
      const { metrics: prev } = aggregatePrev(c.list);
      return {
        ...c,
        cur,
        prev,
        count: c.list.length,
        // Share is measured against TOTAL account spend, not against each other,
        // so the two bars are comparable to the account as a whole.
        share: totalSpend > 0 ? (cur.spend / totalSpend) * 100 : 0,
      };
    });
  }, [allAds]);

  const creatorRows = useMemo(() => groupByCreator(scoped), [scoped]);

  const recent = useMemo(() => {
    const blended = summary.cur.roas;
    return scoped
      .filter((a) => a.days_live != null && a.days_live <= launchWindow)
      // Sorted by SPEND, not newest-first: newest-first fills this with same-day
      // ads that have no signal yet.
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 4)
      .map((a) => ({ ad: a, status: launchStatus(a, blended) }));
  }, [scoped, launchWindow, summary.cur.roas]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((a) => {
      if (tab === "all" && scope !== "All") {
        if (scope === "Partnership" && !a.partnership) return false;
        if (scope === "Non-partnership" && a.partnership) return false;
      }
      if (campaign !== "All campaigns" && a.campaign !== campaign) return false;
      if (creator !== "All creators" && a.handle !== creator) return false;
      if (q && !`${a.name || ""} ${a.campaign || ""} ${a.handle || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [scoped, tab, scope, campaign, creator, query]);

  const sortedTable = useMemo(() => {
    const rows = [...filtered];
    if (tableSort === "name") {
      rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (tableSort === "cpa") {
      // Cost sorts ascending — cheapest first is the useful order.
      rows.sort((a, b) => (a.cpa ?? Infinity) - (b.cpa ?? Infinity));
    } else {
      rows.sort((a, b) => (b[tableSort] ?? -Infinity) - (a[tableSort] ?? -Infinity));
    }
    return rows;
  }, [filtered, tableSort]);

  const pageRows = sortedTable.slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
  const maxPage = Math.max(0, Math.ceil(sortedTable.length / ROWS_PER_PAGE) - 1);

  const summaryTiles: MetricKey[] = ["spend", "revenue", "roas", "purchases", "cpa", "aov"];

  return (
    <div>
      <div className="flex items-end justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Ad performance</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {tab === "all"
              ? "Every ad in the account, with the creative attached to the numbers."
              : "Partnership ads only, compared against brand ads."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker value={range} onChange={(r) => { setRange(r); setPage(0); }} />
          {data && (
            <span className="text-xs text-gray-400 whitespace-nowrap">
              vs {data.previous.start} – {data.previous.end}
            </span>
          )}
        </div>
      </div>

      <div className="mb-5">
        <SegmentedControl
          value={tab}
          onChange={(v) => switchTab(v)}
          options={[{ value: "all" as Tab, label: "All ads" }, { value: "wl" as Tab, label: "Whitelisting" }]}
        />
      </div>

      {error && (
        <div className="bg-white border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-700">
          Couldn&apos;t load performance data: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 text-sm text-gray-400 py-24">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading performance…
        </div>
      ) : scoped.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg py-16 text-center text-sm text-gray-500">
          No ads delivered in this range.
        </div>
      ) : (
        <>
          {/* ── Summary ───────────────────────────────────────────────── */}
          <div className="bg-white border border-gray-200 rounded-lg grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 mb-4">
            {summaryTiles.map((k, i) => (
              <div key={k} className={`px-5 py-4 ${i > 0 ? "lg:border-l border-gray-100" : ""}`}>
                <Label>{METRIC_LABEL[k]}</Label>
                <div className="text-[22px] font-semibold text-gray-900 mt-1 tabular-nums">
                  {formatMetric(k, summary.cur[k])}
                </div>
                {/* The prior-period figure is drawn from the same partial history
                    as the delta, so it is hidden alongside it rather than left
                    standing as an apparently solid number. */}
                {showDeltas && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <Delta metric={k} current={summary.curComparable[k]} prev={summary.comparable > 0 ? summary.prev[k] : null} show />
                    <span className="text-[11px] text-gray-400">
                      from {formatMetric(k, summary.prev[k])}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {purchasesApprox && (
            <p className="text-[11px] text-gray-400 mb-4 -mt-2">
              Purchase counts are missing for {((data?.purchases_unknown_share ?? 0) * 100).toFixed(2)}% of
              spend in this range, so Purchases, CPA and AOV are marginally understated.
            </p>
          )}

          {!purchasesKnown && (
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4 text-[13px] text-gray-600">
              <span className="font-medium text-gray-900">Purchases, CPA and AOV unavailable for this range.</span>{" "}
              {(((data?.purchases_unknown_share ?? 0) * 100).toFixed(0))}% of spend in this range predates
              purchase-count tracking — that history was backfilled from a table which stored revenue but not
              order counts. Spend, revenue, ROAS and link CTR are complete throughout.
            </div>
          )}

          {!showDeltas && (
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4 text-[13px] text-gray-600">
              <span className="font-medium text-gray-900">Trends hidden.</span>{" "}
              Stored performance history begins {data?.data_since}, which is after this range&apos;s
              comparison period ({data?.previous.start} – {data?.previous.end}) starts. Comparing a full
              period against a partial one would overstate every change, so deltas are suppressed until
              enough history accumulates.
            </div>
          )}

          {showDeltas && summary.newCount > 0 && (
            <p className="text-[11px] text-gray-400 mb-6 -mt-2">
              Trends compare {summary.comparable} ad{summary.comparable === 1 ? "" : "s"} that ran in both
              periods; {summary.newCount} launched in this range and are excluded from the comparison, so
              the totals above will not equal the sum of the deltas.
            </p>
          )}

          {/* ── Whitelisting vs Brand ─────────────────────────────────── */}
          {tab === "wl" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {compare.map((c) => (
                <div key={c.title} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className={`h-1 ${c.accent}`} />
                  <div className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">{c.title}</h3>
                      <span className="text-[11px] text-gray-500">
                        {c.count} ads · {money(c.cur.revenue)} returned
                      </span>
                    </div>
                    <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full ${c.accent} rounded-full`} style={{ width: `${c.share}%` }} />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1.5">
                      {c.share.toFixed(0)}% of total account spend
                    </p>
                    <div className="grid grid-cols-4 gap-3 mt-4">
                      {(["spend", "roas", "ctr", "cpa"] as MetricKey[]).map((k) => (
                        <div key={k}>
                          <Label>{METRIC_LABEL[k]}</Label>
                          <div className="text-base font-semibold text-gray-900 mt-0.5 tabular-nums">
                            {formatMetric(k, c.cur[k])}
                          </div>
                          <Delta metric={k} current={c.cur[k]} prev={c.prev[k]} show={showDeltas} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Leaders ───────────────────────────────────────────────── */}
          {tab === "all" && leaders.length > 0 && (
            <section className="mb-8">
              <h2 className="text-base font-semibold text-gray-900">Leaders</h2>
              <p className="text-xs text-gray-500 mt-0.5 mb-3">The single best ad on each measure.</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {leaders.map((l) => (
                  <div key={l.key} className="bg-white border border-gray-200 rounded-lg p-4 flex gap-4">
                    <Thumb ad={l.ad} className="w-14 h-[70px] rounded-md" />
                    <div className="min-w-0">
                      <Label>{l.title}</Label>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-xl font-semibold text-gray-900 tabular-nums">
                          {formatMetric(l.key, l.ad[l.key])}
                        </span>
                        <Delta metric={l.key} current={l.ad[l.key]} prev={l.ad.prev?.[l.key] ?? null} show={showDeltas} />
                      </div>
                      <p className="text-xs text-gray-600 truncate mt-1">{l.ad.name || "Untitled ad"}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {l.ad.handle ? `@${l.ad.handle} · ` : ""}{l.ad.campaign || "—"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Top performing ────────────────────────────────────────── */}
          <section className="mb-8">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Top performing ads</h2>
                <p className="text-xs text-gray-500 mt-0.5">Ranked by {METRIC_LABEL[sort].toLowerCase()}.</p>
              </div>
              <SegmentedControl
                value={sort}
                onChange={setSort}
                options={[
                  { value: "spend" as SortKey, label: "Top spending" },
                  { value: "ctr" as SortKey, label: "Link CTR" },
                  { value: "roas" as SortKey, label: "ROAS" },
                ]}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {topAds.map((ad, i) => (
                <div key={ad.ad_id} className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                  <div className="relative h-52">
                    <Thumb ad={ad} className="w-full h-full" />
                    <span className="absolute top-2 left-2 w-6 h-6 rounded-md bg-white/90 text-xs font-bold text-gray-900 flex items-center justify-center">
                      {i + 1}
                    </span>
                    {ad.format && (
                      <span className="absolute top-2 right-2 text-[10px] font-semibold text-white bg-black/55 rounded-full px-2 py-0.5">
                        {ad.format}
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-gray-900/80 to-transparent pt-8 px-3 pb-2.5">
                      <p className="text-[11px] text-white/80">
                        {ad.handle ? `@${ad.handle} · paid partnership` : "Brand ad"}
                      </p>
                      {ad.hook && <p className="text-xs text-white font-medium line-clamp-2 mt-0.5">{ad.hook}</p>}
                    </div>
                  </div>
                  <div className="px-4 pt-3 pb-4 flex-1 flex flex-col">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{ad.name || "Untitled ad"}</p>
                    <p className="text-[11px] text-gray-400 truncate">{ad.campaign || "—"}</p>
                    <div className="border-t border-gray-100 mt-3 pt-3 flex items-end justify-between">
                      <div>
                        <Label>{METRIC_LABEL[sort]}</Label>
                        <div className="text-[22px] font-semibold text-gray-900 tabular-nums">
                          {formatMetric(sort, ad[sort])}
                        </div>
                      </div>
                      <Delta metric={sort} current={ad[sort]} prev={ad.prev?.[sort] ?? null} show={showDeltas} />
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3">
                      {CARD_METRICS.filter((k) => k !== sort).map((k) => (
                        <div key={k}>
                          <Label>{METRIC_LABEL[k]}</Label>
                          <div className="flex items-baseline gap-1.5">
                            <span className="text-[13px] font-semibold text-gray-900 tabular-nums">
                              {formatMetric(k, ad[k])}
                            </span>
                            <Delta metric={k} current={ad[k]} prev={ad.prev?.[k] ?? null} show={showDeltas} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Creators ──────────────────────────────────────────────── */}
          {tab === "wl" && creatorRows.length > 0 && (
            <section className="mb-8">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Creators</h2>
              <div className="bg-white border border-gray-200 rounded-lg px-5">
                {creatorRows.map((row, idx) => {
                  const open = openCreator === row.handle;
                  return (
                    <div key={row.handle} className={idx > 0 ? "border-t border-gray-100" : ""}>
                      <button
                        onClick={() => setOpenCreator(open ? null : row.handle)}
                        className="w-full py-4 flex items-center gap-4 text-left"
                      >
                        <div className="w-[170px] min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate">@{row.handle}</p>
                          <p className="text-[11px] text-gray-500">{row.ads.length} ads</p>
                        </div>
                        <div className="flex-1 min-w-0 hidden lg:block">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden max-w-md">
                            <div className="h-full bg-gray-900 rounded-full" style={{ width: `${row.index}%` }} />
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1 truncate">
                            {money(row.current.spend)} spent returning {money(row.current.revenue)} — index {row.index}
                          </p>
                        </div>
                        <div className="grid grid-cols-4 gap-4 w-[380px]">
                          {(["spend", "roas", "ctr", "purchases"] as MetricKey[]).map((k) => (
                            <div key={k}>
                              <Label>{METRIC_LABEL[k]}</Label>
                              <div className="text-[15px] font-semibold text-gray-900 tabular-nums">
                                {formatMetric(k, row.current[k])}
                              </div>
                              {/* Delta on its own line — beside the value these collide. */}
                              <Delta metric={k} current={row.current[k]} prev={row.comparable > 0 ? row.previous[k] : null} show={showDeltas} />
                            </div>
                          ))}
                        </div>
                        {open ? (
                          <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        )}
                      </button>
                      {open && (
                        <div className="pb-4 pl-4 space-y-2">
                          {[...row.ads].sort((a, b) => b.spend - a.spend).slice(0, 4).map((ad) => (
                            <div key={ad.ad_id} className="flex items-center gap-3">
                              <Thumb ad={ad} className="w-7 h-9 rounded" />
                              <span className="text-xs text-gray-700 truncate flex-1 min-w-0">
                                {ad.name || "Untitled ad"}
                              </span>
                              <div className="grid grid-cols-4 gap-4 w-[380px] text-xs text-gray-600 tabular-nums">
                                {(["spend", "roas", "ctr", "purchases"] as MetricKey[]).map((k) => (
                                  <span key={k}>{formatMetric(k, ad[k])}</span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Recently launched ─────────────────────────────────────── */}
          {recent.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Recently launched</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Highest spend among ads live in the window.</p>
                </div>
                <SegmentedControl
                  value={String(launchWindow)}
                  onChange={(v) => setLaunchWindow(Number(v))}
                  options={[
                    { value: "3", label: "3 days" },
                    { value: "7", label: "7 days" },
                    { value: "14", label: "14 days" },
                  ]}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {recent.map(({ ad, status }) => (
                  <div key={ad.ad_id} className="bg-white border border-gray-200 rounded-lg p-4 flex gap-4">
                    <Thumb ad={ad} className="w-[88px] h-[110px] rounded-md" />
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-gray-900 truncate">{ad.name || "Untitled ad"}</p>
                        <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        {ad.days_live} day{ad.days_live === 1 ? "" : "s"} live
                        {ad.handle ? ` · @${ad.handle}` : ""}
                      </p>
                      <div className="grid grid-cols-4 gap-2 mt-auto pt-3">
                        {(["spend", "roas", "ctr", "purchases"] as MetricKey[]).map((k) => (
                          <div key={k}>
                            <Label>{k === "purchases" ? "Purch." : METRIC_LABEL[k]}</Label>
                            <div className="text-sm font-semibold text-gray-900 tabular-nums">
                              {formatMetric(k, ad[k])}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Table ─────────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <h2 className="text-base font-semibold text-gray-900">
                {tab === "wl" ? "All whitelisting ads" : "All ads"}
              </h2>
              {tab === "all" && (
                <SegmentedControl
                  value={scope}
                  onChange={(v) => { setScope(v); setPage(0); }}
                  options={[
                    { value: "All" as Scope, label: "All" },
                    { value: "Partnership" as Scope, label: "Partnership" },
                    { value: "Non-partnership" as Scope, label: "Non-partnership" },
                  ]}
                />
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[220px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setPage(0); }}
                    placeholder="Search ads, campaigns, creators"
                    className="w-full h-9 pl-9 pr-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-900"
                  />
                </div>
                <select
                  value={campaign}
                  onChange={(e) => { setCampaign(e.target.value); setPage(0); }}
                  className="h-9 px-3 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white max-w-[220px]"
                >
                  <option>All campaigns</option>
                  {(data?.campaigns || []).map((c) => <option key={c}>{c}</option>)}
                </select>
                {tab === "wl" && (
                  <select
                    value={creator}
                    onChange={(e) => { setCreator(e.target.value); setPage(0); }}
                    className="h-9 px-3 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white"
                  >
                    <option>All creators</option>
                    {(data?.creators || []).map((c) => <option key={c}>{c}</option>)}
                  </select>
                )}
                <button
                  onClick={() => { setQuery(""); setCampaign("All campaigns"); setCreator("All creators"); setScope("All"); setPage(0); }}
                  className="text-[13px] text-gray-500 hover:text-gray-900 px-2"
                >
                  Reset
                </button>
              </div>

              {/* Horizontal scroll so the trailing numeric columns stay reachable. */}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th
                        onClick={() => setTableSort("name")}
                        className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider font-medium text-gray-500 cursor-pointer whitespace-nowrap"
                      >
                        Ad {tableSort === "name" && "▾"}
                      </th>
                      <th className="text-left px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium text-gray-500 whitespace-nowrap">
                        Creator
                      </th>
                      {TABLE_COLUMNS.map((k) => (
                        <th
                          key={k}
                          onClick={() => { setTableSort(k); setPage(0); }}
                          className={`text-right px-3 py-2.5 text-[11px] uppercase tracking-wider font-medium cursor-pointer whitespace-nowrap ${
                            tableSort === k ? "text-gray-900" : "text-gray-500"
                          }`}
                        >
                          {METRIC_LABEL[k]} {tableSort === k && "▾"}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((ad, i) => (
                      <tr key={ad.ad_id} className={`border-b border-gray-50 ${i % 2 ? "bg-gray-50/40" : ""}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <span className="text-[11px] text-gray-400 w-6 text-right tabular-nums">
                              {page * ROWS_PER_PAGE + i + 1}
                            </span>
                            <Thumb ad={ad} className="w-9 h-11 rounded" />
                            <div className="min-w-0">
                              <p className="text-[13px] text-gray-900 truncate max-w-[280px]">{ad.name || "Untitled ad"}</p>
                              <p className="text-[11px] text-gray-400 truncate max-w-[280px]">{ad.campaign || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs">
                          {ad.handle ? (
                            <span className="text-indigo-700">@{ad.handle}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        {TABLE_COLUMNS.map((k) => (
                          <td key={k} className="px-3 py-2.5 text-right">
                            <div className={`text-[13px] tabular-nums ${tableSort === k ? "font-semibold text-gray-900" : "text-gray-700"}`}>
                              {formatMetric(k, ad[k])}
                            </div>
                            <Delta metric={k} current={ad[k]} prev={ad.prev?.[k] ?? null} show={showDeltas} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {sortedTable.length === 0
                    ? "No ads match these filters."
                    : `${page * ROWS_PER_PAGE + 1}–${Math.min((page + 1) * ROWS_PER_PAGE, sortedTable.length)} of ${sortedTable.length}`}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-[13px] text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                    disabled={page >= maxPage}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-[13px] text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>

          <p className="text-[11px] text-gray-400 mt-4">
            Read-only. Deltas compare the selected range with the equivalent range immediately before it.
            Figures come from the stored Meta sync, not a live API call. &ldquo;Best&rdquo; rankings ignore ads
            below {MIN_IMPRESSIONS_FOR_RATE.toLocaleString()} impressions (rates) or{" "}
            {money(MIN_SPEND_FOR_RETURN)} spend (return), so a single click cannot top the chart.
          </p>
        </>
      )}
    </div>
  );
}

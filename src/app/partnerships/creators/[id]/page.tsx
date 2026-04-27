"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";
import { SubmissionReviewModal, SubmissionForReview } from "@/components/submission-review-modal";
import {
  ResponsiveContainer,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Line,
  Scatter,
  Cell,
} from "recharts";

type Period = "30d" | "90d" | "all";

interface Creator {
  id: string;
  creator_name: string;
  affiliate_code: string | null;
  commission_rate: number | null;
  invite_id: string | null;
  onboarded_at: string | null;
}

interface Invite {
  id: string;
  influencer_id: string | null;
  has_affiliate?: boolean;
  has_ad_spend?: boolean;
  ad_spend_percentage?: number | null;
  videos_per_month?: number | null;
  usage_rights?: string | null;
  status?: string | null;
  content_type?: string | null;
  notes?: string | null;
  deal_structure?: string | null;
  commission_rate?: number | null;
  created_at?: string | null;
}

interface Influencer {
  id: string;
  name: string;
  instagram_handle: string | null;
  profile_photo_url: string | null;
  shopify_customer_id?: string | null;
}

interface SampleRequest {
  id: string;
  creator_id: string;
  status: string;
  created_at: string;
  selections: Array<{
    product_title?: string;
    variant_title?: string;
    quantity?: number;
    image_url?: string;
  }>;
}

interface ContentSubmission {
  id: string;
  creator_id: string;
  month: string | null;
  files: Array<{ name?: string; mime_type?: string; r2_url?: string }>;
  notes?: string | null;
  status: "pending" | "approved" | "revision_requested" | string;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  admin_feedback?: string | null;
}

interface Ad {
  id: string;
  name: string;
  effective_status: string;
  adset_name?: string | null;
  spend: string;
  impressions: string;
  outbound_clicks?: number;
  outbound_clicks_ctr?: number;
  purchase_value?: number;
  purchase_roas?: number | null;
  thumbnail?: string | null;
}

interface AdPerformance {
  ads: Ad[];
  totals: { spend: number; impressions: number };
  monthly: Array<{ month: string; spend: number; impressions: number }>;
  mtd: { spend: number; impressions: number };
  lastMtd: { spend: number; impressions: number };
}

interface TrendData {
  period: Period;
  range: { start: string; end: string };
  daily: Array<{ date: string; spend: number; revenue: number; adsLive: number | null }>;
  adsLaunched: Array<{ date: string; count: number }>;
  spendTotal: number;
  codeRevenueTotal: number;
  codeOrderCount: number;
  adsLiveDataPoints: number;
}

const COLORS = {
  spend: "#5F5E5A",
  revenue: "#1D9E75",
  approved: "#7F77DD",
  adsLive: "#BA7517",
};

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function formatMoneyDecimal(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusPillClass(status: string): string {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    approved: "bg-green-100 text-green-800",
    revision_requested: "bg-orange-100 text-orange-800",
    rejected: "bg-red-100 text-red-700",
    fulfilled: "bg-green-100 text-green-800",
  };
  return `inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status] || "bg-gray-100 text-gray-600"}`;
}

function approvedDotRadius(n: number): number {
  if (n <= 2) return 4;
  if (n <= 9) return 5;
  return 6;
}

function monthLabel(monthKey: string | null | undefined): string {
  if (!monthKey) return "";
  const [yr, mo] = monthKey.split("-");
  if (!yr || !mo) return monthKey;
  return new Date(parseInt(yr), parseInt(mo) - 1).toLocaleString("en", {
    month: "long",
    year: "numeric",
  });
}

function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}

function monthYearShort(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en", { month: "short", year: "numeric" });
}

type Tab = "ads" | "content" | "styles";

export default function AdminCreatorProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const tabParam = (searchParams.get("tab") || "ads") as Tab;
  const activeTab: Tab = ["ads", "content", "styles"].includes(tabParam) ? tabParam : "ads";

  function setActiveTab(next: Tab) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "ads") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }

  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [creator, setCreator] = useState<Creator | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [submissions, setSubmissions] = useState<ContentSubmission[]>([]);
  const [sampleRequests, setSampleRequests] = useState<SampleRequest[]>([]);
  const [adPerf, setAdPerf] = useState<AdPerformance | null>(null);

  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const [period, setPeriod] = useState<Period>("30d");
  const [trend, setTrend] = useState<TrendData | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);

  // Initial load
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUser({
          displayName: user.user_metadata?.full_name || user.email || "",
          email: user.email || "",
          profilePhotoUrl: null,
          isAdmin: user.user_metadata?.role === "admin",
        });
      }

      const { data: c } = await (supabase.from("creators") as any)
        .select("*")
        .eq("id", id)
        .single();
      if (!c) {
        setLoading(false);
        return;
      }
      setCreator(c as Creator);

      let inv: Invite | null = null;
      let inf: Influencer | null = null;
      if (c.invite_id) {
        const { data: invData } = await (supabase.from("creator_invites") as any)
          .select("*")
          .eq("id", c.invite_id)
          .single();
        inv = invData as Invite | null;
        setInvite(inv);
        if (inv?.influencer_id) {
          const { data: infData } = await supabase
            .from("influencers")
            .select("*")
            .eq("id", inv.influencer_id)
            .single();
          inf = infData as Influencer | null;
          setInfluencer(inf);
        }
      }

      const [{ data: subs }, { data: reqs }] = await Promise.all([
        (supabase.from("creator_content_submissions") as any)
          .select("*")
          .eq("creator_id", id)
          .order("created_at", { ascending: false }),
        (supabase.from("creator_sample_requests") as any)
          .select("*")
          .eq("creator_id", id)
          .order("created_at", { ascending: false }),
      ]);
      setSubmissions((subs || []) as ContentSubmission[]);
      setSampleRequests((reqs || []) as SampleRequest[]);

      if (inf?.instagram_handle) {
        try {
          const res = await fetch(
            `/api/meta/creator-ads?handle=${encodeURIComponent(inf.instagram_handle)}`,
          );
          const data = await res.json();
          setAdPerf(data as AdPerformance);
        } catch {}
      }

      setLoading(false);
    }
    if (id) load();
  }, [id, supabase]);

  // Trend data
  useEffect(() => {
    if (!creator?.id) return;
    let cancelled = false;
    async function loadTrend() {
      setTrendLoading(true);
      try {
        const res = await fetch(`/api/creators/${creator!.id}/trend?period=${period}`);
        const data = await res.json();
        if (!cancelled) setTrend(data as TrendData);
      } catch {
        if (!cancelled) setTrend(null);
      }
      if (!cancelled) setTrendLoading(false);
    }
    loadTrend();
    return () => {
      cancelled = true;
    };
  }, [creator?.id, period]);

  // Derived: pending submissions
  const pendingSubmissions = useMemo(
    () => submissions.filter((s) => s.status === "pending"),
    [submissions],
  );

  // Active ads list
  const liveAds = useMemo(
    () => (adPerf?.ads || []).filter((a) => a.effective_status === "ACTIVE"),
    [adPerf],
  );

  // Items gifted: sum quantities across sample request selections
  const itemsGifted = useMemo(() => {
    let qty = 0;
    let orders = 0;
    for (const r of sampleRequests) {
      const sels = Array.isArray(r.selections) ? r.selections : [];
      const orderQty = sels.reduce((s, sel) => s + (Number(sel.quantity) || 1), 0);
      if (orderQty > 0) {
        qty += orderQty;
        orders += 1;
      }
    }
    return { qty, orders };
  }, [sampleRequests]);

  // Last 30d ad spend (best approximation from monthly data we have)
  const last30dSpend = useMemo(() => {
    if (!adPerf) return 0;
    return Math.round((adPerf.mtd?.spend || 0) + (adPerf.lastMtd?.spend || 0));
  }, [adPerf]);

  // Lifetime ROAS = sum(purchase_value) / sum(spend) across all ads
  const lifetimeRoas = useMemo(() => {
    if (!adPerf?.ads?.length) return null;
    const totalRevenue = adPerf.ads.reduce((s, a) => s + (a.purchase_value || 0), 0);
    const totalSpend = adPerf.totals?.spend || 0;
    if (!totalSpend) return null;
    return totalRevenue / totalSpend;
  }, [adPerf]);

  // Submission review wiring
  const reviewingSub = useMemo<SubmissionForReview | null>(() => {
    if (!reviewingId) return null;
    const s = submissions.find((x) => x.id === reviewingId);
    if (!s) return null;
    const files = (s.files || []).map((f) => ({
      name: f.name || "",
      r2_url: f.r2_url,
      mime_type: f.mime_type,
    }));
    return {
      id: s.id,
      creator_name: influencer?.name || creator?.creator_name || "Creator",
      creator_photo: influencer?.profile_photo_url || null,
      month: s.month,
      file_count: files.length,
      files,
      notes: s.notes,
    };
  }, [reviewingId, submissions, influencer, creator]);

  async function handleReviewAction(
    submissionId: string,
    action: "approved" | "revision_requested",
    feedback: string,
  ) {
    const res = await fetch("/api/creator/submissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: submissionId,
        status: action,
        admin_feedback: action === "revision_requested" ? feedback : undefined,
      }),
    });
    if (res.ok) {
      const reviewedAt = new Date().toISOString();
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === submissionId
            ? {
                ...s,
                status: action,
                reviewed_at: reviewedAt,
                admin_feedback: action === "revision_requested" ? feedback : s.admin_feedback,
              }
            : s,
        ),
      );
      setReviewingId(null);
    }
  }

  const startedAt = invite?.created_at || creator?.onboarded_at || null;
  const partnershipStarted = startedAt ? monthYearShort(startedAt) : "—";
  const handle = influencer?.instagram_handle;

  if (loading) {
    return (
      <Shell currentUser={currentUser} supabase={supabase} router={router}>
        <p className="text-gray-500 text-sm">Loading...</p>
      </Shell>
    );
  }

  if (!creator) {
    return (
      <Shell currentUser={currentUser} supabase={supabase} router={router}>
        <p className="text-gray-500 text-sm">Creator not found.</p>
      </Shell>
    );
  }

  // ── Chart data assembly ──
  // Each daily row carries spend, revenue, and adsLive on the same x-axis date.
  const chartData = trend?.daily ?? [];

  const launchedScatter = (trend?.adsLaunched || []).map((s) => ({
    date: s.date,
    ad_count: s.count,
    y: 0, // pin dots to the x-axis baseline
  }));

  const periodSpendTotal = trend?.spendTotal ?? 0;
  const periodAdsLaunched = (trend?.adsLaunched || []).reduce((s, d) => s + d.count, 0);
  const adsLiveMax = (trend?.daily || []).reduce(
    (m, d) => Math.max(m, d.adsLive ?? 0),
    liveAds.length,
  );
  const adsLiveYDomain: [number, number] = [0, Math.max(adsLiveMax, 5)];
  const hasAdsLiveSeries = (trend?.adsLiveDataPoints ?? 0) > 0;

  return (
    <Shell currentUser={currentUser} supabase={supabase} router={router}>
      <div className="max-w-5xl">
        <button
          onClick={() => router.push("/partnerships/creators")}
          className="text-sm text-gray-500 hover:text-gray-700 mb-6 flex items-center gap-1"
        >
          ← Back to Creators
        </button>

        {/* 1. Header card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-4">
          <div className="flex items-start gap-4">
            {influencer?.profile_photo_url ? (
              <img
                src={influencer.profile_photo_url}
                alt=""
                className="w-16 h-16 rounded-full object-cover bg-gray-200 flex-shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-500 text-lg font-medium">
                {(influencer?.name || creator.creator_name || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[18px] font-medium text-gray-900">
                  {influencer?.name || creator.creator_name}
                </h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              </div>
              {handle && <p className="text-sm text-gray-500 mt-0.5">@{handle}</p>}
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                {creator.affiliate_code && (
                  <div>
                    <span className="text-gray-500">Code: </span>
                    <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs font-mono text-gray-800">
                      {creator.affiliate_code}
                    </code>
                  </div>
                )}
                {invite?.has_ad_spend && invite.ad_spend_percentage != null && (
                  <div>
                    <span className="text-gray-500">Spend payout: </span>
                    <span className="text-gray-800">{invite.ad_spend_percentage}%</span>
                  </div>
                )}
                {invite?.has_affiliate && creator.commission_rate != null && (
                  <div>
                    <span className="text-gray-500">Affiliate: </span>
                    <span className="text-gray-800">{creator.commission_rate}%</span>
                  </div>
                )}
                <div>
                  <span className="text-gray-500">Started: </span>
                  <span className="text-gray-800">{partnershipStarted}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Metric cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <MetricCard
            label="Ad spend (lifetime)"
            value={formatMoney(adPerf?.totals?.spend || 0)}
            subtitle={`${formatMoney(last30dSpend)} last 30d`}
          />
          <MetricCard
            label="ROAS"
            value={lifetimeRoas != null ? `${lifetimeRoas.toFixed(2)}x` : "—"}
            subtitle="Lifetime"
            unavailable={lifetimeRoas == null}
          />
          <MetricCard
            label="Code revenue"
            value={trend ? formatMoney(trend.codeRevenueTotal) : "—"}
            subtitle={trend ? `${trend.codeOrderCount} order${trend.codeOrderCount !== 1 ? "s" : ""}` : "—"}
          />
          <MetricCard
            label="Ads live"
            value={String(liveAds.length)}
            subtitle="Whitelisted on Meta"
          />
          <MetricCard
            label="Items gifted"
            value={String(itemsGifted.qty)}
            subtitle={`${itemsGifted.orders} order${itemsGifted.orders !== 1 ? "s" : ""}`}
          />
        </div>

        {/* 3. Needs your attention — always visible above the tabs */}
        {pendingSubmissions.length > 0 && (
          <div className="bg-red-50 border border-red-100 border-l-4 border-l-red-500 rounded-lg p-4 mb-6">
            <div className="text-sm font-medium text-red-900 mb-2">
              Needs your attention · {pendingSubmissions.length}
            </div>
            <div className="space-y-2">
              {pendingSubmissions.map((sub) => {
                const fileCount = (sub.files || []).length;
                return (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between bg-white border border-red-100 rounded px-3 py-2"
                  >
                    <div className="text-sm text-gray-800">
                      Content pending review ·{" "}
                      <span className="text-gray-500">
                        {fileCount} file{fileCount !== 1 ? "s" : ""} submitted{" "}
                        {shortDate(sub.created_at)}
                      </span>
                    </div>
                    <button
                      onClick={() => setReviewingId(sub.id)}
                      className="text-sm font-medium text-red-700 hover:text-red-800"
                    >
                      Review →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Tab bar */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex gap-6" role="tablist">
            {(
              [
                { id: "ads" as const, label: "Ads" },
                { id: "content" as const, label: "Content" },
                { id: "styles" as const, label: "Styles" },
              ]
            ).map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(t.id)}
                  className={`relative py-3 text-sm font-medium transition-colors -mb-px border-b-2 ${
                    isActive
                      ? "text-gray-900 border-gray-900"
                      : "text-gray-500 border-transparent hover:text-gray-800"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Ads tab: Trend chart + Live ads */}
        {activeTab === "ads" && (
          <>
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-medium text-gray-900">Trend</h2>
            <div className="inline-flex bg-gray-100 rounded-md p-0.5">
              {(["30d", "90d", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    period === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {p === "30d" ? "30 days" : p === "90d" ? "90 days" : "All time"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs mb-4">
            <LegendDot color={COLORS.spend} label="Ad spend" value={formatMoney(periodSpendTotal)} />
            <LegendDot
              color={COLORS.revenue}
              label="Code revenue"
              value={trend ? formatMoney(trend.codeRevenueTotal) : "—"}
            />
            <LegendDot
              color={COLORS.approved}
              label="New ads live"
              value={String(periodAdsLaunched)}
            />
            <LegendDot
              color={COLORS.adsLive}
              label="Ads live"
              value={`${liveAds.length} current`}
              square
              note={hasAdsLiveSeries ? undefined : "Snapshots accumulating"}
            />
          </div>

          <div className="h-72">
            {trendLoading ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-400">
                Loading trend...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="#F3F4F6" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d) =>
                      new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" })
                    }
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    minTickGap={32}
                  />
                  <YAxis
                    yAxisId="dollars"
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis
                    yAxisId="adsLive"
                    orientation="right"
                    domain={adsLiveYDomain}
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#6B7280" }}
                  />
                  <Tooltip
                    cursor={{ stroke: "#D1D5DB", strokeDasharray: "3 3" }}
                    content={(props: any) => {
                      const { active, label } = props;
                      if (!active || !label) return null;
                      const day = String(label);
                      const point = chartData.find((d) => d.date === day);
                      const launches = launchedScatter
                        .filter((s) => s.date === day)
                        .reduce((s, x) => s + x.ad_count, 0);
                      return (
                        <div
                          className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm text-xs"
                          style={{ minWidth: 160 }}
                        >
                          <div className="font-medium text-gray-900 mb-1">
                            {new Date(day).toLocaleDateString("en", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </div>
                          <TooltipRow color={COLORS.spend} label="Ad spend">
                            ${(point?.spend ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TooltipRow>
                          <TooltipRow color={COLORS.revenue} label="Code revenue">
                            ${(point?.revenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TooltipRow>
                          {launches > 0 && (
                            <TooltipRow color={COLORS.approved} label="New ads live">
                              {launches}
                            </TooltipRow>
                          )}
                          {point?.adsLive != null && (
                            <TooltipRow color={COLORS.adsLive} label="Ads live">
                              {point.adsLive}
                            </TooltipRow>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Line
                    yAxisId="dollars"
                    type="monotone"
                    dataKey="spend"
                    name="Ad spend"
                    stroke={COLORS.spend}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="dollars"
                    type="monotone"
                    dataKey="revenue"
                    name="Code revenue"
                    stroke={COLORS.revenue}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="adsLive"
                    type="stepAfter"
                    dataKey="adsLive"
                    name="Ads live"
                    stroke={COLORS.adsLive}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  {launchedScatter.length > 0 && (
                    <Scatter
                      yAxisId="dollars"
                      data={launchedScatter}
                      dataKey="y"
                      name="New ads live"
                      fill={COLORS.approved}
                      shape={(props: any) => {
                        const { cx, cy, payload } = props;
                        const r = approvedDotRadius(payload.ad_count || 1);
                        return (
                          <g>
                            <circle cx={cx} cy={cy} r={r} fill={COLORS.approved} />
                            <text
                              x={cx}
                              y={cy - r - 3}
                              textAnchor="middle"
                              fontSize="10"
                              fill={COLORS.approved}
                            >
                              {payload.ad_count}
                            </text>
                          </g>
                        );
                      }}
                    >
                      {launchedScatter.map((_, i) => (
                        <Cell key={i} />
                      ))}
                    </Scatter>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
          {!hasAdsLiveSeries && (
            <p className="text-[11px] text-gray-400 mt-3">
              The &ldquo;ads live&rdquo; series will populate as daily snapshots accumulate from the sync cron.
            </p>
          )}
        </div>

        {/* Live ads — also in the Ads tab */}
        <div className="mb-12">
          <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Live ads</h2>
          {liveAds.length === 0 ? (
            <p className="text-gray-500 text-sm">No active ads.</p>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-xs">Ad</th>
                    <th className="text-right px-4 py-2 font-medium text-xs">Spend</th>
                    <th className="text-right px-4 py-2 font-medium text-xs">ROAS</th>
                    <th className="text-right px-4 py-2 font-medium text-xs">CTR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {liveAds.map((ad) => {
                    const spendNum = parseFloat(ad.spend || "0");
                    // Compute ROAS from purchase_value / spend rather than Meta's
                    // `purchase_roas` field, which is keyed by action_type
                    // (varies between accounts: "purchase" vs "omni_purchase").
                    const roas =
                      ad.purchase_value != null && spendNum > 0
                        ? ad.purchase_value / spendNum
                        : ad.purchase_roas ?? null;
                    const ctr = ad.outbound_clicks_ctr ?? null;
                    const roasClass =
                      roas == null
                        ? "text-gray-400"
                        : roas >= 3
                        ? "text-green-700 font-medium"
                        : roas < 2
                        ? "text-red-600"
                        : "text-gray-800";
                    return (
                      <tr key={ad.id}>
                        <td className="px-4 py-2.5">
                          <div className="text-gray-900 font-medium leading-snug">{ad.name}</div>
                          <div className="text-xs text-gray-500">{ad.adset_name || "—"}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-800">
                          {formatMoneyDecimal(spendNum)}
                        </td>
                        <td className={`px-4 py-2.5 text-right ${roasClass}`}>
                          {roas != null ? `${roas.toFixed(2)}x` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-800">
                          {ctr != null ? `${ctr.toFixed(2)}%` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </>
        )}

        {/* Content tab */}
        {activeTab === "content" && (
          <div className="mb-12">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Content submissions</h2>
            {submissions.length === 0 ? (
              <p className="text-gray-500 text-sm">No content submitted yet.</p>
            ) : (
              <div className="space-y-2">
                {submissions.map((sub) => {
                  const files = Array.isArray(sub.files) ? sub.files : [];
                  const first = files[0];
                  const isImage = first?.mime_type?.startsWith("image/");
                  const isVideo = first?.mime_type?.startsWith("video/");
                  const submittedDate = sub.submitted_at || sub.created_at;
                  return (
                    <div
                      key={sub.id}
                      className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3"
                    >
                      <div className="w-12 h-16 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                        {isImage && first?.r2_url ? (
                          <img
                            src={first.r2_url}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : isVideo && first?.r2_url ? (
                          <video
                            src={first.r2_url}
                            preload="metadata"
                            className="w-full h-full object-cover"
                            muted
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                            {first?.name?.split(".").pop()?.toUpperCase() || "FILE"}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{monthLabel(sub.month)}</div>
                        <div className="text-xs text-gray-500">
                          {files.length} file{files.length !== 1 ? "s" : ""} · Submitted{" "}
                          {shortDate(submittedDate)}
                        </div>
                      </div>
                      <span className={statusPillClass(sub.status)}>
                        {sub.status === "revision_requested" ? "Revision requested" : sub.status}
                      </span>
                      <button
                        onClick={() => setReviewingId(sub.id)}
                        className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                      >
                        Review
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Styles tab */}
        {activeTab === "styles" && (
          <div className="mb-12">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3">Styles</h2>
            {sampleRequests.length === 0 ? (
              <p className="text-gray-500 text-sm">No styles requested yet.</p>
            ) : (
              <div className="space-y-2">
                {sampleRequests.map((req) => {
                  const sels = Array.isArray(req.selections) ? req.selections : [];
                  const itemCount = sels.reduce((s, sel) => s + (Number(sel.quantity) || 1), 0);
                  return (
                    <div
                      key={req.id}
                      className="bg-white border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="text-sm font-medium text-gray-900">
                          Style request · {itemCount} item{itemCount !== 1 ? "s" : ""} ·{" "}
                          <span className="text-gray-500 font-normal">{shortDate(req.created_at)}</span>
                        </div>
                        <span className={statusPillClass(req.status)}>{req.status}</span>
                      </div>
                      <div className="space-y-0.5 mb-2">
                        {sels.map((sel, i) => (
                          <div key={i} className="text-sm text-gray-700">
                            {sel.product_title}
                            {sel.variant_title && (
                              <span className="text-gray-400"> — {sel.variant_title}</span>
                            )}
                            {sel.quantity && sel.quantity > 1 && (
                              <span className="text-gray-400"> ×{sel.quantity}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="text-xs text-gray-400 font-mono">{req.id}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {reviewingSub && (
        <SubmissionReviewModal
          submission={reviewingSub}
          onClose={() => setReviewingId(null)}
          onAction={handleReviewAction}
        />
      )}
    </Shell>
  );
}

function Shell({
  children,
  currentUser,
  supabase,
  router,
}: {
  children: React.ReactNode;
  currentUser: any;
  supabase: ReturnType<typeof createClient>;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        activeTab="partners"
        onTabChange={() => {}}
        currentUser={currentUser}
        onLogout={async () => {
          await supabase.auth.signOut();
          router.push("/login");
        }}
      />
      <main className="flex-1 px-8 pt-12 pb-8 min-w-0">{children}</main>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  unavailable,
}: {
  label: string;
  value: string;
  subtitle: string;
  unavailable?: boolean;
}) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
      <div className="text-[11px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${unavailable ? "text-gray-400" : "text-gray-900"}`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
    </div>
  );
}

function TooltipRow({
  color,
  label,
  children,
}: {
  color: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="flex items-center gap-1.5 text-gray-600">
        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <span className="text-gray-900 font-medium">{children}</span>
    </div>
  );
}

function LegendDot({
  color,
  label,
  value,
  square,
  note,
}: {
  color: string;
  label: string;
  value: string;
  square?: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {square ? (
        <span
          className="inline-block w-2.5 h-2.5"
          style={{ backgroundColor: color }}
        />
      ) : (
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="text-gray-600">{label}</span>
      <span className="text-gray-900 font-medium">{value}</span>
      {note && <span className="text-gray-400">· {note}</span>}
    </div>
  );
}

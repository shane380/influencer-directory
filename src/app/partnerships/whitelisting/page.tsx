"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";
import { ArrowLeft } from "lucide-react";
import {
  DateRangePicker,
  resolveRange,
  type ResolvedRange,
  type RangePreset,
} from "@/components/partnerships/date-range-picker";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type DetailCreator = {
  id: string;
  influencer_id: string | null;
  creator_id: string | null;
  name: string | null;
  handle: string | null;
  photo: string | null;
  spend: number;
  outbound_ctr: number;
  purchase_value: number;
  roas: number | null;
  ads_live: number;
  approved_submissions: number;
  last_submission_at: string | null;
  series: Record<string, number>;
};

type WhitelistingDetail = {
  window: { start: string; end: string };
  granularity: "daily" | "monthly";
  dates: string[];
  creators: DetailCreator[];
};

// Distinct-enough palette; cycles if there are more lines than colours.
const LINE_COLORS = [
  "#1D9E75", "#3B82F6", "#EF4444", "#F59E0B", "#8B5CF6", "#EC4899",
  "#14B8A6", "#F97316", "#6366F1", "#84CC16", "#06B6D4", "#D946EF",
  "#0EA5E9", "#22C55E", "#EAB308", "#A855F7", "#F43F5E", "#10B981",
  "#7C3AED", "#DB2777", "#2563EB", "#65A30D", "#DC2626", "#0891B2",
];

const MAX_LINES = 24;

function formatMoney(n: number): string {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function formatMoneyDecimals(n: number): string {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}
function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}
function toTitleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .split(/(\s+|-)/)
    .map((part) => (/^\s+$/.test(part) || part === "-" ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join("");
}

export default function WhitelistingDetailPage() {
  const router = useRouter();
  const supabase = createClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [range, setRange] = useState<ResolvedRange>(() => resolveRange("30d"));
  const [data, setData] = useState<WhitelistingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Load the signed-in admin for the sidebar.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await (supabase.from("profiles") as any)
        .select("display_name, profile_photo_url, is_admin, is_manager")
        .eq("id", user.id)
        .single();
      setCurrentUser({
        displayName: profile?.display_name || user.email?.split("@")[0] || "User",
        email: user.email || "",
        profilePhotoUrl: profile?.profile_photo_url || null,
        isAdmin: profile?.is_admin || false,
        isManager: profile?.is_manager || false,
      });
    })();
  }, [supabase]);

  // Seed the range from the query string the "View more" link carried over.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const start = sp.get("start");
    const end = sp.get("end");
    const preset = sp.get("preset") as RangePreset | null;
    if (start && end) setRange({ start, end, preset: preset || "custom" });
  }, []);

  // Refetch whenever the shared range changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/partnerships/whitelisting-detail?start=${range.start}&end=${range.end}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  const creators = data?.creators || [];
  // Only creators that actually spent in the window get a line.
  const lineCreators = useMemo(
    () => creators.filter((c) => c.spend > 0).slice(0, MAX_LINES),
    [creators],
  );
  const colorFor = useMemo(() => {
    const m = new Map<string, string>();
    lineCreators.forEach((c, i) => m.set(c.id, LINE_COLORS[i % LINE_COLORS.length]));
    return m;
  }, [lineCreators]);

  // Merge per-creator series into Recharts rows: { date, [creatorId]: spend }.
  const chartData = useMemo(() => {
    const dates = data?.dates || [];
    return dates.map((date) => {
      const row: Record<string, number | string> = { date };
      for (const c of lineCreators) row[c.id] = c.series[date] || 0;
      return row;
    });
  }, [data?.dates, lineCreators]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of creators) m.set(c.id, toTitleCase(c.name) || c.handle || "—");
    return m;
  }, [creators]);

  const granularity = data?.granularity ?? "daily";
  const hasLines = lineCreators.length > 0;

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
      <main className="flex-1 px-8 pt-12 pb-8">
        <div>
          <a
            href="/partnerships/creators"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-3"
          >
            <ArrowLeft className="h-4 w-4" /> Back to partners
          </a>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Whitelisting performance</h1>
              <p className="text-sm text-gray-500 mt-0.5">Spend per creator, submissions, live ads and efficiency.</p>
            </div>
            <DateRangePicker value={range} onChange={setRange} />
          </div>

          {/* Full-width spend chart */}
          <div className="bg-white border border-gray-200 rounded-lg px-4 py-4 mb-4">
            <h2 className="text-[13px] font-medium text-gray-900 mb-3">Ad spend by creator</h2>
            <div className="h-80">
              {loading ? (
                <div className="h-full bg-gray-50 rounded animate-pulse" />
              ) : !hasLines ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-500">
                  No ad spend in this window.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#F3F4F6" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      tickFormatter={(d) => {
                        const date = new Date(d);
                        return granularity === "monthly"
                          ? date.toLocaleDateString("en", { month: "short" })
                          : date.toLocaleDateString("en", { month: "short", day: "numeric" });
                      }}
                      minTickGap={24}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      tickFormatter={(v) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${v}`)}
                      width={48}
                    />
                    <Tooltip
                      cursor={{ stroke: "#D1D5DB", strokeDasharray: "3 3" }}
                      content={(props: any) => {
                        const { active, label, payload } = props;
                        if (!active || !label || !payload?.length) return null;
                        const date = new Date(label);
                        const rows = payload
                          .filter((p: any) => Number(p.value) > 0)
                          .sort((a: any, b: any) => Number(b.value) - Number(a.value))
                          .slice(0, 10);
                        if (rows.length === 0) return null;
                        return (
                          <div className="bg-white border border-gray-200 rounded-md px-3 py-2 shadow-sm text-xs" style={{ minWidth: 180 }}>
                            <div className="font-medium text-gray-900 mb-1">
                              {granularity === "monthly"
                                ? date.toLocaleDateString("en", { month: "long", year: "numeric" })
                                : date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
                            </div>
                            {rows.map((p: any) => (
                              <div key={p.dataKey} className="flex items-center justify-between gap-3 text-gray-700">
                                <span className="flex items-center gap-1.5 min-w-0">
                                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.stroke }} />
                                  <span className="truncate">{nameById.get(p.dataKey) || p.dataKey}</span>
                                </span>
                                <span className="font-medium">{formatMoneyDecimals(Number(p.value))}</span>
                              </div>
                            ))}
                          </div>
                        );
                      }}
                    />
                    {lineCreators.map((c) => {
                      const color = colorFor.get(c.id)!;
                      const dimmed = hoveredId != null && hoveredId !== c.id;
                      return (
                        <Line
                          key={c.id}
                          type="monotone"
                          dataKey={c.id}
                          stroke={color}
                          strokeWidth={hoveredId === c.id ? 2.5 : 1.5}
                          strokeOpacity={dimmed ? 0.15 : 1}
                          dot={false}
                          activeDot={{ r: 3 }}
                          isAnimationActive={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Interactive legend — hover to highlight a line + see period stats */}
            {hasLines && (
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-gray-200">
                {lineCreators.map((c) => (
                  <div
                    key={c.id}
                    className="group relative flex items-center gap-1.5 cursor-default"
                    onMouseEnter={() => setHoveredId(c.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorFor.get(c.id) }} />
                    <span className="text-xs text-gray-700">{nameById.get(c.id)}</span>
                    {/* Popover: this creator's stats for the selected period */}
                    <div className="hidden group-hover:block absolute z-10 bottom-full left-0 mb-1.5 w-52 bg-white border border-gray-200 rounded-md shadow-lg px-3 py-2 text-xs">
                      <div className="font-medium text-gray-900 mb-1.5">{nameById.get(c.id)}</div>
                      <StatLine label="Spend" value={formatMoney(c.spend)} />
                      <StatLine label="Outbound CTR" value={`${c.outbound_ctr.toFixed(2)}%`} />
                      <StatLine label="Conversion value" value={formatMoney(c.purchase_value)} />
                      <StatLine label="ROAS" value={c.roas != null ? `${c.roas.toFixed(2)}x` : "—"} />
                    </div>
                  </div>
                ))}
                {creators.filter((c) => c.spend > 0).length > MAX_LINES && (
                  <span className="text-[11px] text-gray-400">+{creators.filter((c) => c.spend > 0).length - MAX_LINES} more (see table)</span>
                )}
              </div>
            )}
          </div>

          {/* Per-creator table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Creator</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Approved videos</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Last submission</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Ads live</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Spend</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Outbound CTR</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Conv. value</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">Loading…</td></tr>
                ) : creators.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">No whitelisting activity in this window.</td></tr>
                ) : (
                  creators.map((c) => {
                    const displayName = toTitleCase(c.name) || c.handle || "—";
                    const nameCell = (
                      <div className="flex items-center gap-3">
                        {c.photo ? (
                          <img src={c.photo} alt="" className="w-8 h-8 rounded-full object-cover bg-gray-200 flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-medium flex-shrink-0">
                            {initialsFor(displayName)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{displayName}</div>
                          {c.handle && <div className="text-gray-500 text-xs truncate">@{c.handle}</div>}
                        </div>
                      </div>
                    );
                    return (
                      <tr key={c.id} className="border-b border-gray-200 last:border-b-0 hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          {c.creator_id ? (
                            <a href={`/partnerships/creators/${c.creator_id}`} className="hover:underline">{nameCell}</a>
                          ) : (
                            nameCell
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{c.approved_submissions.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs">{formatDate(c.last_submission_at)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {c.ads_live > 0 ? c.ads_live.toLocaleString() : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {c.spend > 0 ? formatMoney(c.spend) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {c.outbound_ctr > 0 ? `${c.outbound_ctr.toFixed(2)}%` : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {c.purchase_value > 0 ? formatMoney(c.purchase_value) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">
                          {c.roas != null ? `${c.roas.toFixed(2)}x` : <span className="text-gray-400">—</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

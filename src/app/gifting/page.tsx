"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";
import { KpiCard } from "@/components/partnerships/kpi-card";
import { RangePicker, type RangeOption } from "@/components/partnerships/range-picker";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

type Range = "6m" | "12m";

const RANGE_OPTIONS: RangeOption<Range>[] = [
  { value: "6m", label: "6M" },
  { value: "12m", label: "12M" },
];

type GiftStats = {
  range: Range;
  series: Array<{ date: string; gifts: number }>;
  gifts_this_month: number;
  growth_pct_vs_last_month: number | null;
};

type GiftStatus = "green" | "yellow" | "red";

type PrPartner = {
  influencer_id: string;
  name: string;
  handle: string | null;
  photo: string | null;
  last_gift_date: string | null;
  last_product: string | null;
  weeks_since: number | null;
  status: GiftStatus;
};

const statusDot: Record<GiftStatus, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

function monthLabel(dateStr: string): string {
  // dateStr is "YYYY-MM-01"
  const [y, m] = dateStr.split("-");
  return new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, 1)).toLocaleString("en", {
    month: "short",
  });
}

function weeksLabel(weeks: number | null): string {
  if (weeks === null) return "Never";
  return `${weeks} wk${weeks === 1 ? "" : "s"}`;
}

export default function GiftingDashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [currentUser, setCurrentUser] = useState<{
    displayName: string;
    email: string;
    profilePhotoUrl: string | null;
    isAdmin: boolean;
    isManager: boolean;
  } | null>(null);

  const [range, setRange] = useState<Range>("6m");
  const [stats, setStats] = useState<GiftStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [prList, setPrList] = useState<PrPartner[] | null>(null);
  const [prLoading, setPrLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
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
      }
    }
    load();
  }, [supabase]);

  // Monthly gift stats — refetch on range change.
  useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    fetch(`/api/gifting/stats?range=${range}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setStatsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  // PR list — fetched once.
  useEffect(() => {
    fetch(`/api/gifting/pr-list`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setPrList(data?.partners || []);
        setPrLoading(false);
      })
      .catch(() => setPrLoading(false));
  }, []);

  const onPrList = prList?.length ?? 0;
  const dueSoon = (prList || []).filter((p) => p.status === "yellow").length;
  const overdue = (prList || []).filter((p) => p.status === "red").length;
  const maxGifts = Math.max(1, ...((stats?.series || []).map((s) => s.gifts)));

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        activeTab="gifting"
        onTabChange={() => {}}
        currentUser={currentUser}
        onLogout={async () => {
          await supabase.auth.signOut();
          router.push("/login");
        }}
      />
      <main className="flex-1 px-8 pt-12 pb-8">
        <div>
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">Gifting/PR</h1>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {statsLoading || !stats ? (
              <KpiCard label="Gifts sent this month" value="—" />
            ) : (
              <KpiCard
                label="Gifts sent this month"
                value={stats.gifts_this_month.toLocaleString()}
                subtitle={
                  stats.growth_pct_vs_last_month == null
                    ? "vs last month"
                    : `${stats.growth_pct_vs_last_month >= 0 ? "↑" : "↓"} ${Math.abs(
                        stats.growth_pct_vs_last_month,
                      )}% vs last month`
                }
                subtitleTone={
                  stats.growth_pct_vs_last_month == null
                    ? "default"
                    : stats.growth_pct_vs_last_month >= 0
                      ? "success"
                      : "danger"
                }
              />
            )}
            <KpiCard
              label="On PR list"
              value={prLoading ? "—" : onPrList.toLocaleString()}
            />
            <KpiCard
              label="Due soon"
              value={prLoading ? "—" : dueSoon.toLocaleString()}
              subtitle="4–9 weeks"
            />
            <KpiCard
              label="Overdue"
              value={prLoading ? "—" : overdue.toLocaleString()}
              subtitle="10+ weeks"
              subtitleTone={overdue > 0 ? "danger" : "default"}
            />
          </div>

          {/* Gifts per month chart */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-gray-900">Gifts sent per month</h2>
              <RangePicker<Range> value={range} onChange={setRange} options={RANGE_OPTIONS} />
            </div>
            <div className="h-64">
              {statsLoading || !stats ? (
                <div className="h-full w-full animate-pulse bg-gray-50 rounded" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={monthLabel}
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      domain={[0, Math.ceil(maxGifts * 1.2)]}
                      tick={{ fontSize: 11, fill: "#9ca3af" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: "#f9fafb" }}
                      labelFormatter={(v) => monthLabel(String(v))}
                      formatter={(value) => [`${value} gifts`, "Gifts"]}
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                      }}
                    />
                    <Bar dataKey="gifts" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* PR list table */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-medium text-gray-900">PR List</h2>
              <span className="text-xs text-gray-400">
                Recurring gifting · target every 30–45 days
              </span>
            </div>

            {prLoading ? (
              <div className="px-6 py-10 text-sm text-gray-400 text-center">Loading…</div>
            ) : !prList || prList.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-gray-500">No influencers on the PR list yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Set an influencer&apos;s partnership type to &quot;PR List&quot; to add them here.
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="px-6 py-2.5 font-medium">Partner</th>
                    <th className="px-6 py-2.5 font-medium">Since last gift</th>
                    <th className="px-6 py-2.5 font-medium">Last sent</th>
                  </tr>
                </thead>
                <tbody>
                  {prList.map((p) => (
                    <tr
                      key={p.influencer_id}
                      onClick={() => router.push(`/partnerships/creators/${p.influencer_id}`)}
                      className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          {p.photo ? (
                            <Image
                              src={p.photo}
                              alt={p.name}
                              width={36}
                              height={36}
                              className="rounded-full flex-shrink-0 object-cover h-9 w-9"
                              unoptimized
                            />
                          ) : (
                            <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-medium text-gray-500">
                                {initials(p.name)}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {p.name}
                            </div>
                            {p.handle && (
                              <div className="text-xs text-gray-400 truncate">
                                @{p.handle.replace(/^@/, "")}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${statusDot[p.status]}`}
                          />
                          <span className="text-sm text-gray-700">{weeksLabel(p.weeks_since)}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-sm text-gray-500 truncate block max-w-xs">
                          {p.last_product || "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

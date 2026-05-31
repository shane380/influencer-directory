"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";
import { KpiCard } from "@/components/partnerships/kpi-card";
import { RangePicker, type RangeOption } from "@/components/partnerships/range-picker";
import { InfluencerDialog } from "@/components/influencer-dialog";
import { OrderDialog } from "@/components/order-dialog";
import type { Influencer, CampaignInfluencer } from "@/types/database";
import { Search, X, Plus, Check, ShoppingCart } from "lucide-react";
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
  order_status: string | null;
  weeks_since: number | null;
  status: GiftStatus;
};

type SearchResult = {
  id: string;
  name: string;
  instagram_handle: string | null;
  profile_photo_url: string | null;
  partnership_type: string;
};

const statusDot: Record<GiftStatus, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

// Order fulfillment status — mirrors the campaign tables' Order column styling.
const orderDots: Record<string, string> = {
  placed: "bg-amber-400",
  shipped: "bg-purple-400",
  delivered: "bg-green-500",
};
const orderLabels: Record<string, string> = {
  placed: "Placed",
  shipped: "Shipped",
  delivered: "Delivered",
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

function monthLabel(dateStr: string): string {
  // dateStr is "YYYY-MM-01" representing a calendar month. Format in UTC so a
  // negative-offset local timezone doesn't roll midnight back to the prior month.
  const [y, m] = dateStr.split("-");
  return new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, 1)).toLocaleString("en", {
    month: "short",
    timeZone: "UTC",
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

  // Add-to-PR-list modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Influencer profile modal (opened by clicking a row)
  const [profileInfluencer, setProfileInfluencer] = useState<Influencer | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // Order dialog (opened by clicking the Order cell)
  const [orderInfluencer, setOrderInfluencer] = useState<Influencer | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);

  const fetchPrList = useCallback(() => {
    return fetch(`/api/gifting/pr-list`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setPrList(data?.partners || []);
        setPrLoading(false);
      })
      .catch(() => setPrLoading(false));
  }, []);

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
    fetchPrList();
  }, [fetchPrList]);

  // Debounced influencer search for the add modal.
  useEffect(() => {
    if (!showAddModal) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const { data } = await (supabase.from("influencers") as any)
        .select("id, name, instagram_handle, profile_photo_url, partnership_type")
        .or(`name.ilike.%${q}%,instagram_handle.ilike.%${q}%`)
        .order("name", { ascending: true })
        .limit(20);
      setSearchResults((data as SearchResult[]) || []);
      setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery, showAddModal, supabase]);

  async function handleAddToPrList(inf: SearchResult) {
    setAddingId(inf.id);
    const { error } = await (supabase.from("influencers") as any)
      .update({ partnership_type: "pr_list" })
      .eq("id", inf.id);
    if (!error) {
      // Reflect the change in the open search list and refresh the table beneath.
      setSearchResults((prev) =>
        prev.map((r) => (r.id === inf.id ? { ...r, partnership_type: "pr_list" } : r)),
      );
      await fetchPrList();
    }
    setAddingId(null);
  }

  function closeAddModal() {
    setShowAddModal(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  async function fetchInfluencer(influencerId: string): Promise<Influencer | null> {
    const { data } = await (supabase.from("influencers") as any)
      .select("*")
      .eq("id", influencerId)
      .single();
    return (data as Influencer) || null;
  }

  // Open the influencer profile modal — fetch the full record by id.
  async function openProfile(influencerId: string) {
    const inf = await fetchInfluencer(influencerId);
    if (inf) {
      setProfileInfluencer(inf);
      setProfileOpen(true);
    }
  }

  // Open the order dialog for an influencer (no campaign context).
  async function openOrderDialog(influencerId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const inf = await fetchInfluencer(influencerId);
    if (inf) {
      setOrderInfluencer(inf);
      setOrderOpen(true);
    }
  }

  // A campaign-less "virtual" campaign_influencer so OrderDialog works outside a
  // campaign (same pattern the whitelisting tab uses).
  function virtualCampaignInfluencer(inf: Influencer): CampaignInfluencer {
    return {
      id: `virtual-${inf.id}`,
      campaign_id: "",
      influencer_id: inf.id,
      compensation: null,
      notes: null,
      added_at: new Date().toISOString(),
      status: inf.relationship_status,
      partnership_type: inf.partnership_type,
      shopify_order_id: null,
      shopify_order_status: null,
      tracking_number: null,
      tracking_url: null,
      order_status_updated_at: null,
      shopify_real_order_id: null,
      product_selections: null,
      content_posted: "none",
      approval_status: null,
      approval_note: null,
      approved_at: null,
      approved_by: null,
    };
  }

  // Remove from the PR list = demote back to regular recurring gifting.
  async function handleRemoveFromPrList(p: PrPartner, e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Remove ${p.name} from the PR list?`)) return;
    setRemovingId(p.influencer_id);
    const { error } = await (supabase.from("influencers") as any)
      .update({ partnership_type: "gifted_recurring" })
      .eq("id", p.influencer_id);
    if (!error) await fetchPrList();
    setRemovingId(null);
  }

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
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-medium text-gray-900">PR List</h2>
                <span className="text-xs text-gray-400">
                  Recurring gifting · target every 30–45 days
                </span>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md hover:bg-gray-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add to PR list
              </button>
            </div>

            {prLoading ? (
              <div className="px-6 py-10 text-sm text-gray-400 text-center">Loading…</div>
            ) : !prList || prList.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-gray-500">No influencers on the PR list yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Use &quot;Add to PR list&quot; above to graduate an influencer to recurring gifting.
                </p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="px-6 py-2.5 font-medium">Partner</th>
                    <th className="px-6 py-2.5 font-medium">Since last gift</th>
                    <th className="px-6 py-2.5 font-medium">Last sent</th>
                    <th className="px-6 py-2.5 font-medium">Order</th>
                    <th className="px-6 py-2.5 font-medium w-px" />
                  </tr>
                </thead>
                <tbody>
                  {prList.map((p) => (
                    <tr
                      key={p.influencer_id}
                      onClick={() => openProfile(p.influencer_id)}
                      className="group border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer"
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
                      <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                        {p.order_status ? (
                          <button
                            onClick={(e) => openOrderDialog(p.influencer_id, e)}
                            className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
                          >
                            <span
                              className={`h-2 w-2 rounded-full flex-shrink-0 ${
                                orderDots[p.order_status] || "bg-gray-300"
                              }`}
                            />
                            {orderLabels[p.order_status] || p.order_status}
                          </button>
                        ) : (
                          <button
                            onClick={(e) => openOrderDialog(p.influencer_id, e)}
                            title="Create order"
                            className="text-gray-300 hover:text-gray-600"
                          >
                            <ShoppingCart className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={(e) => handleRemoveFromPrList(p, e)}
                          disabled={removingId === p.influencer_id}
                          title="Remove from PR list"
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-50"
                        >
                          {removingId === p.influencer_id ? (
                            <span className="text-xs text-gray-400">Removing…</span>
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>

      {/* Add-to-PR-list modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-24"
          onClick={closeAddModal}
        >
          <div
            className="w-full max-w-md bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-900">Add to PR list</h3>
              <button
                onClick={closeAddModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  autoFocus
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or handle…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                />
              </div>

              <div className="mt-3 max-h-80 overflow-y-auto">
                {searching ? (
                  <div className="py-8 text-center text-sm text-gray-400">Searching…</div>
                ) : searchQuery.trim() === "" ? (
                  <div className="py-8 text-center text-sm text-gray-400">
                    Start typing to find an influencer.
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400">No matches found.</div>
                ) : (
                  <ul className="space-y-1">
                    {searchResults.map((r) => {
                      const onList = r.partnership_type === "pr_list";
                      return (
                        <li
                          key={r.id}
                          className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-gray-50"
                        >
                          {r.profile_photo_url ? (
                            <Image
                              src={r.profile_photo_url}
                              alt={r.name}
                              width={32}
                              height={32}
                              className="rounded-full flex-shrink-0 object-cover h-8 w-8"
                              unoptimized
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-medium text-gray-500">
                                {initials(r.name)}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {r.name}
                            </div>
                            {r.instagram_handle && (
                              <div className="text-xs text-gray-400 truncate">
                                @{r.instagram_handle.replace(/^@/, "")}
                              </div>
                            )}
                          </div>
                          {onList ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 flex-shrink-0">
                              <Check className="h-3.5 w-3.5" />
                              On list
                            </span>
                          ) : (
                            <button
                              onClick={() => handleAddToPrList(r)}
                              disabled={addingId === r.id}
                              className="px-2.5 py-1 text-xs bg-gray-900 text-white rounded-md hover:bg-gray-800 transition-colors disabled:opacity-50 flex-shrink-0"
                            >
                              {addingId === r.id ? "Adding…" : "Add"}
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Influencer profile modal */}
      <InfluencerDialog
        open={profileOpen}
        onClose={() => {
          setProfileOpen(false);
          setProfileInfluencer(null);
        }}
        onSave={() => {
          setProfileOpen(false);
          setProfileInfluencer(null);
          fetchPrList();
        }}
        influencer={profileInfluencer}
      />

      {/* Order dialog */}
      {orderInfluencer && (
        <OrderDialog
          open={orderOpen}
          onClose={() => {
            setOrderOpen(false);
            setOrderInfluencer(null);
          }}
          onSave={() => {
            setOrderOpen(false);
            setOrderInfluencer(null);
            fetchPrList();
          }}
          influencer={orderInfluencer}
          campaignInfluencer={virtualCampaignInfluencer(orderInfluencer)}
        />
      )}
    </div>
  );
}

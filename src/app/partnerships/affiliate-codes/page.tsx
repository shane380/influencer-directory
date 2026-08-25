"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";
import { ArrowLeft, RefreshCw, ShieldAlert } from "lucide-react";
import { groupByCode, type CodeGroup } from "@/lib/code-leak-grouping";

type Signal = {
  id: string;
  affiliate_code: string;
  owner_name: string | null;
  signal_type: "coupon_referrer" | "referrer_mix" | "usage_spike";
  severity: "confirmed" | "high" | "medium";
  evidence: any;
  window_start: string;
  window_end: string;
  status: "open" | "acknowledged" | "resolved" | "ignored";
  first_detected_at: string;
  last_detected_at: string;
};

const SEVERITY_STYLE: Record<Signal["severity"], string> = {
  confirmed: "bg-red-50 text-red-700 border-red-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  medium: "bg-gray-100 text-gray-600 border-gray-200",
};

const SEVERITY_LABEL: Record<Signal["severity"], string> = {
  confirmed: "Confirmed leak",
  high: "Likely leak",
  medium: "Worth a look",
};

const TYPE_LABEL: Record<Signal["signal_type"], string> = {
  coupon_referrer: "Coupon site referral",
  referrer_mix: "Referrer mix",
  usage_spike: "Usage spike",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" });
}

/** Stacked referrer split. Returns null when the window held no orders. */
function MixBar({ mix }: { mix: any }) {
  const w = mix?.window;
  const total = w?.total || 0;
  if (!total) return null;
  const segments: Array<[number, string, string]> = [
    [w.social, "bg-emerald-500", "social"],
    [w.search, "bg-amber-500", "search"],
    [w.coupon, "bg-red-600", "coupon"],
    [w.direct, "bg-gray-400", "direct"],
    [w.other, "bg-gray-200", "other"],
  ];
  return (
    <div>
      <div className="flex h-2 rounded overflow-hidden w-full max-w-md">
        {segments.map(([n, color, label]) =>
          n > 0 ? (
            <div
              key={label}
              className={color}
              style={{ width: `${(n / total) * 100}%` }}
              title={`${label}: ${n} of ${total}`}
            />
          ) : null,
        )}
      </div>
      <div className="text-[11px] text-gray-500 mt-1">
        {Math.round((w.social / total) * 100)}% social ·{" "}
        {Math.round((w.search / total) * 100)}% search ·{" "}
        {Math.round((w.direct / total) * 100)}% direct · {total} orders
      </div>
    </div>
  );
}

export default function AffiliateCodeLeaksPage() {
  const router = useRouter();
  const supabase = createClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/code-leaks?status=${showAll ? "all" : "open,acknowledged"}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setSignals(json.signals || []);
      setStoreUrl(json.store_url || null);
      setLastScan(json.last_scan || null);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => {
    load();
  }, [load]);

  // Acts on every finding for one code: rotating a code fixes all of its
  // findings at once, so closing only the one you clicked would leave the card
  // half-handled.
  async function setGroupStatus(group: CodeGroup, status: Signal["status"]) {
    const ids = group.signals.map((s) => s.id);
    const idSet = new Set(ids);
    const previous = signals;

    setSignals((rows) =>
      showAll
        ? rows.map((r) => (idSet.has(r.id) ? { ...r, status } : r))
        : rows.filter((r) => !idSet.has(r.id) || status === "acknowledged"),
    );

    const res = await fetch("/api/admin/code-leaks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, status }),
    });
    if (!res.ok) {
      setSignals(previous);
      setError(`Could not update ${group.code}`);
      return;
    }
    load();
  }

  async function runScan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/code-leaks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Scan failed");
      await load();
    } catch (e: any) {
      setError(e.message || "Scan failed");
    } finally {
      setScanning(false);
    }
  }

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
        <a
          href="/partnerships/creators"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Back to partners
        </a>

        <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Affiliate code leaks</h1>
            <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">
              A healthy creator code is redeemed by people arriving from Instagram.
              Redemptions arriving from search, direct, or a coupon site are people who
              got the code somewhere other than the creator.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="text-sm px-3 py-2 rounded-md border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            >
              {showAll ? "Show open only" : "Show all"}
            </button>
            <button
              onClick={runScan}
              disabled={scanning}
              className="text-sm px-3 py-2 rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`} />
              {scanning ? "Scanning…" : "Run scan now"}
            </button>
          </div>
        </div>

        {lastScan?.last_run_at && (
          <p className="text-xs text-gray-500 mb-4">
            Last scan {formatDate(lastScan.last_run_at)} — {lastScan.codes_scanned ?? 0} codes,{" "}
            {lastScan.orders_scanned ?? 0} orders, {lastScan.signals_found ?? 0} findings.
          </p>
        )}

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-28 bg-white border border-gray-200 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : signals.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg px-6 py-12 text-center">
            <ShieldAlert className="h-6 w-6 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-gray-900">No codes flagged</p>
            <p className="text-sm text-gray-500 mt-1">
              Every tracked affiliate code looks clean for the current window.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groupByCode(signals).map((group) => (
              <div
                key={group.code}
                className="bg-white border border-gray-200 rounded-lg px-5 py-4"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${SEVERITY_STYLE[group.severity]}`}
                      >
                        {SEVERITY_LABEL[group.severity]}
                      </span>
                      {group.status !== "open" && (
                        <span className="text-[11px] text-gray-500 capitalize">
                          {group.status}
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 text-base font-semibold text-gray-900">
                      {group.ownerName || group.code}
                      {group.ownerName && (
                        <span className="font-normal text-gray-500"> · {group.code}</span>
                      )}
                    </div>

                    <div className="mt-2 max-w-md">
                      <MixBar mix={group.signals[0]?.evidence?.mix} />
                    </div>

                    {/* Each detector that fired, with its own evidence. */}
                    <div className="mt-3 space-y-2.5">
                      {group.signals.map((s) => {
                        const samples = (s.evidence?.samples || []) as Array<{
                          order_id: number;
                          created_at: string;
                          referring_site: string | null;
                        }>;
                        return (
                          <div
                            key={s.id}
                            className={`pl-3 border-l-2 ${
                              s.severity === "confirmed"
                                ? "border-red-400"
                                : s.severity === "high"
                                  ? "border-amber-400"
                                  : "border-gray-300"
                            }`}
                          >
                            <div className="text-[11px] text-gray-500">
                              {TYPE_LABEL[s.signal_type]}
                            </div>
                            <p className="text-sm text-gray-700 max-w-2xl">
                              {s.evidence?.summary || "—"}
                            </p>
                            {samples.length > 0 && (
                              <table className="mt-1 text-[11px] text-gray-500">
                                <tbody>
                                  {samples.map((o) => (
                                    <tr key={o.order_id}>
                                      <td className="pr-3 py-0.5 whitespace-nowrap">
                                        {(o.created_at || "").slice(0, 10)}
                                      </td>
                                      <td className="pr-3 py-0.5">
                                        {storeUrl ? (
                                          <a
                                            href={`https://${storeUrl}/admin/orders/${o.order_id}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-blue-600 hover:underline"
                                          >
                                            #{o.order_id}
                                          </a>
                                        ) : (
                                          `#${o.order_id}`
                                        )}
                                      </td>
                                      <td className="py-0.5 break-all">
                                        {o.referring_site || "(direct)"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-[11px] text-gray-400 mt-2.5">
                      {group.signals.length} finding
                      {group.signals.length === 1 ? "" : "s"} · first seen{" "}
                      {formatDate(group.firstDetected)} · last seen{" "}
                      {formatDate(group.lastDetected)}
                    </p>
                  </div>

                  {/* Actions apply to the whole code — one rotation fixes it all. */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {group.status === "open" && (
                      <button
                        onClick={() => setGroupStatus(group, "acknowledged")}
                        className="text-xs px-3 py-1.5 rounded-md border border-gray-200 hover:bg-gray-50"
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      onClick={() => setGroupStatus(group, "resolved")}
                      className="text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800"
                    >
                      Code rotated
                    </button>
                    <button
                      onClick={() => setGroupStatus(group, "ignored")}
                      className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                    >
                      Not a leak
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

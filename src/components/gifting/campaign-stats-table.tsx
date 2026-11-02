"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { CampaignStatsRow } from "@/app/api/gifting/campaign-stats/route";

type Scope = "open" | "all";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  planning: "bg-amber-50 text-amber-700",
  completed: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-100 text-gray-400",
};

function startLabel(iso: string | null): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Count with its share of the campaign's creators underneath, e.g. 73 / 37%.
function Cell({ value, of }: { value: number; of: number }) {
  const pct = of > 0 ? Math.round((value / of) * 100) : null;
  return (
    <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
      <div className="text-sm text-gray-900">{value.toLocaleString()}</div>
      {pct !== null && value > 0 ? <div className="text-[11px] text-gray-400">{pct}%</div> : null}
    </td>
  );
}

// One funnel row per campaign. Definitions match the stats panel on each
// campaign page; "opened" = submitted, or a view at least 30s after the invite.
export function CampaignStatsTable() {
  const [scope, setScope] = useState<Scope>("open");
  const [rows, setRows] = useState<CampaignStatsRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/gifting/campaign-stats?scope=${scope}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "Failed to load campaign stats");
        return body;
      })
      .then((body) => {
        if (!cancelled) setRows(body.campaigns || []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load campaign stats");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-4">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium text-gray-900">Campaign stats</h2>
          <span className="text-xs text-gray-400">
            {scope === "open" ? "planning and active campaigns" : "all campaigns"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setScope(scope === "open" ? "all" : "open")}
          className="text-xs text-gray-500 hover:text-gray-900 underline underline-offset-2"
        >
          {scope === "open" ? "Show completed" : "Hide completed"}
        </button>
      </div>

      {loading && !rows ? (
        <div className="px-6 py-10 text-sm text-gray-400 text-center">Loading…</div>
      ) : error ? (
        <div className="px-6 py-10 text-sm text-red-500 text-center">{error}</div>
      ) : !rows || rows.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-gray-500">No campaigns to show.</p>
        </div>
      ) : (
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <th className="px-6 py-2 text-left font-medium">Campaign</th>
                <th className="px-3 py-2 text-left font-medium">Start</th>
                <th className="px-3 py-2 text-right font-medium">Creators</th>
                <th className="px-3 py-2 text-right font-medium">Contacted</th>
                <th className="px-3 py-2 text-right font-medium">Invited</th>
                <th className="px-3 py-2 text-right font-medium" title="Submitted selects, or a view at least 30s after the invite">
                  Opened
                </th>
                <th className="px-3 py-2 text-right font-medium">Selects</th>
                <th className="px-3 py-2 text-right font-medium">Orders</th>
                <th className="px-3 py-2 text-right font-medium">Delivered</th>
                <th className="px-3 py-2 text-right font-medium">Posted</th>
                <th className="px-6 py-2 text-right font-medium" title="Replied or submitted selects, of those contacted">
                  Response
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-2.5 min-w-[12rem]">
                    <Link href={`/campaigns/${c.id}`} className="font-medium text-gray-900 hover:underline">
                      {c.name || "Untitled"}
                    </Link>
                    <span
                      className={`ml-2 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        STATUS_STYLES[c.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{startLabel(c.start_date)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-900">{c.creators.toLocaleString()}</td>
                  <Cell value={c.contacted} of={c.creators} />
                  <Cell value={c.invited} of={c.creators} />
                  <Cell value={c.opened} of={c.invited} />
                  <Cell value={c.selects} of={c.invited} />
                  <Cell value={c.orders} of={c.creators} />
                  <Cell value={c.delivered} of={c.creators} />
                  <Cell value={c.posted} of={c.creators} />
                  <td className="px-6 py-2.5 text-right tabular-nums whitespace-nowrap text-gray-900">
                    {c.response_rate === null ? "—" : `${c.response_rate}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

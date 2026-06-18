"use client";

// STATIC MOCKUP — payments rebuild (P0). No data, no API, no DB.
// Purpose: preview the new consolidated "stream-columns" layout on a Vercel
// preview URL before any real build. All numbers below are hardcoded samples.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";

type Row = {
  name: string;
  handle: string;
  payInfo: string; // where money is sent (method + detail)
  retainer: number;
  adSpend: number; // commission $
  affiliate: number; // commission $
  paid: number; // recorded payouts so far
  paidDate?: string; // when fully settled
  // verification detail (so the column amounts are clickable to show the math)
  adRate?: number; // % of spend
  affRate?: number; // % of net
  affOrders?: number;
  affRefunds?: number;
};

// Hardcoded sample creators (mix of the three streams; some paid/partial).
const SAMPLE: Row[] = [
  { name: "Mariana Nunes", handle: "maanuness", payInfo: "PayPal · mariananunes@gmail.com", retainer: 789.0, adSpend: 0, affiliate: 0, paid: 0 },
  { name: "Daisy McDermott", handle: "daisymcdermott", payInfo: "PayPal · daisymcdermott@gmail.com", retainer: 0, adSpend: 0, affiliate: 1909.55, paid: 687.9, affRate: 25, affOrders: 57, affRefunds: 921.01 },
  { name: "Molly Dalton", handle: "mollydalton", payInfo: "PayPal · mollydalton", retainer: 0, adSpend: 0, affiliate: 1282.45, paid: 0, affRate: 25, affOrders: 36, affRefunds: 644.98 },
  { name: "Rooted with Lily", handle: "rootedwithlily", payInfo: "PayPal · lilyscilabro@gmail.com", retainer: 0, adSpend: 170.21, affiliate: 10.85, paid: 0, adRate: 5, affRate: 10, affOrders: 1, affRefunds: 0 },
  { name: "Lissa DeLorenzo", handle: "lissade", payInfo: "PayPal · delorenzolissa@gmail.com", retainer: 0, adSpend: 42.61, affiliate: 11.46, paid: 0, adRate: 5, affRate: 10, affOrders: 1, affRefunds: 0 },
  { name: "Charlene Lee", handle: "hiicharlee", payInfo: "Bank ···9337", retainer: 0, adSpend: 47.6, affiliate: 0, paid: 0, adRate: 5 },
  { name: "Kaya Lachowsky", handle: "kayalachowsky", payInfo: "Bank ···8235", retainer: 0, adSpend: 59.69, affiliate: 0, paid: 59.69, paidDate: "Mar 12", adRate: 5 },
];

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (n: number) => (n > 0 ? `$${money(n)}` : "—");

type ComputedRow = Row & { earned: number; balance: number; status: string };

export default function PaymentsV2Mockup() {
  const router = useRouter();
  const [payFor, setPayFor] = useState<ComputedRow | null>(null);
  const [historyFor, setHistoryFor] = useState<ComputedRow | null>(null);
  const [breakdown, setBreakdown] = useState<{ row: ComputedRow; type: "ad" | "aff" } | null>(null);

  const rows: ComputedRow[] = SAMPLE.map((r) => {
    const earned = r.retainer + r.adSpend + r.affiliate;
    const balance = Math.round((earned - r.paid) * 100) / 100;
    const status = balance <= 0.01 ? "paid" : r.paid > 0 ? "partial" : "unpaid";
    return { ...r, earned, balance, status };
  });

  const totalOwed = rows.reduce((s, r) => s + r.earned, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const outstanding = totalOwed - totalPaid;

  const stub = { displayName: "Admin", email: "admin@namaclo.com", profilePhotoUrl: null, isAdmin: true, isManager: false };

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        activeTab="payments"
        onTabChange={() => {}}
        currentUser={stub}
        onLogout={async () => {
          await createClient().auth.signOut();
          router.push("/login");
        }}
      />
      <main className="flex-1 p-8 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Payments</h1>
            <p className="text-sm text-gray-500 mt-1">Manage creator payment runs · <span className="text-amber-600 font-medium">Preview mockup — sample data</span></p>
          </div>
          <select className="border border-gray-200 rounded px-3 py-2 text-sm bg-white" defaultValue="2026-03">
            <option value="2026-03">March 2026</option>
          </select>
        </div>

        {/* Summary — Owed · Paid · Outstanding (all three, for mid-batch tracking) */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Owed", value: totalOwed, color: "text-gray-900" },
            { label: "Paid", value: totalPaid, color: "text-green-600" },
            { label: "Outstanding", value: outstanding, color: "text-amber-600" },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-gray-200 rounded-lg px-5 py-4">
              <div className="text-[11px] uppercase tracking-wider text-gray-400">{c.label}</div>
              <div className={`text-2xl font-bold mt-1 ${c.color}`}>${money(c.value)}</div>
            </div>
          ))}
        </div>

        {/* Stream-columns table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-gray-500">
                <th className="text-left font-medium px-5 py-3">Creator</th>
                <th className="text-right font-medium px-3 py-3">Retainer</th>
                <th className="text-right font-medium px-3 py-3">Ad Spend</th>
                <th className="text-right font-medium px-3 py-3">Affiliate</th>
                <th className="text-right font-medium px-3 py-3">Earned</th>
                <th className="text-right font-medium px-3 py-3">Paid</th>
                <th className="text-right font-medium px-3 py-3">Balance</th>
                <th className="px-5 py-3 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.handle} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/40">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-xs text-gray-400">
                        {r.name[0]}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{r.name}</div>
                        <div className="text-xs text-gray-400">@{r.handle}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-gray-500">{r.payInfo}</span>
                          <span className="text-gray-300">·</span>
                          <button onClick={() => setHistoryFor(r)} className="text-[11px] text-blue-500 hover:underline">History</button>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700">{cell(r.retainer)}</td>
                  <td className="px-3 py-3 text-right">
                    {r.adSpend > 0 ? (
                      <button onClick={() => setBreakdown({ row: r, type: "ad" })} className="text-gray-700 hover:text-blue-600 hover:underline decoration-dotted underline-offset-2">${money(r.adSpend)}</button>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {r.affiliate > 0 ? (
                      <button onClick={() => setBreakdown({ row: r, type: "aff" })} className="text-gray-700 hover:text-blue-600 hover:underline decoration-dotted underline-offset-2">${money(r.affiliate)}</button>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-3 py-3 text-right font-medium text-gray-900">${money(r.earned)}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{r.paid > 0 ? `$${money(r.paid)}` : "—"}</td>
                  <td className={`px-3 py-3 text-right font-semibold ${r.balance > 0.01 ? "text-amber-600" : "text-green-600"}`}>
                    {r.balance > 0.01 ? `$${money(r.balance)}` : "$0.00"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {r.status === "paid" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">✓ Paid{r.paidDate ? ` · ${r.paidDate}` : ""}</span>
                    ) : (
                      <button
                        onClick={() => setPayFor(r)}
                        className="px-3 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-700"
                      >
                        {r.status === "partial" ? "Pay balance" : "Record Payment"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-gray-400 mt-4">
          Mockup only — buttons don’t save. Real version: one payment per creator covers all three streams; status &amp; balances are derived from the events + payouts ledgers.
        </p>
      </main>

      {/* Record Payment modal shell */}
      {payFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPayFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b">
              <div className="text-sm font-semibold text-gray-900">Record Payment — {payFor.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">Outstanding balance: ${money(payFor.earned - payFor.paid)}</div>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Amount sent</label>
                <input className="w-full border border-gray-200 rounded px-3 py-2 text-sm" defaultValue={money(payFor.earned - payFor.paid)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Date sent</label>
                  <input type="date" className="w-full border border-gray-200 rounded px-3 py-2 text-sm" defaultValue="2026-04-15" />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Method</label>
                  <select className="w-full border border-gray-200 rounded px-3 py-2 text-sm">
                    <option>PayPal</option><option>Bank</option><option>E-Transfer</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Covers month (optional)</label>
                <select className="w-full border border-gray-200 rounded px-3 py-2 text-sm">
                  <option>Auto — oldest unpaid first</option>
                  <option>March 2026</option><option>February 2026</option><option>January 2026</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Reference (optional)</label>
                <input className="w-full border border-gray-200 rounded px-3 py-2 text-sm" placeholder="PayPal txn id / note" />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setPayFor(null)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={() => setPayFor(null)} className="px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium">Record</button>
            </div>
          </div>
        </div>
      )}

      {/* History modal (stub) — per-creator earnings + payments over time */}
      {historyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setHistoryFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b">
              <div className="text-sm font-semibold text-gray-900">{historyFor.name} — History</div>
              <div className="text-xs text-gray-500 mt-0.5">{historyFor.payInfo}</div>
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">Earned by month</div>
                <table className="w-full text-xs">
                  <tbody>
                    {[
                      { m: "March 2026", e: historyFor.earned, paid: historyFor.paid },
                      { m: "February 2026", e: 1206.81, paid: 0 },
                      { m: "January 2026", e: 725.81, paid: 0 },
                    ].map((x) => (
                      <tr key={x.m} className="border-b border-gray-50">
                        <td className="py-2 text-gray-700">{x.m}</td>
                        <td className="py-2 text-right text-gray-900">${money(x.e)} earned</td>
                        <td className="py-2 text-right text-gray-500">{x.paid > 0 ? `$${money(x.paid)} paid` : "unpaid"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">Payments received</div>
                {historyFor.paid > 0 ? (
                  <div className="text-xs text-gray-700">May 17, 2026 · ${money(historyFor.paid)} · PayPal</div>
                ) : (
                  <div className="text-xs text-gray-400">No payments recorded yet.</div>
                )}
              </div>
            </div>
            <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between text-xs">
              <span className="text-gray-500">Stub — real version pulls from the events + payouts ledgers</span>
              <button onClick={() => setHistoryFor(null)} className="text-gray-600">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Stream breakdown — click an Ad Spend / Affiliate amount to verify the math */}
      {breakdown && (() => {
        const r = breakdown.row;
        const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
          <div className={`flex items-center justify-between py-1.5 ${strong ? "border-t mt-1 pt-2 font-semibold text-gray-900" : "text-gray-600"}`}>
            <span>{label}</span><span className="tabular-nums">{value}</span>
          </div>
        );
        const adSpendBasis = r.adRate ? r.adSpend / (r.adRate / 100) : 0;
        const affNet = r.affRate ? r.affiliate / (r.affRate / 100) : 0;
        const affGross = affNet + (r.affRefunds || 0);
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setBreakdown(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b">
              <div className="text-sm font-semibold text-gray-900">
                {breakdown.type === "ad" ? "Ad Spend commission" : "Affiliate commission"} — {r.name}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">March 2026</div>
            </div>
            <div className="px-6 py-4 text-sm">
              {breakdown.type === "ad" ? (
                <>
                  <Line label="Ad spend (March)" value={`$${money(adSpendBasis)}`} />
                  <Line label="Commission rate" value={`× ${r.adRate}%`} />
                  <Line label="Commission" value={`$${money(r.adSpend)}`} strong />
                </>
              ) : (
                <>
                  <Line label={`${r.affOrders} orders · gross`} value={`$${money(affGross)}`} />
                  <Line label="Refunds" value={`−$${money(r.affRefunds || 0)}`} />
                  <Line label="Net" value={`$${money(affNet)}`} />
                  <Line label="Commission rate" value={`× ${r.affRate}%`} />
                  <Line label="Commission" value={`$${money(r.affiliate)}`} strong />
                </>
              )}
            </div>
            <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between text-xs">
              <button className="text-blue-500 hover:underline">
                {breakdown.type === "ad" ? "View ad-by-ad →" : "Audit orders →"}
              </button>
              <button onClick={() => setBreakdown(null)} className="text-gray-600">Close</button>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

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
  retainer: number;
  adSpend: number;
  affiliate: number;
  paid: number; // recorded payouts so far
  method?: string;
  paidDate?: string; // when fully settled
};

// Hardcoded sample creators (mix of the three streams; some paid/partial).
const SAMPLE: Row[] = [
  { name: "Mariana Nunes", handle: "maanuness", retainer: 789.0, adSpend: 0, affiliate: 0, paid: 0 },
  { name: "Daisy McDermott", handle: "daisymcdermott", retainer: 0, adSpend: 0, affiliate: 1909.55, paid: 687.9, method: "PayPal" },
  { name: "Molly Dalton", handle: "mollydalton", retainer: 0, adSpend: 0, affiliate: 1282.45, paid: 0 },
  { name: "Rooted with Lily", handle: "rootedwithlily", retainer: 0, adSpend: 170.21, affiliate: 10.85, paid: 0 },
  { name: "Lissa DeLorenzo", handle: "lissade", retainer: 0, adSpend: 42.61, affiliate: 11.46, paid: 0 },
  { name: "Charlene Lee", handle: "hiicharlee", retainer: 0, adSpend: 47.6, affiliate: 0, paid: 0 },
  { name: "Kaya Lachowsky", handle: "kayalachowsky", retainer: 0, adSpend: 59.69, affiliate: 0, paid: 59.69, method: "Bank", paidDate: "Mar 12" },
];

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (n: number) => (n > 0 ? `$${money(n)}` : "—");

type ComputedRow = Row & { earned: number; balance: number; status: string };

export default function PaymentsV2Mockup() {
  const router = useRouter();
  const [payFor, setPayFor] = useState<ComputedRow | null>(null);

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
                        <div className="text-xs text-gray-400">@{r.handle}{r.method ? ` · ${r.method}` : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-gray-700">{cell(r.retainer)}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{cell(r.adSpend)}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{cell(r.affiliate)}</td>
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
    </div>
  );
}

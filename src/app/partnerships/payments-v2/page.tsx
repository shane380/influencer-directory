"use client";

// Consolidated payments dashboard (P3) — reads the commission_events + payouts
// ledgers. One row per creator: their retainer/ad-spend/affiliate streams summed,
// with earned/paid/balance derived. Record Payment writes a real transfer.

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";

interface Creator {
  key: string; influencerId: string | null; legacyAffiliateId: string | null;
  name: string; handle: string; photo: string | null; payInfo: string;
  retainer: number; adSpend: number; affiliate: number;
  earned: number; paid: number; balance: number;
  adRate: number; adBasis: number; affRate: number; affOrders: number; affGross: number; affRefunds: number;
}

const money = (n: number) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (n: number) => (n > 0 ? `$${money(n)}` : "—");

function monthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  const start = new Date(2026, 0, 1);
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  while (d >= start) {
    opts.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleString("en", { month: "long", year: "numeric" }) });
    d.setMonth(d.getMonth() - 1);
  }
  return opts;
}
const periodLabel = (p: string) => { const [y, m] = p.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en", { month: "long", year: "numeric" }); };

export default function PaymentsV2() {
  const router = useRouter();
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [period, setPeriod] = useState(`${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`);
  const [data, setData] = useState<{ creators: Creator[]; totalOwed: number; totalPaid: number; outstanding: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [payFor, setPayFor] = useState<Creator | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", sent_at: "", method: "paypal", reference: "" });
  const [saving, setSaving] = useState(false);
  const [breakdown, setBreakdown] = useState<{ row: Creator; type: "ad" | "aff" } | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [historyFor, setHistoryFor] = useState<Creator | null>(null);
  const [historyData, setHistoryData] = useState<any>(null);
  const [histPayMonth, setHistPayMonth] = useState<string | null>(null);
  const [histPayForm, setHistPayForm] = useState({ amount: "", sent_at: "", method: "paypal", reference: "" });
  const [histSaving, setHistSaving] = useState(false);

  async function reveal(r: Creator) {
    if (!r.influencerId || revealed[r.key]) return; // legacy detail already shown; partners decrypt on demand
    try {
      const res = await fetch(`/api/admin/payment-info?influencer_id=${r.influencerId}`);
      if (res.ok) {
        const d = await res.json();
        const full = d.payment_method === "paypal" ? `PayPal · ${d.paypal_email || "—"}`
          : `${d.bank_institution || "Bank"} · acct ${d.bank_account_number || "—"} · routing ${d.bank_routing_number || "—"}`;
        setRevealed((p) => ({ ...p, [r.key]: full }));
      }
    } catch {}
  }
  async function fetchHistory(r: Creator) {
    const param = r.influencerId ? `influencer_id=${r.influencerId}` : `legacy_affiliate_id=${r.legacyAffiliateId}`;
    try { const res = await fetch(`/api/admin/payments-v2/history?${param}`); if (res.ok) return await res.json(); } catch {}
    return null;
  }
  async function openHistory(r: Creator) {
    setHistoryFor(r); setHistoryData(null); setHistPayMonth(null);
    setHistoryData(await fetchHistory(r));
  }
  const guessMethod = (info: string) => /paypal/i.test(info) ? "paypal" : /bank/i.test(info) ? "bank" : "paypal";

  async function recordHistoryPayment(monthPeriod: string | null) {
    if (!historyFor) return;
    const amt = Number(histPayForm.amount);
    if (!Number.isFinite(amt) || amt === 0 || !histPayForm.sent_at) return;
    setHistSaving(true);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: historyFor.influencerId, legacy_affiliate_id: historyFor.influencerId ? null : historyFor.legacyAffiliateId,
          amount: amt, sent_at: histPayForm.sent_at, method: histPayForm.method, reference: histPayForm.reference || null,
          covers_period: monthPeriod && monthPeriod !== "__pool__" ? monthPeriod : null,
        }),
      });
      if (res.ok) { setHistPayMonth(null); setHistoryData(await fetchHistory(historyFor)); load(); }
    } catch {}
    setHistSaving(false);
  }

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user ? { displayName: user.user_metadata?.display_name || "Admin", email: user.email, profilePhotoUrl: null, isAdmin: true, isManager: false } : null);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payments-v2?period=${period}`);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  }, [period]);
  useEffect(() => { load(); }, [load]);

  async function recordPayment() {
    if (!payFor) return;
    const amt = Number(payForm.amount);
    if (!Number.isFinite(amt) || amt === 0 || !payForm.sent_at) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: payFor.influencerId, legacy_affiliate_id: payFor.influencerId ? null : payFor.legacyAffiliateId,
          amount: amt, sent_at: payForm.sent_at, method: payForm.method, reference: payForm.reference || null, covers_period: period,
        }),
      });
      if (res.ok) { setPayFor(null); await load(); }
    } catch {}
    setSaving(false);
  }

  const creators = data?.creators || [];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar activeTab="payments" onTabChange={() => {}} currentUser={currentUser}
        onLogout={async () => { await createClient().auth.signOut(); router.push("/login"); }} />
      <main className="flex-1 p-8 overflow-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Payments</h1>
            <p className="text-sm text-gray-500 mt-1">Manage creator payment runs</p>
          </div>
          <select className="border border-gray-200 rounded px-3 py-2 text-sm bg-white" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {monthOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Owed", value: data?.totalOwed || 0, color: "text-gray-900" },
            { label: "Paid", value: data?.totalPaid || 0, color: "text-green-600" },
            { label: "Outstanding", value: data?.outstanding || 0, color: "text-amber-600" },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-gray-200 rounded-lg px-5 py-4">
              <div className="text-[11px] uppercase tracking-wider text-gray-400">{c.label}</div>
              <div className={`text-2xl font-bold mt-1 ${c.color}`}>${money(c.value)}</div>
            </div>
          ))}
        </div>

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
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">Loading…</td></tr>
              ) : creators.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-gray-400">No earnings for {periodLabel(period)}.</td></tr>
              ) : creators.map((r) => {
                const status = r.balance <= 0.01 ? "paid" : r.paid > 0 ? "partial" : "unpaid";
                return (
                  <tr key={r.key} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/40">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center text-xs text-gray-400">
                          {r.photo ? <img src={r.photo} alt="" className="w-full h-full object-cover" /> : r.name[0]}
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">{r.name}</div>
                          <div className="text-xs text-gray-400">@{r.handle}</div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                            <button onClick={() => reveal(r)} className="text-gray-500 hover:text-gray-800" title={r.influencerId ? "Click to reveal full details (logged)" : ""}>{revealed[r.key] || r.payInfo}</button>
                            <span className="text-gray-300">·</span>
                            <button onClick={() => openHistory(r)} className="text-blue-500 hover:underline">History</button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700">{cell(r.retainer)}</td>
                    <td className="px-3 py-3 text-right">{r.adSpend > 0 ? <button onClick={() => setBreakdown({ row: r, type: "ad" })} className="text-gray-700 hover:text-gray-900" title="Breakdown">${money(r.adSpend)}</button> : <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-3 text-right">{Math.abs(r.affiliate) > 0.005 ? <button onClick={() => setBreakdown({ row: r, type: "aff" })} className="text-gray-700 hover:text-gray-900" title="Breakdown">${money(r.affiliate)}</button> : <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-3 text-right font-medium text-gray-900">${money(r.earned)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{r.paid > 0 ? `$${money(r.paid)}` : "—"}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${r.balance > 0.01 ? "text-amber-600" : "text-green-600"}`}>${money(r.balance)}</td>
                    <td className="px-5 py-3 text-right">
                      {status === "paid" ? <span className="text-xs text-green-600 font-medium">✓ Paid</span> : (
                        <button onClick={() => { setPayFor(r); setPayForm({ amount: money(r.balance), sent_at: new Date().toISOString().slice(0, 10), method: "paypal", reference: "" }); }}
                          className="px-3 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-700">
                          {status === "partial" ? "Pay balance" : "Record Payment"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* Record Payment */}
      {payFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPayFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b">
              <div className="text-sm font-semibold text-gray-900">Record Payment — {payFor.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{payFor.payInfo} · balance ${money(payFor.balance)} · covers {periodLabel(period)}</div>
            </div>
            <div className="p-6 space-y-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Amount sent</label>
                <input type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} className="w-full border border-gray-200 rounded px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Date sent</label>
                  <input type="date" value={payForm.sent_at} onChange={(e) => setPayForm({ ...payForm, sent_at: e.target.value })} className="w-full border border-gray-200 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Method</label>
                  <select value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })} className="w-full border border-gray-200 rounded px-3 py-2 text-sm">
                    <option value="paypal">PayPal</option><option value="bank">Bank</option><option value="e_transfer">E-Transfer</option><option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Reference (optional)</label>
                <input value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} className="w-full border border-gray-200 rounded px-3 py-2 text-sm" placeholder="PayPal txn id / note" />
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setPayFor(null)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={recordPayment} disabled={saving || !payForm.amount || !payForm.sent_at} className="px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium disabled:opacity-40">{saving ? "…" : "Record"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Stream breakdown — verify the math */}
      {breakdown && (() => {
        const r = breakdown.row;
        const affNet = r.affGross - r.affRefunds;
        const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
          <div className={`flex items-center justify-between py-1.5 ${strong ? "border-t mt-1 pt-2 font-semibold text-gray-900" : "text-gray-600"}`}><span>{label}</span><span className="tabular-nums">{value}</span></div>
        );
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setBreakdown(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b">
                <div className="text-sm font-semibold text-gray-900">{breakdown.type === "ad" ? "Ad Spend commission" : "Affiliate commission"} — {r.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{periodLabel(period)}</div>
              </div>
              <div className="px-6 py-4 text-sm">
                {breakdown.type === "ad" ? (
                  <>
                    <Line label="Ad spend" value={`$${money(r.adBasis)}`} />
                    <Line label="Commission rate" value={`× ${Math.round(r.adRate * 100)}%`} />
                    <Line label="Commission" value={`$${money(r.adSpend)}`} strong />
                  </>
                ) : (
                  <>
                    <Line label={`${r.affOrders} orders · gross`} value={`$${money(r.affGross)}`} />
                    <Line label="Refunds" value={`−$${money(r.affRefunds)}`} />
                    <Line label="Net" value={`$${money(affNet)}`} />
                    <Line label="Commission rate" value={`× ${Math.round(r.affRate * 100)}%`} />
                    <Line label="Commission" value={`$${money(r.affiliate)}`} strong />
                  </>
                )}
              </div>
              <div className="px-6 py-3 border-t bg-gray-50 text-right">
                <button onClick={() => setBreakdown(null)} className="text-gray-600 text-xs">Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* History — earned by month + payments received */}
      {historyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setHistoryFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b">
              <div className="text-sm font-semibold text-gray-900">{historyFor.name} — History</div>
              {historyData && <div className="text-xs text-gray-500 mt-0.5">Earned ${money(historyData.totalEarned)} · Paid ${money(historyData.totalPaid)} · Balance ${money(historyData.balance)}</div>}
            </div>
            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {!historyData ? <div className="text-xs text-gray-400">Loading…</div> : (() => {
                // FIFO allocation: payments pinned to a month settle that month first;
                // everything else is a pool applied to the oldest unpaid months first.
                // You record real transfers (date + amount) — the app figures out coverage.
                const months = [...historyData.earnedByMonth].sort((a: any, b: any) => a.period.localeCompare(b.period)); // oldest first
                const paidByMonth: Record<string, number> = {};
                let pool = 0;
                for (const p of historyData.payments || []) {
                  if (p.covers_period) paidByMonth[p.covers_period] = (paidByMonth[p.covers_period] || 0) + Number(p.amount);
                  else pool += Number(p.amount);
                }
                for (const m of months) {
                  const need = Math.max(0, m.amount - (paidByMonth[m.period] || 0));
                  const take = Math.min(pool, need);
                  paidByMonth[m.period] = (paidByMonth[m.period] || 0) + take;
                  pool = Math.round((pool - take) * 100) / 100;
                }
                const overpay = Math.round(pool * 100) / 100; // leftover = credit / overpayment
                const poolOpen = histPayMonth === "__pool__";
                return (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11px] uppercase tracking-wider text-gray-400">Earned by month</div>
                      <button onClick={() => { setHistPayMonth("__pool__"); setHistPayForm({ amount: "", sent_at: new Date().toISOString().slice(0, 10), method: guessMethod(historyFor!.payInfo), reference: "" }); }}
                        className="text-[11px] font-medium text-white bg-gray-900 rounded px-2.5 py-1 hover:bg-gray-700">+ Record a payment</button>
                    </div>
                    {poolOpen && (
                      <div className="mb-3 bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div className="text-[11px] text-gray-500 mb-2">Enter a PayPal transfer exactly as sent — it auto-applies to the oldest unpaid months first. No need to match a month.</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="col-span-2">
                            <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Amount sent</label>
                            <input type="number" step="0.01" autoFocus value={histPayForm.amount} onChange={(e) => setHistPayForm({ ...histPayForm, amount: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs" placeholder="e.g. 500.00" />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Date sent</label>
                            <input type="date" value={histPayForm.sent_at} onChange={(e) => setHistPayForm({ ...histPayForm, sent_at: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs" />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Method</label>
                            <select value={histPayForm.method} onChange={(e) => setHistPayForm({ ...histPayForm, method: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs">
                              <option value="paypal">PayPal</option><option value="bank">Bank</option><option value="e_transfer">E-Transfer</option><option value="other">Other</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Reference (optional)</label>
                            <input value={histPayForm.reference} onChange={(e) => setHistPayForm({ ...histPayForm, reference: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs" placeholder="PayPal txn id / note" />
                          </div>
                          <div className="col-span-2 flex justify-end gap-2">
                            <button onClick={() => setHistPayMonth(null)} className="px-3 py-1.5 text-xs text-gray-500">Cancel</button>
                            <button onClick={() => recordHistoryPayment("__pool__")} disabled={histSaving || !histPayForm.amount || !histPayForm.sent_at} className="px-3 py-1.5 bg-gray-900 text-white rounded text-xs font-medium disabled:opacity-40">{histSaving ? "…" : "Record payment"}</button>
                          </div>
                        </div>
                      </div>
                    )}
                    {overpay > 0.01 && <div className="mb-2 text-[11px] text-green-600">Overpaid / credit on account: ${money(overpay)}</div>}
                    <div className="divide-y divide-gray-50">
                      {historyData.earnedByMonth.map((m: any) => {
                        const paidForMonth = Math.round((paidByMonth[m.period] || 0) * 100) / 100;
                        const remaining = Math.round((m.amount - paidForMonth) * 100) / 100;
                        const settled = remaining <= 0.01;
                        return (
                          <div key={m.period} className="py-2">
                            <div className="flex items-center gap-3 text-xs">
                              <span className="text-gray-700 flex-1">{periodLabel(m.period)}</span>
                              <span className="text-gray-900 tabular-nums">${money(m.amount)}</span>
                              <span className={`tabular-nums w-16 text-right ${paidForMonth > 0 ? (settled ? "text-green-600" : "text-amber-600") : "text-gray-300"}`}>{paidForMonth > 0 ? `$${money(paidForMonth)}` : "—"}</span>
                              <span className={`w-20 text-right ${settled ? "text-green-600" : paidForMonth > 0 ? "text-amber-600" : "text-gray-300"}`}>{settled ? "✓ Paid" : paidForMonth > 0 ? "Partial" : "Unpaid"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">Payments received</div>
                    {historyData.payments.length ? (
                      <div className="space-y-1">
                        {historyData.payments.map((p: any, i: number) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-gray-500">{p.sent_at} · {p.method || "—"}{p.covers_period ? ` · for ${periodLabel(p.covers_period)}` : " · auto-applied"}</span>
                            <span className="text-gray-900">${money(p.amount)}</span>
                          </div>
                        ))}
                      </div>
                    ) : <div className="text-xs text-gray-400">No payments recorded yet.</div>}
                  </div>
                </>
                ); })()}
            </div>
            <div className="px-6 py-3 border-t bg-gray-50 text-right"><button onClick={() => setHistoryFor(null)} className="text-gray-600 text-xs">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

// Consolidated payments dashboard (P3) — reads the commission_events + payouts
// ledgers. One row per creator: their retainer/ad-spend/affiliate streams summed,
// with earned/paid/balance derived. Record Payment writes a real transfer.

import { useState, useEffect, useCallback, Fragment } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { allocatePayments } from "@/lib/payout-allocation";
import { Sidebar } from "@/components/sidebar";
import { dueState, formatDueDate, type DueState } from "@/lib/payment-due";

interface Creator {
  key: string; influencerId: string | null; legacyAffiliateId: string | null;
  name: string; handle: string; photo: string | null; payInfo: string;
  retainer: number; adSpend: number; affiliate: number; oneOff: number; usageFees: number;
  earned: number; paid: number; balance: number;
  adRate: number; adBasis: number; affRate: number; affOrders: number; affGross: number; affRefunds: number;
  adRateMixed?: boolean; affRateMixed?: boolean;
  adjustments?: { amount: number; description: string }[];
  schedule?: { id: string; amount: number | null; scheduled_for: string; note: string | null } | null;
}

// The Outstanding work queue: one row per creator, balance summed across all
// unpaid months, flagged by the oldest debt.
interface OutMonth { period: string; earned: number; paid: number; balance: number; dueDate: string | null; state: DueState }
interface OutRow {
  key: string; influencerId: string | null; legacyAffiliateId: string | null;
  name: string; handle: string; photo: string | null; payInfo: string;
  outstanding: number; dueNow: number; credit: number; months: OutMonth[];
  oldestDue: { period: string; dueDate: string | null; state: DueState } | null;
  schedule?: { id: string; amount: number | null; scheduled_for: string; note: string | null } | null;
}

// A blended rate needs a decimal — rounding 18.3% to "18%" next to a figure it
// does not divide into invites a "the maths is wrong" ticket.
const rateLabel = (rate: number, mixed?: boolean) =>
  mixed ? `× ${(rate * 100).toFixed(1)}% (blended)` : `× ${Math.round(rate * 100)}%`;

const money = (n: number) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cell = (n: number) => (n > 0 ? `$${money(n)}` : "—");
const daysLate = (due: string) => Math.max(0, Math.floor((Date.now() - Date.parse(`${due}T00:00:00Z`)) / 86_400_000));

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
  const [data, setData] = useState<{ creators: Creator[]; totalOwed: number; totalPaid: number; outstanding: number; period?: string; dueDate?: string | null; overdueCount?: number; rateChange?: { count: number; rates: number[] } | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [payFor, setPayFor] = useState<Creator | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", sent_at: "", method: "paypal", reference: "" });
  const [saving, setSaving] = useState(false);
  const [breakdown, setBreakdown] = useState<{ row: Creator; type: "ad" | "aff" } | null>(null);
  const [audit, setAudit] = useState<{ orders: any[] } | null>(null);
  const [payEditFor, setPayEditFor] = useState<Creator | null>(null);
  const [schedFor, setSchedFor] = useState<Creator | null>(null);
  const [schedForm, setSchedForm] = useState({ scheduled_for: "", amount: "", note: "" });
  const [schedBusy, setSchedBusy] = useState(false);

  // Outstanding is the default: Cherry's work queue. Monthly stays for
  // month-end checks against the accrual report.
  const [view, setView] = useState<"outstanding" | "monthly">("outstanding");
  const [outData, setOutData] = useState<{ creators: OutRow[]; totalOutstanding: number; totalDueNow: number; totalOverdue: number; totalScheduled: number } | null>(null);
  const [outLoading, setOutLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [payAllFor, setPayAllFor] = useState<OutRow | null>(null);
  const [payAllForm, setPayAllForm] = useState({ amount: "", sent_at: "", method: "paypal", reference: "" });
  const [payAllSaving, setPayAllSaving] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);

  async function saveSchedule() {
    if (!schedFor || !schedForm.scheduled_for) return;
    setSchedBusy(true);
    const res = await fetch("/api/admin/payment-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        influencer_id: schedFor.influencerId,
        legacy_affiliate_id: schedFor.influencerId ? null : schedFor.legacyAffiliateId,
        amount: schedForm.amount ? Number(schedForm.amount) : null,
        scheduled_for: schedForm.scheduled_for,
        note: schedForm.note || null,
      }),
    });
    setSchedBusy(false);
    if (res.ok) { setSchedFor(null); load(); }
    else alert((await res.json().catch(() => ({}))).error || "Save failed");
  }

  async function clearSchedule(r: Creator) {
    if (!r.schedule) return;
    await fetch(`/api/admin/payment-schedule?id=${r.schedule.id}`, { method: "DELETE" });
    load();
  }
  const [payEditForm, setPayEditForm] = useState<any>({});
  const [payEditBusy, setPayEditBusy] = useState(false);

  // Admin edit of a partner's payout details, previously only on the old
  // payments page. Posts to the same endpoint the reveal reads, which resolves
  // the creator record across all their invites.
  async function openPayEdit(r: Creator) {
    if (!r.influencerId) return;
    const res = await fetch(`/api/admin/payment-info?influencer_id=${r.influencerId}`);
    const d = res.ok ? await res.json() : {};
    setPayEditForm({
      payment_method: d.payment_method || "paypal",
      paypal_email: d.paypal_email || "",
      bank_account_name: d.bank_account_name || "",
      bank_institution: d.bank_institution || "",
      bank_account_number: d.bank_account_number || "",
      bank_routing_number: d.bank_routing_number || "",
      payout_country: d.payout_country || "",
    });
    setPayEditFor(r);
  }

  async function savePayEdit() {
    if (!payEditFor?.influencerId) return;
    setPayEditBusy(true);
    const res = await fetch("/api/admin/payment-info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ influencer_id: payEditFor.influencerId, ...payEditForm }),
    });
    setPayEditBusy(false);
    if (res.ok) { setPayEditFor(null); setRevealed({}); load(); }
    else alert((await res.json().catch(() => ({}))).error || "Save failed");
  }
  const [auditBusy, setAuditBusy] = useState(false);

  // Order-level audit for the affiliate breakdown: every order behind the
  // number, with exclude/include per order (Creator Terms s13.5/s13.8 — coupon
  // sites, self-referrals, fraud). Exclusions are keyed by influencer, so rows
  // without one are view-only.
  async function fetchAudit(r: Creator) {
    setAudit(null);
    const params = new URLSearchParams({ month: period });
    if (r.influencerId) params.set("influencer_id", r.influencerId);
    else if (r.legacyAffiliateId) params.set("legacy_affiliate_id", r.legacyAffiliateId);
    else return;
    if (r.influencerId && r.legacyAffiliateId) params.set("legacy_affiliate_id", r.legacyAffiliateId);
    const res = await fetch(`/api/admin/affiliate-audit?${params}`);
    if (res.ok) setAudit(await res.json());
  }

  async function toggleExclude(r: Creator, order: any) {
    if (!r.influencerId) return;
    const excluding = !order.exclusion_reason && !order.excluded;
    const reason = excluding ? window.prompt("Reason for excluding this order (e.g. coupon-site redemption):", "") : null;
    if (excluding && reason === null) return; // cancelled
    setAuditBusy(true);
    await fetch("/api/admin/affiliate-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ influencer_id: r.influencerId, order_id: order.order_id, action: excluding ? "exclude" : "include", reason, month: period, legacy_affiliate_id: r.legacyAffiliateId }),
    });
    await fetchAudit(r);
    setAuditBusy(false);
    load(); // totals changed
  }
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [historyFor, setHistoryFor] = useState<Creator | null>(null);
  const [historyData, setHistoryData] = useState<any>(null);
  const [histPayMonth, setHistPayMonth] = useState<string | null>(null);
  const [histPayForm, setHistPayForm] = useState({ amount: "", sent_at: "", method: "paypal", reference: "" });
  const [histSaving, setHistSaving] = useState(false);
  const [editPayId, setEditPayId] = useState<string | null>(null);
  const [editPayForm, setEditPayForm] = useState({ amount: "", sent_at: "", method: "paypal", reference: "" });
  const [payRowBusy, setPayRowBusy] = useState(false);

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
    setHistoryFor(r); setHistoryData(null); setHistPayMonth(null); setEditPayId(null);
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

  async function updateHistoryPayment() {
    if (!historyFor || !editPayId) return;
    const amt = Number(editPayForm.amount);
    if (!Number.isFinite(amt) || amt === 0 || !editPayForm.sent_at) return;
    setPayRowBusy(true);
    try {
      const res = await fetch("/api/admin/payouts", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editPayId, amount: amt, sent_at: editPayForm.sent_at, method: editPayForm.method, reference: editPayForm.reference || null }),
      });
      if (res.ok) { setEditPayId(null); setHistoryData(await fetchHistory(historyFor)); load(); }
    } catch {}
    setPayRowBusy(false);
  }

  async function deleteHistoryPayment(p: any) {
    if (!historyFor) return;
    if (!window.confirm(`Remove the ${p.sent_at} payment of $${money(p.amount)}? Months it covered will show as unpaid again.`)) return;
    setPayRowBusy(true);
    try {
      const res = await fetch(`/api/admin/payouts?id=${p.id}`, { method: "DELETE" });
      if (res.ok) { setHistoryData(await fetchHistory(historyFor)); load(); }
    } catch {}
    setPayRowBusy(false);
  }

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user ? { displayName: user.user_metadata?.display_name || "Admin", email: user.email, profilePhotoUrl: null, isAdmin: true, isManager: false } : null);
    });
  }, []);

  const loadOut = useCallback(async () => {
    setOutLoading(true);
    try {
      const res = await fetch(`/api/admin/payments-v2?view=outstanding`);
      if (res.ok) setOutData(await res.json());
    } catch {}
    setOutLoading(false);
  }, []);

  // Every mutation calls load(); refreshing both views from it keeps them in
  // step without touching each call site.
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payments-v2?period=${period}`);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
    loadOut();
  }, [period, loadOut]);
  useEffect(() => { load(); }, [load]);

  async function payBalance() {
    if (!payAllFor) return;
    const amt = Number(payAllForm.amount);
    if (!Number.isFinite(amt) || amt <= 0 || !payAllForm.sent_at) return;
    setPayAllSaving(true);
    try {
      const res = await fetch("/api/admin/pay-balance", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: payAllFor.influencerId, legacy_affiliate_id: payAllFor.influencerId ? null : payAllFor.legacyAffiliateId,
          amount: amt, sent_at: payAllForm.sent_at, method: payAllForm.method, reference: payAllForm.reference || null,
        }),
      });
      if (res.ok) { setPayAllFor(null); await load(); }
      else alert((await res.json().catch(() => ({}))).error || "Payment failed to record");
    } catch {}
    setPayAllSaving(false);
  }

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
          <div className="flex items-center gap-4">
            <button onClick={() => setShowHowTo(true)} title="How to pay creators from this page"
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white text-gray-600 hover:bg-gray-50">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-400 text-[10px] font-semibold">i</span>
              How to pay
            </button>
            <div className="flex border border-gray-200 rounded-lg overflow-hidden text-sm">
              {(["outstanding", "monthly"] as const).map((v) => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-4 py-2 capitalize ${view === v ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {v}
                </button>
              ))}
            </div>
            {view === "monthly" && (
              <>
                {/* The bookkeeper pack: what was EARNED in the month against what
                    was PAID in it, which the table below does not answer. Reads the
                    same commission_events + creator_payouts ledger this page does. */}
                <button
                  onClick={() => { window.location.href = `/api/admin/payments/accrual?month=${period}&format=xlsx`; }}
                  title="Earned vs paid for this month, with opening and closing accrued liability — for the bookkeeper"
                  className="px-3 py-2 border border-gray-200 rounded text-sm bg-white text-gray-700 hover:bg-gray-50"
                >
                  Accrual report
                </button>
                {data?.dueDate && (
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wider text-gray-400">Due</div>
                    <div className={`text-sm font-medium ${(data.overdueCount || 0) > 0 ? "text-red-600" : "text-gray-700"}`}>
                      {formatDueDate(data.dueDate)}
                    </div>
                  </div>
                )}
                <select className="border border-gray-200 rounded px-3 py-2 text-sm bg-white" value={period} onChange={(e) => setPeriod(e.target.value)}>
                  {monthOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </>
            )}
          </div>
        </div>

        {view === "outstanding" && (
          <>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
                <div className="text-[11px] uppercase tracking-wider text-gray-400">Due now</div>
                <div className="text-2xl font-bold mt-1 text-red-600">${money(outData?.totalDueNow || 0)}</div>
                {(outData?.totalOverdue || 0) > 0 && <div className="text-[11px] text-red-600 mt-1">${money(outData!.totalOverdue)} of it overdue</div>}
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
                <div className="text-[11px] uppercase tracking-wider text-gray-400">Total outstanding</div>
                <div className="text-2xl font-bold mt-1 text-gray-900">${money(outData?.totalOutstanding || 0)}</div>
                <div className="text-[11px] text-gray-400 mt-1">incl. months not yet due</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg px-5 py-4">
                <div className="text-[11px] uppercase tracking-wider text-gray-400">Scheduled</div>
                <div className="text-2xl font-bold mt-1 text-blue-600">${money(outData?.totalScheduled || 0)}</div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-gray-500">
                    <th className="text-left font-medium px-5 py-3">Creator</th>
                    <th className="text-right font-medium px-3 py-3">Due now</th>
                    <th className="text-left font-medium px-4 py-3">Oldest due</th>
                    <th className="text-left font-medium px-3 py-3">Status</th>
                    <th className="px-5 py-3 w-44"></th>
                  </tr>
                </thead>
                <tbody>
                  {outLoading && !outData ? (
                    <tr><td colSpan={5} className="text-center py-12 text-gray-400">Loading…</td></tr>
                  ) : !(outData?.creators || []).length ? (
                    <tr><td colSpan={5} className="text-center py-12 text-gray-400">Nobody is owed anything. 🎉</td></tr>
                  ) : (outData?.creators || []).map((r) => {
                    const st = r.oldestDue?.state;
                    const isOpen = !!expanded[r.key];
                    return (
                      <Fragment key={r.key}>
                        <tr className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/40 cursor-pointer"
                          onClick={() => setExpanded((p) => ({ ...p, [r.key]: !p[r.key] }))}>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center text-xs text-gray-400">
                                {r.photo ? <img src={r.photo} alt="" className="w-full h-full object-cover" /> : r.name[0]}
                              </div>
                              <div>
                                <div className="font-medium text-gray-900">{r.name} <span className="text-gray-300 text-xs">{isOpen ? "▾" : "▸"}</span></div>
                                <div className="text-xs text-gray-400">@{r.handle}</div>
                                <div className="flex items-center gap-2 mt-0.5 text-[11px]">
                                  <span className={r.payInfo === "No payment method" ? "text-red-500" : "text-gray-500"}>{revealed[r.key] || r.payInfo}</span>
                                  {r.influencerId && <button onClick={(e) => { e.stopPropagation(); openPayEdit(r as unknown as Creator); }} className="text-[11px] text-blue-500 hover:text-blue-700">Edit</button>}
                                  <span className="text-gray-300">·</span>
                                  <button onClick={(e) => { e.stopPropagation(); openHistory(r as unknown as Creator); }} className="text-blue-500 hover:underline">History</button>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className={`font-semibold ${r.dueNow > 0 ? "text-gray-900" : "text-gray-400"}`}>{r.dueNow > 0 ? `$${money(r.dueNow)}` : "—"}</div>
                            {Math.abs(r.outstanding - r.dueNow) > 0.005 && (
                              <div className="text-[10px] text-gray-400">${money(r.outstanding)} total owed</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{r.oldestDue?.dueDate ? formatDueDate(r.oldestDue.dueDate) : "—"}</td>
                          <td className="px-3 py-3">
                            {r.schedule ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5" title={r.schedule.note || ""}>
                                Scheduled {r.schedule.scheduled_for}
                                <button onClick={(e) => { e.stopPropagation(); clearSchedule(r as unknown as Creator); }} className="text-blue-300 hover:text-blue-600" title="Clear schedule">×</button>
                              </span>
                            ) : st === "overdue" && r.oldestDue?.dueDate ? (
                              <span className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">Overdue {daysLate(r.oldestDue.dueDate)}d</span>
                            ) : st === "due_soon" ? (
                              <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">Due soon</span>
                            ) : (
                              <span className="text-[11px] text-gray-500">Upcoming</span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {r.dueNow > 0 ? (
                              <button onClick={(e) => { e.stopPropagation(); setPayAllFor(r); setPayAllForm({ amount: money(r.dueNow).replace(/,/g, ""), sent_at: new Date().toISOString().slice(0, 10), method: guessMethod(r.payInfo), reference: "" }); }}
                                className="px-3 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-700">
                                Pay ${money(r.dueNow)}
                              </button>
                            ) : (
                              <div className="text-[11px] text-gray-400">
                                Nothing due yet
                                <button onClick={(e) => { e.stopPropagation(); setPayAllFor(r); setPayAllForm({ amount: money(r.outstanding).replace(/,/g, ""), sent_at: new Date().toISOString().slice(0, 10), method: guessMethod(r.payInfo), reference: "" }); }}
                                  className="block ml-auto mt-0.5 text-[10px] text-gray-400 hover:text-gray-700 underline">Pay early…</button>
                              </div>
                            )}
                            {!r.schedule && (
                              <button onClick={(e) => { e.stopPropagation(); setSchedFor(r as unknown as Creator); setSchedForm({ scheduled_for: "", amount: String(r.outstanding), note: "" }); }}
                                className="block ml-auto mt-1 text-[10px] text-gray-400 hover:text-blue-600">Schedule…</button>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-gray-50 bg-gray-50/60">
                            <td colSpan={5} className="px-5 py-2">
                              <div className="ml-11 border-l-2 border-gray-200 pl-4 py-1 text-xs text-gray-600 space-y-1">
                                {r.months.map((m) => (
                                  <div key={m.period} className="flex items-center gap-4">
                                    <span className="w-32">{periodLabel(m.period)}</span>
                                    <span className="tabular-nums w-24 text-right">${money(m.balance)}</span>
                                    <span className={m.state === "overdue" ? "text-red-600" : m.state === "due_soon" ? "text-amber-600" : "text-gray-400"}>
                                      {m.state === "overdue" ? "overdue" : m.dueDate ? `due ${formatDueDate(m.dueDate)}` : ""}
                                    </span>
                                    {m.paid > 0 && <span className="text-gray-400">(${money(m.paid)} of ${money(m.earned)} already paid)</span>}
                                  </div>
                                ))}
                                <div className="text-gray-400 pt-1">One payment settles the oldest months first, automatically.</div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">Creators with nothing owed don’t appear here — settled history lives in the Monthly view and each creator’s History drawer.</p>
          </>
        )}

        {view === "monthly" && (<>
        {data?.rateChange && (
          <div className="mb-6 border border-amber-200 bg-amber-50 rounded-lg px-5 py-3 text-sm text-amber-900">
            <span className="font-medium">New commission rates took effect this month.</span>{" "}
            {data.rateChange.count} {data.rateChange.count === 1 ? "partner moved" : "partners moved"} to{" "}
            {data.rateChange.rates.map((r) => `${r}%`).join(" / ")} from the 1st. Earlier months are unaffected —
            lower totals here are expected, not a calculation error.
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: "Total Owed", value: data?.totalOwed || 0, color: "text-gray-900" },
            { label: "Paid", value: data?.totalPaid || 0, color: "text-green-600" },
            { label: "Outstanding", value: data?.outstanding || 0, color: "text-amber-600" },
          ].map((c) => (
            <div key={c.label} className="bg-white border border-gray-200 rounded-lg px-5 py-4">
              <div className="text-[11px] uppercase tracking-wider text-gray-400">{c.label}</div>
              <div className={`text-2xl font-bold mt-1 ${c.color}`}>${money(c.value)}</div>
              {c.label === "Outstanding" && (data?.overdueCount || 0) > 0 && (
                <div className="text-[11px] text-red-600 mt-1">
                  {data!.overdueCount} {data!.overdueCount === 1 ? "creator" : "creators"} past due
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr className="text-gray-500">
                <th className="text-left font-medium px-5 py-3">Creator</th>
                <th className="text-right font-medium px-3 py-3">Retainer</th>
                <th className="text-right font-medium px-3 py-3">One-off</th>
                <th className="text-right font-medium px-3 py-3">Whitelisting</th>
                <th className="text-right font-medium px-3 py-3">Affiliate</th>
                <th className="text-right font-medium px-3 py-3">Earned</th>
                <th className="text-right font-medium px-3 py-3">Paid</th>
                <th className="text-right font-medium px-3 py-3">Balance</th>
                <th className="px-5 py-3 w-40"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">Loading…</td></tr>
              ) : creators.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-12 text-gray-400">No earnings for {periodLabel(period)}.</td></tr>
              ) : creators.map((r) => {
                const due: DueState = dueState(period, r.balance);
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
                          {r.influencerId && <button onClick={() => openPayEdit(r)} className="ml-2 text-[11px] text-blue-500 hover:text-blue-700">Edit</button>}
                          {(r.adjustments || []).map((a, i) => (
                            <div key={i} className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 inline-block">
                              {a.description}: {a.amount < 0 ? "−" : "+"}${money(Math.abs(a.amount))}
                            </div>
                          ))}
                            <span className="text-gray-300">·</span>
                            <button onClick={() => openHistory(r)} className="text-blue-500 hover:underline">History</button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700">{cell(r.retainer)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{cell(r.oneOff)}</td>
                    <td className="px-3 py-3 text-right">{(r.adSpend + r.usageFees) > 0 ? <button onClick={() => setBreakdown({ row: r, type: "ad" })} className="text-gray-700 hover:text-gray-900" title="Breakdown">${money(r.adSpend + r.usageFees)}</button> : <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-3 text-right">{Math.abs(r.affiliate) > 0.005 ? <button onClick={() => { setBreakdown({ row: r, type: "aff" }); fetchAudit(r); }} className="text-gray-700 hover:text-gray-900" title="Breakdown & order audit">${money(r.affiliate)}</button> : <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-3 text-right font-medium text-gray-900">${money(r.earned)}</td>
                    <td className="px-3 py-3 text-right text-gray-700">{r.paid > 0 ? `$${money(r.paid)}` : "—"}</td>
                    <td className={`px-3 py-3 text-right font-semibold ${due === "overdue" ? "text-red-600" : r.balance > 0.01 ? "text-amber-600" : "text-green-600"}`}>
                      ${money(r.balance)}
                      {r.schedule ? (
                        <div className="text-[10px] font-normal text-blue-600" title={r.schedule.note || ""}>
                          Scheduled {r.schedule.scheduled_for}
                          <button onClick={(e) => { e.stopPropagation(); clearSchedule(r); }} className="ml-1 text-blue-300 hover:text-blue-600" title="Clear schedule">×</button>
                        </div>
                      ) : due === "overdue" ? <div className="text-[10px] font-normal text-red-600">Overdue</div>
                        : due === "due_soon" ? <div className="text-[10px] font-normal text-amber-600">Due soon</div> : null}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {status === "paid" ? <span className="text-xs text-green-600 font-medium">✓ Paid</span> : (
                        <button onClick={() => { setPayFor(r); setPayForm({ amount: money(r.balance), sent_at: new Date().toISOString().slice(0, 10), method: "paypal", reference: "" }); }}
                          className="px-3 py-1.5 bg-gray-900 text-white rounded text-xs font-medium hover:bg-gray-700">
                          {status === "partial" ? "Pay balance" : "Record Payment"}
                        </button>
                      )}
                      {status !== "paid" && !r.schedule && (
                        <button onClick={() => { setSchedFor(r); setSchedForm({ scheduled_for: "", amount: String(r.balance), note: "" }); }}
                          className="block ml-auto mt-1 text-[10px] text-gray-400 hover:text-blue-600">Schedule…</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>)}
      </main>

      {/* How to pay — the short version of docs/paying-creators.md. Keep the
          two in sync when the process changes. */}
      {showHowTo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowHowTo(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b">
              <div className="text-sm font-semibold text-gray-900">How to pay creators</div>
              <div className="text-xs text-gray-500 mt-0.5">The Outstanding tab is the work queue — one row per creator, their full unpaid balance.</div>
            </div>
            <div className="px-6 py-4 text-sm text-gray-700 space-y-3">
              <ol className="list-decimal ml-4 space-y-2">
                <li><span className="font-medium">Work top to bottom.</span> Red Overdue needs action; blue Scheduled means pay on that date, not before; amber Due soon means the deadline is within a week.</li>
                <li><span className="font-medium">Check the payment method under the name first.</span> If it says <span className="text-red-600">No payment method</span>, stop — use Edit to add details before sending anything.</li>
                <li><span className="font-medium">Send the Due now amount</span> in Mercury or PayPal — one transfer per creator, exactly what the Pay button shows. Months marked &quot;not yet due&quot; stay for a later run; don&apos;t prepay them. Click the row to see the split.</li>
                <li><span className="font-medium">Record it the same day.</span> Click Pay, add the method and the bank transaction reference, save. That one step settles the months, marks deal installments paid, and clears any Scheduled chip.</li>
              </ol>
              <div className="border-t pt-3 space-y-1.5 text-xs text-gray-500">
                <div><span className="font-medium text-gray-700">Record on the day the money actually leaves the bank</span> — the date is what the bookkeeper reconciles against the statement. Never batch recordings for later: an unrecorded payment still shows as owed, which is how double-payments happen.</div>
                <div><span className="font-medium text-gray-700">Missing balance?</span> If a creator chases payment for content not showing here, their delivery likely isn&apos;t ticked on the deal — that&apos;s Daisy&apos;s record, not yours. Ask her or Shane; never pay off the books.</div>
                <div><span className="font-medium text-gray-700">Invoice with a future pay date?</span> Use Schedule… on the row so it shows as planned instead of overdue.</div>
                <div><span className="font-medium text-gray-700">Mistake?</span> Pooled payments can be edited or removed from the creator&apos;s History drawer; deal-installment payments are corrected on the deal (ask Shane).</div>
                <div className="pt-1">Full guide: <span className="font-mono">docs/paying-creators.md</span> in the repo.</div>
              </div>
            </div>
            <div className="px-6 py-3 border-t bg-gray-50 text-right">
              <button onClick={() => setShowHowTo(false)} className="text-gray-600 text-xs">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Pay full balance — the single recording step: covered deal milestones
          are ticked on their deals, any commission remainder becomes a payout
          row, and the schedule chip clears. One transfer, recorded once. */}
      {payAllFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPayAllFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-4 border-b">
              <div className="text-sm font-semibold text-gray-900">Pay balance — {payAllFor.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">{payAllFor.payInfo} · due now ${money(payAllFor.dueNow)}{Math.abs(payAllFor.outstanding - payAllFor.dueNow) > 0.005 ? ` · $${money(payAllFor.outstanding)} total owed` : ""}</div>
            </div>
            <div className="p-6 space-y-3">
              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded px-3 py-2">
                {payAllFor.months.map((m) => `${periodLabel(m.period)} $${money(m.balance)}${m.state !== "overdue" && m.state !== "due_soon" ? " (not yet due)" : ""}`).join(" · ")}
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Amount sent</label>
                <input type="number" step="0.01" value={payAllForm.amount} onChange={(e) => setPayAllForm({ ...payAllForm, amount: e.target.value })} className="w-full border border-gray-200 rounded px-3 py-2 text-sm" />
                {(() => {
                  const amt = Number(payAllForm.amount);
                  if (!(amt > 0)) return null;
                  const notYetDue = payAllFor.outstanding - payAllFor.dueNow;
                  if (Math.abs(amt - payAllFor.dueNow) <= 0.01 && notYetDue > 0.005) {
                    return <div className="text-[11px] text-gray-500 mt-1">Covers everything currently due. The remaining ${money(notYetDue)} isn&apos;t due yet and stays on the books for a later run.</div>;
                  }
                  if (Math.abs(amt - payAllFor.outstanding) <= 0.01 && notYetDue > 0.005) {
                    return <div className="text-[11px] text-amber-600 mt-1">Includes ${money(notYetDue)} that isn&apos;t due yet — current-month commission may still be growing, so paying it now can leave a fresh balance behind.</div>;
                  }
                  if (Math.abs(amt - payAllFor.outstanding) > 0.01 && Math.abs(amt - payAllFor.dueNow) > 0.01) {
                    return <div className="text-[11px] text-amber-600 mt-1">Matches neither the due-now amount nor the full balance — oldest months are settled first; a partly-covered deal installment stays owed until fully paid.</div>;
                  }
                  return null;
                })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Date sent</label>
                  <input type="date" value={payAllForm.sent_at} onChange={(e) => setPayAllForm({ ...payAllForm, sent_at: e.target.value })} className="w-full border border-gray-200 rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Method</label>
                  <select value={payAllForm.method} onChange={(e) => setPayAllForm({ ...payAllForm, method: e.target.value })} className="w-full border border-gray-200 rounded px-3 py-2 text-sm">
                    <option value="paypal">PayPal</option><option value="bank">Bank</option><option value="e_transfer">E-Transfer</option><option value="wire">Wire</option><option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1">Reference (optional)</label>
                <input value={payAllForm.reference} onChange={(e) => setPayAllForm({ ...payAllForm, reference: e.target.value })} className="w-full border border-gray-200 rounded px-3 py-2 text-sm" placeholder="Mercury / PayPal transaction id" />
              </div>
              <div className="text-[11px] text-gray-400">Record this on the day the money actually leaves the bank — the date is what the bookkeeper reconciles against the statement.</div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setPayAllFor(null)} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
              <button onClick={payBalance} disabled={payAllSaving || !payAllForm.amount || !payAllForm.sent_at} className="px-4 py-2 bg-gray-900 text-white rounded text-sm font-medium disabled:opacity-40">{payAllSaving ? "…" : "Record payment"}</button>
            </div>
          </div>
        </div>
      )}

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
            <div className={`bg-white rounded-xl shadow-xl w-full ${breakdown.type === "aff" ? "max-w-2xl" : "max-w-sm"} mx-4`} onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b">
                <div className="text-sm font-semibold text-gray-900">{breakdown.type === "ad" ? "Whitelisting" : "Affiliate commission"} — {r.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{periodLabel(period)}</div>
              </div>
              <div className="px-6 py-4 text-sm">
                {breakdown.type === "ad" ? (
                  <>
                    {r.adSpend > 0 && (
                      <>
                        <Line label="Ad spend" value={`$${money(r.adBasis)}`} />
                        <Line label="Commission rate" value={rateLabel(r.adRate, r.adRateMixed)} />
                        <Line label="Commission" value={`$${money(r.adSpend)}`} strong />
                      </>
                    )}
                    {r.usageFees > 0 && <Line label="Usage-rights fees (flat, from deals)" value={`$${money(r.usageFees)}`} strong />}
                  </>
                ) : (
                  <>
                    <Line label={`${r.affOrders} orders · gross`} value={`$${money(r.affGross)}`} />
                    <Line label="Refunds" value={`−$${money(r.affRefunds)}`} />
                    <Line label="Net" value={`$${money(affNet)}`} />
                    <Line label="Commission rate" value={rateLabel(r.affRate, r.affRateMixed)} />
                    {(r.adjustments || []).map((a, i) => (
                      <Line key={i} label={a.description} value={`${a.amount < 0 ? "−" : "+"}$${money(Math.abs(a.amount))}`} />
                    ))}
                    <Line label="Commission" value={`$${money(r.affiliate)}`} strong />

                    <div className="mt-4 border-t pt-3">
                      <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-2">Orders behind this number</div>
                      {!audit ? (
                        <div className="text-xs text-gray-400 py-3">Loading orders…</div>
                      ) : !audit.orders?.length ? (
                        <div className="text-xs text-gray-400 py-3">No orders returned for this month.</div>
                      ) : (
                        <div className="max-h-72 overflow-y-auto -mx-2">
                          {audit.orders.map((o: any) => {
                            const isExcluded = !!o.exclusion_reason || !!o.excluded;
                            return (
                              <div key={o.order_id} className={`flex items-center justify-between gap-3 px-2 py-1.5 text-xs border-b border-gray-50 ${isExcluded ? "opacity-50" : ""}`}>
                                <div className="min-w-0">
                                  <span className="text-gray-700">#{o.order_number}</span>
                                  <span className="text-gray-400"> · {String(o.created_at || "").slice(0, 10)}</span>
                                  {isExcluded && <span className="text-red-600"> · excluded{o.exclusion_reason ? `: ${o.exclusion_reason}` : ""}</span>}
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                  <span className={`tabular-nums ${isExcluded ? "line-through text-gray-400" : "text-gray-900"}`}>${money(o.net_amount)}</span>
                                  {r.influencerId && (
                                    <button onClick={() => toggleExclude(r, o)} disabled={auditBusy}
                                      className={`disabled:opacity-40 ${isExcluded ? "text-gray-400 hover:text-green-600" : "text-gray-400 hover:text-red-600"}`}>
                                      {isExcluded ? "Include" : "Exclude"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 mt-2">Excluding an order removes its commission immediately; including it back restores it.</div>
                    </div>
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

      {/* Schedule a payment (invoice received / pay date agreed) */}
      {schedFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setSchedFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-gray-900 mb-1">Schedule payment — {schedFor.name}</div>
            <div className="text-[11px] text-gray-400 mb-4">A plan, not a payment — the chip clears itself when the payout is recorded.</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="text-xs text-gray-500">Pay on
                <input type="date" value={schedForm.scheduled_for} onChange={(e) => setSchedForm({ ...schedForm, scheduled_for: e.target.value })} className="mt-1 w-full border border-gray-200 rounded px-2.5 py-2" /></label>
              <label className="text-xs text-gray-500">Amount (optional)
                <input type="number" step="0.01" value={schedForm.amount} onChange={(e) => setSchedForm({ ...schedForm, amount: e.target.value })} className="mt-1 w-full border border-gray-200 rounded px-2.5 py-2" /></label>
              <label className="col-span-2 text-xs text-gray-500">Note
                <input value={schedForm.note} onChange={(e) => setSchedForm({ ...schedForm, note: e.target.value })} placeholder="e.g. invoice received 28 Aug" className="mt-1 w-full border border-gray-200 rounded px-2.5 py-2" /></label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setSchedFor(null)} className="text-sm px-3 py-2 text-gray-500">Cancel</button>
              <button onClick={saveSchedule} disabled={schedBusy || !schedForm.scheduled_for} className="text-sm px-4 py-2 rounded-md bg-gray-900 text-white disabled:opacity-40">{schedBusy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Payout details editor */}
      {payEditFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPayEditFor(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-sm font-semibold text-gray-900 mb-1">Payout details — {payEditFor.name}</div>
            <div className="text-[11px] text-gray-400 mb-4">Changes are logged. The creator can also edit these from their own dashboard.</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="text-xs text-gray-500">Method
                <select value={payEditForm.payment_method} onChange={(e) => setPayEditForm({ ...payEditForm, payment_method: e.target.value })} className="mt-1 w-full border border-gray-200 rounded px-2.5 py-2 bg-white">
                  <option value="paypal">PayPal</option><option value="e_transfer">E-Transfer</option>
                  <option value="us_ach">Bank (US ACH)</option><option value="ca_eft">Bank (CA EFT)</option><option value="intl_wire">Wire</option>
                </select></label>
              <label className="text-xs text-gray-500">Payout country
                <input value={payEditForm.payout_country} onChange={(e) => setPayEditForm({ ...payEditForm, payout_country: e.target.value })} className="mt-1 w-full border border-gray-200 rounded px-2.5 py-2" /></label>
              {(payEditForm.payment_method === "paypal" || payEditForm.payment_method === "e_transfer") ? (
                <label className="col-span-2 text-xs text-gray-500">Email
                  <input value={payEditForm.paypal_email} onChange={(e) => setPayEditForm({ ...payEditForm, paypal_email: e.target.value })} className="mt-1 w-full border border-gray-200 rounded px-2.5 py-2" /></label>
              ) : (
                <>
                  <label className="text-xs text-gray-500">Account name
                    <input value={payEditForm.bank_account_name} onChange={(e) => setPayEditForm({ ...payEditForm, bank_account_name: e.target.value })} className="mt-1 w-full border border-gray-200 rounded px-2.5 py-2" /></label>
                  <label className="text-xs text-gray-500">Institution
                    <input value={payEditForm.bank_institution} onChange={(e) => setPayEditForm({ ...payEditForm, bank_institution: e.target.value })} className="mt-1 w-full border border-gray-200 rounded px-2.5 py-2" /></label>
                  <label className="text-xs text-gray-500">Account number
                    <input value={payEditForm.bank_account_number} onChange={(e) => setPayEditForm({ ...payEditForm, bank_account_number: e.target.value })} className="mt-1 w-full border border-gray-200 rounded px-2.5 py-2" /></label>
                  <label className="text-xs text-gray-500">Routing / transit
                    <input value={payEditForm.bank_routing_number} onChange={(e) => setPayEditForm({ ...payEditForm, bank_routing_number: e.target.value })} className="mt-1 w-full border border-gray-200 rounded px-2.5 py-2" /></label>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setPayEditFor(null)} className="text-sm px-3 py-2 text-gray-500">Cancel</button>
              <button onClick={savePayEdit} disabled={payEditBusy} className="text-sm px-4 py-2 rounded-md bg-gray-900 text-white disabled:opacity-40">{payEditBusy ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

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
                // FIFO allocation (shared with the monthly grid API): pinned payments
                // settle their month first, pooled payments fill oldest unpaid months.
                // You record real transfers (date + amount) — the app figures out coverage.
                const { paidByMonth, credit: overpay } = allocatePayments(historyData.earnedByMonth, historyData.payments || []);
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
                          p.id && p.id === editPayId ? (
                            <div key={p.id} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Amount</label>
                                  <input type="number" step="0.01" autoFocus value={editPayForm.amount} onChange={(e) => setEditPayForm({ ...editPayForm, amount: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs" />
                                </div>
                                <div>
                                  <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Date sent</label>
                                  <input type="date" value={editPayForm.sent_at} onChange={(e) => setEditPayForm({ ...editPayForm, sent_at: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs" />
                                </div>
                                <div>
                                  <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Method</label>
                                  <select value={editPayForm.method} onChange={(e) => setEditPayForm({ ...editPayForm, method: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs">
                                    <option value="paypal">PayPal</option><option value="bank">Bank</option><option value="e_transfer">E-Transfer</option><option value="other">Other</option>
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-[10px] uppercase tracking-wider text-gray-400 mb-1">Reference (optional)</label>
                                  <input value={editPayForm.reference} onChange={(e) => setEditPayForm({ ...editPayForm, reference: e.target.value })} className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs" placeholder="PayPal txn id / note" />
                                </div>
                                <div className="col-span-2 flex justify-end gap-2">
                                  <button onClick={() => setEditPayId(null)} className="px-3 py-1.5 text-xs text-gray-500">Cancel</button>
                                  <button onClick={updateHistoryPayment} disabled={payRowBusy || !editPayForm.amount || !editPayForm.sent_at} className="px-3 py-1.5 bg-gray-900 text-white rounded text-xs font-medium disabled:opacity-40">{payRowBusy ? "…" : "Save"}</button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div key={p.id || i} className="flex items-center justify-between text-xs">
                              <span className="text-gray-500">{p.sent_at} · {p.method || "—"}{p.covers_period ? ` · for ${periodLabel(p.covers_period)}` : " · auto-applied"}</span>
                              <span className="flex items-center gap-2">
                                {p.id && (
                                  <>
                                    <button onClick={() => { setEditPayId(p.id); setEditPayForm({ amount: String(p.amount), sent_at: p.sent_at, method: p.method || "paypal", reference: p.reference || "" }); }}
                                      disabled={payRowBusy} className="text-gray-400 hover:text-blue-600 disabled:opacity-40">Edit</button>
                                    <button onClick={() => deleteHistoryPayment(p)} disabled={payRowBusy} className="text-gray-400 hover:text-red-600 disabled:opacity-40">Remove</button>
                                  </>
                                )}
                                <span className="text-gray-900 tabular-nums">${money(p.amount)}</span>
                              </span>
                            </div>
                          )
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

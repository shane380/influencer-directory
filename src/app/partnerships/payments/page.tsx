"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Pencil, Check, X, ChevronDown } from "lucide-react";

interface Payment {
  id: string;
  influencer_id: string;
  month: string;
  payment_type: string;
  amount_owed: number | null;
  amount_paid: number | null;
  status: string;
  payment_method: string | null;
  payment_detail: string | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  deal_id: string | null;
  calculation_details: any;
  created_at: string;
  influencer: {
    id: string;
    name: string;
    instagram_handle: string;
    profile_photo_url: string | null;
  } | null;
  deal: {
    id: string;
    total_deal_value: number;
    payment_status: string;
    campaign: { name: string } | null;
  } | null;
}

interface GroupedCreator {
  influencer: Payment["influencer"];
  payments: Payment[];
  total: number;
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  ad_spend_commission: { label: "Ad Spend", color: "bg-blue-50 text-blue-700 border-blue-200" },
  retainer: { label: "Retainer", color: "bg-purple-50 text-purple-700 border-purple-200" },
  affiliate_commission: { label: "Affiliate", color: "bg-amber-50 text-amber-700 border-amber-200" },
  paid_collab: { label: "Paid Collab", color: "bg-pink-50 text-pink-700 border-pink-200" },
  refund_adjustment: { label: "Refund Adj", color: "bg-red-50 text-red-700 border-red-200" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-600" },
  approved: { label: "Approved", color: "bg-yellow-50 text-yellow-700" },
  paid: { label: "Paid", color: "bg-green-50 text-green-700" },
  skipped: { label: "Skipped", color: "bg-gray-50 text-gray-400" },
};

function getMonthOptions() {
  const opts: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 2; i >= -1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en", { month: "long", year: "numeric" });
    opts.push({ value: val, label });
  }
  return opts;
}

export default function PaymentsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [editingAmount, setEditingAmount] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [paymentInfoOpen, setPaymentInfoOpen] = useState<string | null>(null);
  const [paymentInfoData, setPaymentInfoData] = useState<Record<string, any>>({});
  const [paymentInfoLoading, setPaymentInfoLoading] = useState(false);
  const [auditOpen, setAuditOpen] = useState<{ influencerId: string; name: string } | null>(null);
  const [auditData, setAuditData] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [excludingOrder, setExcludingOrder] = useState<number | null>(null);
  const monthOptions = getMonthOptions();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
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
    });
  }, []);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payments/calculate?month=${month}`);
      const data = await res.json();
      setPayments(data.payments || []);
    } catch (err) {
      console.error("Failed to fetch payments:", err);
    }
    setLoading(false);
  }, [month]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  async function openAudit(influencerId: string, name: string) {
    setAuditOpen({ influencerId, name });
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/admin/affiliate-audit?influencer_id=${influencerId}&month=${month}`);
      const data = await res.json();
      setAuditData(data);
    } catch {}
    setAuditLoading(false);
  }

  async function toggleOrderExclusion(orderId: number, currentlyExcluded: boolean) {
    if (!auditOpen) return;
    setExcludingOrder(orderId);
    try {
      await fetch("/api/admin/affiliate-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: auditOpen.influencerId,
          order_id: orderId,
          action: currentlyExcluded ? "include" : "exclude",
          reason: currentlyExcluded ? null : "Excluded during audit",
        }),
      });
      // Refresh audit data
      const res = await fetch(`/api/admin/affiliate-audit?influencer_id=${auditOpen.influencerId}&month=${month}`);
      const data = await res.json();
      setAuditData(data);
      // Refresh payments to update the amount
      fetchPayments();
    } catch {}
    setExcludingOrder(null);
  }

  async function fetchPaymentInfo(influencerId: string) {
    if (paymentInfoData[influencerId]) {
      setPaymentInfoOpen(paymentInfoOpen === influencerId ? null : influencerId);
      return;
    }
    setPaymentInfoOpen(influencerId);
    setPaymentInfoLoading(true);
    try {
      const supabase = createClient();
      // Find creator via invite linked to this influencer
      const { data: invite } = await (supabase.from("creator_invites") as any)
        .select("id")
        .eq("influencer_id", influencerId)
        .limit(1)
        .single();
      if (invite) {
        const { data: creator } = await (supabase.from("creators") as any)
          .select("payment_method, payout_country, paypal_email, bank_account_name, bank_account_number, bank_routing_number, bank_institution")
          .eq("invite_id", invite.id)
          .single();
        if (creator) {
          setPaymentInfoData((prev) => ({ ...prev, [influencerId]: creator }));
        }
      }
    } catch {}
    setPaymentInfoLoading(false);
  }

  async function updatePayment(id: string, updates: Record<string, any>, fullPayment?: Payment) {
    setUpdating(id);
    try {
      // For live-calculated rows, pass full payment data so the API can create the DB row
      const body = typeof id === "string" && id.startsWith("live-") && fullPayment
        ? {
            id,
            influencer_id: fullPayment.influencer_id,
            month: fullPayment.month,
            payment_type: fullPayment.payment_type,
            amount_owed: fullPayment.amount_owed,
            payment_method: fullPayment.payment_method,
            payment_detail: fullPayment.payment_detail,
            notes: fullPayment.notes,
            deal_id: fullPayment.deal_id,
            calculation_details: fullPayment.calculation_details,
            ...updates,
          }
        : { id, ...updates };

      const res = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setPayments((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...data.payment, influencer: p.influencer, deal: p.deal } : p))
        );
      }
    } catch (err) {
      console.error("Update failed:", err);
    }
    setUpdating(null);
    setEditingNote(null);
    setEditingAmount(null);
  }

  function exportCSV() {
    const rows = payments.filter((p) => p.status === "paid" || p.status === "approved");
    const header = "Creator,Handle,Type,Amount Owed,Amount Paid,Payment Method,Payment Detail,Status,Paid At";
    const csv = [
      header,
      ...rows.map((p) => {
        const tc = TYPE_CONFIG[p.payment_type];
        return [
          p.influencer?.name || "",
          p.influencer?.instagram_handle || "",
          tc?.label || p.payment_type,
          p.amount_owed ?? "",
          p.amount_paid ?? "",
          p.payment_method || "",
          p.payment_detail || "",
          p.status,
          p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "",
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",");
      }),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payments-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Split into partners vs paid collabs, then group by creator
  const partnerPayments = payments.filter((p) => p.payment_type !== "paid_collab");
  const collabPayments = payments.filter((p) => p.payment_type === "paid_collab");

  function groupByCreator(items: Payment[]): GroupedCreator[] {
    const groups: GroupedCreator[] = [];
    const map: Record<string, GroupedCreator> = {};
    for (const p of items) {
      const key = p.influencer_id;
      if (!map[key]) {
        map[key] = { influencer: p.influencer, payments: [], total: 0 };
        groups.push(map[key]);
      }
      map[key].payments.push(p);
      map[key].total += Number(p.amount_owed || 0);
    }
    return groups;
  }

  const partnerGroups = groupByCreator(partnerPayments);
  const collabGroups = groupByCreator(collabPayments);

  // Summary stats
  const totalOwed = payments.filter((p) => p.status !== "skipped").reduce((s, p) => s + Number(p.amount_owed || 0), 0);
  const totalPaid = payments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + Number(p.amount_paid || p.amount_owed || 0), 0);
  const totalUnpaid = totalOwed - totalPaid;
  const pendingCount = payments.filter((p) => p.status === "pending").length;

  const monthLabel = new Date(month + "-01").toLocaleString("en", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar
        activeTab="payments"
        onTabChange={() => {}}
        currentUser={currentUser}
        onLogout={async () => {
          const supabase = createClient();
          await supabase.auth.signOut();
          router.push("/login");
        }}
      />
      <main className="flex-1 p-8 overflow-auto ml-48">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Payments</h1>
            <p className="text-sm text-gray-500 mt-1">Manage creator payment runs</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              className="border border-gray-200 rounded px-3 py-2 text-sm bg-white"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Owed", value: `$${totalOwed.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { label: "Unpaid", value: `$${totalUnpaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { label: "Total Paid", value: `$${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { label: "Pending", value: String(pendingCount) },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</div>
              <div className="text-xl font-semibold text-gray-900">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tables */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading payments...</div>
        ) : payments.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-400 text-sm">No payments for {monthLabel}.</p>
          </div>
        ) : (
          <div className="space-y-8">
          {partnerGroups.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Partners</h2>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {partnerGroups.map((group) => (
              <div key={group.influencer?.id || "unknown"} className="border-b border-gray-100 last:border-b-0">
                {/* Creator header row */}
                <div className="flex items-center gap-3 px-5 py-3 bg-gray-50/50">
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 flex-shrink-0 bg-gray-100">
                    {group.influencer?.profile_photo_url ? (
                      <img
                        src={group.influencer.profile_photo_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                        {group.influencer?.name?.[0] || "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      {group.influencer?.name || "Unknown"}
                    </div>
                    <div className="text-xs text-gray-400">
                      @{group.influencer?.instagram_handle || "—"}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-gray-700">
                    ${group.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Payment sub-rows */}
                {group.payments.map((p) => {
                  const tc = TYPE_CONFIG[p.payment_type] || { label: p.payment_type, color: "bg-gray-100 text-gray-600" };
                  const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;

                  return (
                    <div key={p.id}>
                    <div
                      className="flex items-center gap-4 px-5 py-2.5 pl-16 border-t border-gray-50 hover:bg-gray-50/30"
                    >
                      {/* Type badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border ${tc.color}`}>
                        {tc.label}
                      </span>

                      {/* Campaign name for paid collab */}
                      {p.payment_type === "paid_collab" && p.deal?.campaign?.name && (
                        <span className="text-xs text-gray-500 truncate max-w-[150px]" title={p.deal.campaign.name}>
                          {p.deal.campaign.name}
                        </span>
                      )}

                      {/* Audit link for affiliate rows */}
                      {p.payment_type === "affiliate_commission" && p.influencer && (
                        <button
                          className="text-[10px] text-blue-500 hover:text-blue-700 uppercase tracking-wider flex-shrink-0"
                          onClick={() => openAudit(p.influencer!.id, p.influencer!.name)}
                        >
                          Audit
                        </button>
                      )}

                      {/* Amount */}
                      <div className="w-24 text-sm text-gray-900">
                        {editingAmount === p.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs"
                              value={amountText}
                              onChange={(e) => setAmountText(e.target.value)}
                              autoFocus
                            />
                            <button
                              className="text-green-600 hover:text-green-800"
                              onClick={() => updatePayment(p.id, { amount_paid: parseFloat(amountText) || 0 })}
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              className="text-gray-400 hover:text-gray-600"
                              onClick={() => setEditingAmount(null)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            {Number(p.amount_owed || 0) < 0 ? "-" : ""}${Math.abs(Number(p.amount_owed || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </>
                        )}
                      </div>

                      {/* Payment method — click to reveal full details */}
                      <div className="w-36 relative">
                        <button
                          className="text-xs text-gray-400 hover:text-gray-600 hover:underline truncate text-left w-full"
                          onClick={() => p.influencer && fetchPaymentInfo(p.influencer.id)}
                        >
                          {p.payment_method === "paypal"
                            ? `PayPal — ${p.payment_detail || "—"}`
                            : p.payment_method === "bank" || p.payment_method === "us_ach" || p.payment_method === "ca_eft" || p.payment_method === "intl_wire"
                            ? `Bank ${p.payment_detail || ""}`
                            : p.payment_method || "—"}
                        </button>
                        {paymentInfoOpen === p.influencer?.id && (
                          <div className="absolute top-6 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-72" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Details</span>
                              <button onClick={() => setPaymentInfoOpen(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {paymentInfoLoading ? (
                              <div className="text-xs text-gray-400">Loading…</div>
                            ) : paymentInfoData[p.influencer?.id || ""] ? (() => {
                              const info = paymentInfoData[p.influencer!.id];
                              const method = info.payment_method;
                              return (
                                <div className="space-y-2 text-xs">
                                  {info.payout_country && (
                                    <div><span className="text-gray-400">Country:</span> <span className="text-gray-700">{info.payout_country}</span></div>
                                  )}
                                  {method === "paypal" && (
                                    <div><span className="text-gray-400">PayPal:</span> <span className="text-gray-700 select-all">{info.paypal_email}</span></div>
                                  )}
                                  {(method === "bank" || method === "us_ach" || method === "ca_eft" || method === "intl_wire") && (
                                    <>
                                      {info.bank_account_name && <div><span className="text-gray-400">Name:</span> <span className="text-gray-700">{info.bank_account_name}</span></div>}
                                      {info.bank_institution && <div><span className="text-gray-400">Institution:</span> <span className="text-gray-700">{info.bank_institution}</span></div>}
                                      {info.bank_routing_number && <div><span className="text-gray-400">Routing:</span> <span className="text-gray-700 select-all">{info.bank_routing_number}</span></div>}
                                      {info.bank_account_number && <div><span className="text-gray-400">Account:</span> <span className="text-gray-700 select-all">{info.bank_account_number}</span></div>}
                                    </>
                                  )}
                                  {!method && <div className="text-gray-400">No payment method set</div>}
                                </div>
                              );
                            })() : (
                              <div className="text-xs text-gray-400">No payment info found</div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Status badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${sc.color}`}>
                        {sc.label}
                      </span>

                      {/* Notes */}
                      <div className="flex-1 min-w-0">
                        {editingNote === p.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              className="flex-1 border border-gray-200 rounded px-2 py-0.5 text-xs"
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              placeholder="Add note..."
                              autoFocus
                            />
                            <button
                              className="text-green-600 hover:text-green-800"
                              onClick={() => updatePayment(p.id, { notes: noteText })}
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              className="text-gray-400 hover:text-gray-600"
                              onClick={() => setEditingNote(null)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-400 truncate">
                              {p.notes || ""}
                            </span>
                            <button
                              className="text-gray-300 hover:text-gray-500 flex-shrink-0"
                              onClick={() => {
                                setEditingNote(p.id);
                                setNoteText(p.notes || "");
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(p.status === "pending" || p.status === "approved") && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 text-[10px] px-2"
                            disabled={updating === p.id}
                            onClick={() =>
                              updatePayment(p.id, {
                                status: "paid",
                                approved_by: currentUser?.email || "Admin",
                                paid_by: currentUser?.email || "Admin",
                              }, p)
                            }
                          >
                            Mark Paid
                          </Button>
                        )}
                        {p.status === "paid" && (
                          <span className="inline-flex items-center h-6 px-2 rounded text-[10px] font-medium bg-green-100 text-green-700">
                            Paid
                          </span>
                        )}
                        {p.status !== "skipped" && p.status !== "paid" && (
                          <button
                            className="text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-wider"
                            onClick={() => updatePayment(p.id, { status: "skipped" }, p)}
                          >
                            Skip
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expanded affiliate detail */}
                    {p.payment_type === "affiliate_commission" &&
                      expandedDetails.has(p.id) &&
                      p.calculation_details && (
                        <div className="px-5 pl-16 pb-3 bg-amber-50/30 border-t border-amber-100">
                          <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-2 mb-1.5">
                            {p.calculation_details.order_count} orders &middot;{" "}
                            ${p.calculation_details.total_gross?.toFixed(2)} gross &middot;{" "}
                            -${p.calculation_details.total_refunds?.toFixed(2)} refunds &middot;{" "}
                            ${p.calculation_details.total_net?.toFixed(2)} net &times;{" "}
                            {(p.calculation_details.commission_rate * 100).toFixed(0)}% ={" "}
                            ${p.calculation_details.commission_owed?.toFixed(2)}
                          </div>
                          <div className="space-y-0.5">
                            {(p.calculation_details.orders || []).map((o: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-4 text-[11px] text-gray-500">
                                <span className="w-16 text-gray-400">#{o.order_number}</span>
                                <span className="w-20">{new Date(o.created_at).toLocaleDateString()}</span>
                                <span className="w-16 text-right">${o.gross_amount.toFixed(2)}</span>
                                {o.refund_amount > 0 && (
                                  <span className="text-red-400 w-16 text-right">-${o.refund_amount.toFixed(2)}</span>
                                )}
                                <span className="font-medium text-gray-700">${o.net_amount.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
              </div>
            </div>
          )}
          {collabGroups.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Paid Collabs</h2>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {collabGroups.map((group) => (
              <div key={group.influencer?.id || "unknown"} className="border-b border-gray-100 last:border-b-0">
                <div className="flex items-center gap-3 px-5 py-3 bg-gray-50/50">
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 flex-shrink-0 bg-gray-100">
                    {group.influencer?.profile_photo_url ? (
                      <img src={group.influencer.profile_photo_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">
                        {group.influencer?.name?.[0] || "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{group.influencer?.name || "Unknown"}</div>
                    <div className="text-xs text-gray-400">@{group.influencer?.instagram_handle || "—"}</div>
                  </div>
                  <div className="text-sm font-medium text-gray-700">
                    ${group.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>
                {group.payments.map((p) => {
                  const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;
                  return (
                    <div key={p.id} className="flex items-center gap-4 px-5 py-2.5 pl-16 border-t border-gray-50 hover:bg-gray-50/30">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border ${TYPE_CONFIG.paid_collab.color}`}>
                        Paid Collab
                      </span>
                      {p.deal?.campaign?.name && (
                        <span className="text-xs text-gray-500 truncate max-w-[150px]" title={p.deal.campaign.name}>
                          {p.deal.campaign.name}
                        </span>
                      )}
                      <div className="w-24 text-sm text-gray-900">
                        ${Number(p.amount_owed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="w-36 relative">
                        <button
                          className="text-xs text-gray-400 hover:text-gray-600 hover:underline truncate text-left w-full"
                          onClick={() => p.influencer && fetchPaymentInfo(p.influencer.id)}
                        >
                          {p.payment_method === "paypal"
                            ? `PayPal — ${p.payment_detail || "—"}`
                            : p.payment_method
                            ? `Bank ${p.payment_detail || ""}`
                            : "—"}
                        </button>
                        {paymentInfoOpen === p.influencer?.id && (
                          <div className="absolute top-6 left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-72" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-between items-center mb-3">
                              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Details</span>
                              <button onClick={() => setPaymentInfoOpen(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            {paymentInfoLoading ? (
                              <div className="text-xs text-gray-400">Loading…</div>
                            ) : paymentInfoData[p.influencer?.id || ""] ? (() => {
                              const info = paymentInfoData[p.influencer!.id];
                              const method = info.payment_method;
                              return (
                                <div className="space-y-2 text-xs">
                                  {info.payout_country && <div><span className="text-gray-400">Country:</span> <span className="text-gray-700">{info.payout_country}</span></div>}
                                  {method === "paypal" && <div><span className="text-gray-400">PayPal:</span> <span className="text-gray-700 select-all">{info.paypal_email}</span></div>}
                                  {method && method !== "paypal" && (
                                    <>
                                      {info.bank_account_name && <div><span className="text-gray-400">Name:</span> <span className="text-gray-700">{info.bank_account_name}</span></div>}
                                      {info.bank_institution && <div><span className="text-gray-400">Institution:</span> <span className="text-gray-700">{info.bank_institution}</span></div>}
                                      {info.bank_routing_number && <div><span className="text-gray-400">Routing:</span> <span className="text-gray-700 select-all">{info.bank_routing_number}</span></div>}
                                      {info.bank_account_number && <div><span className="text-gray-400">Account:</span> <span className="text-gray-700 select-all">{info.bank_account_number}</span></div>}
                                    </>
                                  )}
                                  {!method && <div className="text-gray-400">No payment method set</div>}
                                </div>
                              );
                            })() : (
                              <div className="text-xs text-gray-400">No payment info found</div>
                            )}
                          </div>
                        )}
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${sc.color}`}>
                        {sc.label}
                      </span>
                      <div className="flex-1" />
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {(p.status === "pending" || p.status === "approved") && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 text-[10px] px-2"
                            disabled={updating === p.id}
                            onClick={() => updatePayment(p.id, { status: "paid", approved_by: currentUser?.email || "Admin", paid_by: currentUser?.email || "Admin" }, p)}
                          >
                            Mark Paid
                          </Button>
                        )}
                        {p.status === "paid" && (
                          <span className="inline-flex items-center h-6 px-2 rounded text-[10px] font-medium bg-green-100 text-green-700">Paid</span>
                        )}
                        {p.status !== "skipped" && p.status !== "paid" && (
                          <button className="text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-wider" onClick={() => updatePayment(p.id, { status: "skipped" }, p)}>Skip</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
              </div>
            </div>
          )}
          </div>
        )}
      {/* Affiliate Audit Modal */}
      {auditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { setAuditOpen(null); setAuditData(null); }}>
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <div className="text-sm font-semibold text-gray-900">Affiliate Audit — {auditOpen.name}</div>
                {auditData && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    Code: {auditData.affiliate_code} · {auditData.commission_rate}% · {auditData.summary?.order_count || 0} orders · ${auditData.summary?.commission_owed?.toFixed(2) || "0.00"} commission
                  </div>
                )}
              </div>
              <button onClick={() => { setAuditOpen(null); setAuditData(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {auditLoading ? (
                <div className="text-center py-12 text-gray-400 text-sm">Loading orders...</div>
              ) : auditData?.orders?.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">No orders found for this month.</div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Order</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Date</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Customer</th>
                      <th className="text-left px-4 py-2 font-medium text-gray-500">Source</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">Gross</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">Refunds</th>
                      <th className="text-right px-4 py-2 font-medium text-gray-500">Net</th>
                      <th className="px-4 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(auditData?.orders || []).map((o: any) => {
                      const isExcluded = o.excluded;
                      const source = o.referring_site
                        ? new URL(o.referring_site).hostname.replace("www.", "")
                        : o.source_name || "direct";
                      const isSuspicious = /coupon|honey|retail|deal|discount|voucher|promo/i.test(o.referring_site || "") || /coupon|honey|retail|deal|discount|voucher|promo/i.test(o.landing_site || "");
                      return (
                        <tr key={o.order_id} className={`border-b border-gray-50 ${isExcluded ? "opacity-50 bg-red-50/30" : ""} ${isSuspicious ? "bg-amber-50/40" : ""}`}>
                          <td className="px-4 py-2 font-mono">#{o.order_number}</td>
                          <td className="px-4 py-2 text-gray-500">{new Date(o.created_at).toLocaleDateString("en", { month: "short", day: "numeric" })}</td>
                          <td className="px-4 py-2">
                            <div className="text-gray-700">{o.customer_name || "—"}</div>
                            <div className="text-gray-400">{o.customer_email || ""}</div>
                          </td>
                          <td className="px-4 py-2">
                            <div className="text-gray-700">{source}</div>
                            {o.landing_site && (
                              <div className="text-gray-400 truncate max-w-[200px]" title={o.landing_site}>
                                {o.landing_site.replace(/https?:\/\/[^/]+/, "")}
                              </div>
                            )}
                            {isSuspicious && <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-100 text-amber-700">Coupon site?</span>}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-700">${o.gross_amount.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-red-500">{o.refund_amount > 0 ? `-$${o.refund_amount.toFixed(2)}` : "—"}</td>
                          <td className="px-4 py-2 text-right font-medium text-gray-900">${o.net_amount.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              className={`text-[10px] uppercase tracking-wider ${isExcluded ? "text-green-600 hover:text-green-800" : "text-red-500 hover:text-red-700"}`}
                              disabled={excludingOrder === o.order_id}
                              onClick={() => toggleOrderExclusion(o.order_id, isExcluded)}
                            >
                              {excludingOrder === o.order_id ? "..." : isExcluded ? "Include" : "Exclude"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {auditData?.summary && (
              <div className="px-6 py-3 border-t bg-gray-50 flex items-center justify-between text-xs">
                <div className="text-gray-500">
                  {auditData.summary.order_count} orders · ${auditData.summary.total_gross?.toFixed(2)} gross · -${auditData.summary.total_refunds?.toFixed(2)} refunds · ${auditData.summary.total_net?.toFixed(2)} net
                </div>
                <div className="font-semibold text-gray-900">
                  Commission: ${auditData.summary.commission_owed?.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </main>
    </div>
  );
}

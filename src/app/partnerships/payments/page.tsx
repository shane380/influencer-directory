"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, RefreshCw, Pencil, Check, X, ChevronDown } from "lucide-react";

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
  const [generating, setGenerating] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [editingAmount, setEditingAmount] = useState<string | null>(null);
  const [amountText, setAmountText] = useState("");
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
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
      const res = await fetch(`/api/admin/payments?month=${month}`);
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

  async function generatePayments() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/admin/payments/generate?month=${month}`, { method: "POST" });
      const data = await res.json();
      console.log("Generate result:", data);
      await fetchPayments();
    } catch (err) {
      console.error("Generate failed:", err);
    }
    setGenerating(false);
  }

  async function updatePayment(id: string, updates: Record<string, any>) {
    setUpdating(id);
    try {
      const res = await fetch("/api/admin/payments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...updates }),
      });
      if (res.ok) {
        const data = await res.json();
        setPayments((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...data.payment } : p))
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

  // Group by creator
  const grouped: GroupedCreator[] = [];
  const groupMap: Record<string, GroupedCreator> = {};
  for (const p of payments) {
    const key = p.influencer_id;
    if (!groupMap[key]) {
      groupMap[key] = { influencer: p.influencer, payments: [], total: 0 };
      grouped.push(groupMap[key]);
    }
    groupMap[key].payments.push(p);
    groupMap[key].total += Number(p.amount_owed || 0);
  }

  // Summary stats
  const totalOwed = payments.reduce((s, p) => s + Number(p.amount_owed || 0), 0);
  const totalApproved = payments
    .filter((p) => p.status === "approved" || p.status === "paid")
    .reduce((s, p) => s + Number(p.amount_owed || 0), 0);
  const totalPaid = payments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + Number(p.amount_paid || p.amount_owed || 0), 0);
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
            <Button
              size="sm"
              variant="outline"
              onClick={generatePayments}
              disabled={generating}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${generating ? "animate-spin" : ""}`} />
              {generating ? "Generating..." : `Generate ${monthLabel}`}
            </Button>
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
            { label: "Approved", value: `$${totalApproved.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { label: "Total Paid", value: `$${totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}` },
            { label: "Pending", value: String(pendingCount) },
          ].map((s) => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</div>
              <div className="text-xl font-semibold text-gray-900">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading payments...</div>
        ) : payments.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <p className="text-gray-400 text-sm mb-3">No payment rows for {monthLabel}.</p>
            <Button size="sm" onClick={generatePayments} disabled={generating}>
              Generate Payments
            </Button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {grouped.map((group) => (
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

                      {/* Expand button for affiliate rows with details */}
                      {p.payment_type === "affiliate_commission" && p.calculation_details?.orders?.length > 0 && (
                        <button
                          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                          onClick={() => {
                            setExpandedDetails((prev) => {
                              const next = new Set(prev);
                              if (next.has(p.id)) next.delete(p.id);
                              else next.add(p.id);
                              return next;
                            });
                          }}
                        >
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedDetails.has(p.id) ? "rotate-180" : ""}`} />
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
                          <>${Number(p.amount_owed || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</>
                        )}
                      </div>

                      {/* Payment method */}
                      <div className="w-36 text-xs text-gray-400 truncate">
                        {p.payment_method === "paypal"
                          ? `PayPal — ${p.payment_detail || "—"}`
                          : p.payment_method === "bank"
                          ? `Bank ${p.payment_detail || ""}`
                          : p.payment_method || "—"}
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
                        {p.status === "pending" && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-6 text-[10px] px-2"
                            disabled={updating === p.id}
                            onClick={() =>
                              updatePayment(p.id, {
                                status: "approved",
                                approved_by: currentUser?.email || "Admin",
                              })
                            }
                          >
                            Approve
                          </Button>
                        )}
                        {p.status === "approved" && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              className="h-6 text-[10px] px-2 bg-green-600 hover:bg-green-700"
                              disabled={updating === p.id}
                              onClick={() =>
                                updatePayment(p.id, {
                                  status: "paid",
                                  paid_by: currentUser?.email || "Admin",
                                })
                              }
                            >
                              Mark Paid
                            </Button>
                            <button
                              className="text-[10px] text-blue-500 hover:text-blue-700 uppercase tracking-wider"
                              onClick={() => {
                                setEditingAmount(p.id);
                                setAmountText(String(p.amount_owed || 0));
                              }}
                            >
                              Edit $
                            </button>
                          </>
                        )}
                        {p.status !== "skipped" && (
                          <button
                            className="text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-wider"
                            onClick={() => updatePayment(p.id, { status: "skipped" })}
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
        )}
      </main>
    </div>
  );
}

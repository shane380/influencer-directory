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
  legacy_affiliate_id: string | null;
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
  legacyAffiliate?: {
    id: string;
    name: string;
    discount_code: string;
    commission_rate: number;
    payment_method: string | null;
    payment_detail: string | null;
  } | null;
}

interface LegacyAffiliate {
  id: string;
  name: string;
  discount_code: string;
  commission_rate: number;
  status: string;
  influencer_id: string | null;
  payment_method: string | null;
  payment_detail: string | null;
  notes: string | null;
}

interface GroupedCreator {
  influencer: Payment["influencer"];
  payments: Payment[];
  total: number;
}

interface GroupedLegacy {
  legacyAffiliate: Payment["legacyAffiliate"];
  payments: Payment[];
  total: number;
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  ad_spend_commission: { label: "Ad Spend", color: "bg-blue-50 text-blue-700 border-blue-200" },
  retainer: { label: "Retainer", color: "bg-purple-50 text-purple-700 border-purple-200" },
  affiliate_commission: { label: "Affiliate", color: "bg-amber-50 text-amber-700 border-amber-200" },
  paid_collab: { label: "Paid Collab", color: "bg-pink-50 text-pink-700 border-pink-200" },
  refund_adjustment: { label: "Refund Adj", color: "bg-red-50 text-red-700 border-red-200" },
  legacy_affiliate_commission: { label: "Legacy Aff", color: "bg-orange-50 text-orange-700 border-orange-200" },
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
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
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
  const [paymentInfoEditing, setPaymentInfoEditing] = useState<string | null>(null);
  const [paymentInfoForm, setPaymentInfoForm] = useState({ payment_method: "", payout_country: "", paypal_email: "", bank_account_name: "", bank_institution: "", bank_routing_number: "", bank_account_number: "" });
  const [paymentInfoSaving, setPaymentInfoSaving] = useState(false);
  const [auditOpen, setAuditOpen] = useState<{ influencerId: string; name: string } | null>(null);
  const [auditData, setAuditData] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [excludingOrder, setExcludingOrder] = useState<number | null>(null);
  const [legacyModalOpen, setLegacyModalOpen] = useState(false);
  const [legacyAffiliates, setLegacyAffiliates] = useState<LegacyAffiliate[]>([]);
  const [legacyForm, setLegacyForm] = useState({ name: "", discount_code: "", commission_rate: "25", payment_method: "", payment_detail: "", notes: "" });
  const [legacySaving, setLegacySaving] = useState(false);
  const [legacyEditing, setLegacyEditing] = useState<string | null>(null);
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

  const fetchLegacyAffiliates = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/legacy-affiliates");
      const data = await res.json();
      setLegacyAffiliates(data.legacyAffiliates || []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    fetchLegacyAffiliates();
  }, [fetchLegacyAffiliates]);

  async function saveLegacyAffiliate() {
    setLegacySaving(true);
    try {
      if (legacyEditing) {
        await fetch("/api/admin/legacy-affiliates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: legacyEditing,
            name: legacyForm.name,
            discount_code: legacyForm.discount_code,
            commission_rate: parseFloat(legacyForm.commission_rate) || 25,
            payment_method: legacyForm.payment_method || null,
            payment_detail: legacyForm.payment_detail || null,
            notes: legacyForm.notes || null,
          }),
        });
      } else {
        await fetch("/api/admin/legacy-affiliates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: legacyForm.name,
            discount_code: legacyForm.discount_code,
            commission_rate: parseFloat(legacyForm.commission_rate) || 25,
            payment_method: legacyForm.payment_method || null,
            payment_detail: legacyForm.payment_detail || null,
            notes: legacyForm.notes || null,
          }),
        });
      }
      setLegacyForm({ name: "", discount_code: "", commission_rate: "25", payment_method: "", payment_detail: "", notes: "" });
      setLegacyEditing(null);
      await fetchLegacyAffiliates();
      fetchPayments();
    } catch {}
    setLegacySaving(false);
  }

  async function removeLegacyAffiliate(id: string) {
    await fetch(`/api/admin/legacy-affiliates?id=${id}`, { method: "DELETE" });
    await fetchLegacyAffiliates();
    fetchPayments();
  }

  async function openAudit(influencerId: string, name: string, legacyAffiliateId?: string) {
    setAuditOpen({ influencerId, name });
    setAuditLoading(true);
    try {
      const param = legacyAffiliateId
        ? `legacy_affiliate_id=${legacyAffiliateId}`
        : `influencer_id=${influencerId}`;
      const res = await fetch(`/api/admin/affiliate-audit?${param}&month=${month}`);
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
      const res = await fetch(`/api/admin/payment-info?influencer_id=${influencerId}`);
      if (res.ok) {
        const data = await res.json();
        setPaymentInfoData((prev) => ({ ...prev, [influencerId]: data }));
      }
    } catch {}
    setPaymentInfoLoading(false);
  }

  function startEditingPaymentInfo(influencerId: string) {
    const info = paymentInfoData[influencerId] || {};
    setPaymentInfoEditing(influencerId);
    setPaymentInfoForm({
      payment_method: info.payment_method || "",
      payout_country: info.payout_country || "",
      paypal_email: info.paypal_email || "",
      bank_account_name: info.bank_account_name || "",
      bank_institution: info.bank_institution || "",
      bank_routing_number: info.bank_routing_number || "",
      bank_account_number: info.bank_account_number || "",
    });
  }

  async function savePaymentInfo(influencerId: string) {
    setPaymentInfoSaving(true);
    try {
      const res = await fetch("/api/admin/payment-info", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ influencer_id: influencerId, ...paymentInfoForm }),
      });
      if (res.ok) {
        const data = await res.json();
        setPaymentInfoData((prev) => ({ ...prev, [influencerId]: data }));
        setPaymentInfoEditing(null);
        // Refresh payments to update payment_detail mask on the row
        fetchPayments();
      }
    } catch (err) {
      console.error("Failed to save payment info:", err);
    }
    setPaymentInfoSaving(false);
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
            legacy_affiliate_id: fullPayment.legacy_affiliate_id,
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
          prev.map((p) => (p.id === id ? { ...p, ...data.payment, influencer: p.influencer, deal: p.deal, legacyAffiliate: p.legacyAffiliate } : p))
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
    const isAdminOrManager = currentUser?.isAdmin || currentUser?.isManager;
    const rows = payments.filter((p) => p.status === "paid" || p.status === "approved");
    const header = isAdminOrManager
      ? "Creator,Handle,Type,Amount Owed,Amount Paid,Payment Method,Payment Detail,Status,Paid At"
      : "Creator,Handle,Type,Amount Owed,Amount Paid,Status,Paid At";
    const csv = [
      header,
      ...rows.map((p) => {
        const tc = TYPE_CONFIG[p.payment_type];
        const baseCols = [
          p.influencer?.name || p.legacyAffiliate?.name || "",
          p.influencer?.instagram_handle || (p.legacyAffiliate ? p.legacyAffiliate.discount_code : "") || "",
          tc?.label || p.payment_type,
          p.amount_owed ?? "",
          p.amount_paid ?? "",
        ];
        if (isAdminOrManager) {
          baseCols.push(p.payment_method || "", p.payment_detail || "");
        }
        baseCols.push(p.status, p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "");
        return baseCols
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

  // Split into partners, legacy affiliates, and paid collabs
  const partnerPayments = payments.filter((p) => p.payment_type !== "paid_collab" && p.payment_type !== "legacy_affiliate_commission" && !p.legacy_affiliate_id);
  const legacyPayments = payments.filter((p) => p.payment_type === "legacy_affiliate_commission" || (p.legacy_affiliate_id && p.payment_type === "refund_adjustment"));
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

  function groupByLegacy(items: Payment[]): GroupedLegacy[] {
    const groups: GroupedLegacy[] = [];
    const map: Record<string, GroupedLegacy> = {};
    for (const p of items) {
      const key = p.legacy_affiliate_id || "unknown";
      if (!map[key]) {
        map[key] = { legacyAffiliate: p.legacyAffiliate, payments: [], total: 0 };
        groups.push(map[key]);
      }
      map[key].payments.push(p);
      map[key].total += Number(p.amount_owed || 0);
    }
    return groups;
  }

  const partnerGroups = groupByCreator(partnerPayments).sort((a, b) => b.total - a.total);
  const legacyGroups = groupByLegacy(legacyPayments).sort((a, b) => b.total - a.total);
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
      <main className="flex-1 p-8 overflow-auto">
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
            <button
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded px-2.5 py-1.5"
              onClick={() => { setLegacyModalOpen(true); setLegacyEditing(null); setLegacyForm({ name: "", discount_code: "", commission_rate: "25", payment_method: "", payment_detail: "", notes: "" }); }}
            >
              Legacy Codes
            </button>
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
                  {/* Payment info — one per creator, admin/manager only */}
                  {(currentUser?.isAdmin || currentUser?.isManager) && group.influencer && (
                    <div className="relative">
                      <button
                        className="text-[10px] text-gray-400 hover:text-gray-600 hover:underline uppercase tracking-wider"
                        onClick={() => fetchPaymentInfo(group.influencer!.id)}
                      >
                        {group.payments[0]?.payment_method === "paypal"
                          ? `PayPal — ${group.payments[0]?.payment_detail || "—"}`
                          : group.payments[0]?.payment_method === "e_transfer"
                          ? `E-Transfer — ${group.payments[0]?.payment_detail || "—"}`
                          : group.payments[0]?.payment_method
                          ? `Bank ${group.payments[0]?.payment_detail || ""}`
                          : "Payment Info"}
                      </button>
                      {paymentInfoOpen === group.influencer.id && (
                        <div className="absolute top-6 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-80" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Details</span>
                            <div className="flex items-center gap-2">
                              {paymentInfoEditing !== group.influencer.id && !paymentInfoLoading && (
                                <button onClick={() => startEditingPaymentInfo(group.influencer!.id)} className="text-gray-400 hover:text-gray-600">
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                              <button onClick={() => { setPaymentInfoOpen(null); setPaymentInfoEditing(null); }} className="text-gray-400 hover:text-gray-600">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {paymentInfoLoading ? (
                            <div className="text-xs text-gray-400">Loading…</div>
                          ) : paymentInfoEditing === group.influencer.id ? (
                            <div className="space-y-2 text-xs">
                              <div>
                                <label className="text-gray-400 block mb-0.5">Method</label>
                                <select className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.payment_method} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, payment_method: e.target.value })}>
                                  <option value="">Select...</option>
                                  <option value="paypal">PayPal</option>
                                  <option value="us_ach">US ACH</option>
                                  <option value="ca_eft">CA EFT</option>
                                  <option value="intl_wire">Intl Wire</option>
                                  <option value="e_transfer">E-Transfer</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-gray-400 block mb-0.5">Country</label>
                                <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.payout_country} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, payout_country: e.target.value })} placeholder="e.g. US, CA" />
                              </div>
                              {paymentInfoForm.payment_method === "paypal" || paymentInfoForm.payment_method === "e_transfer" ? (
                                <div>
                                  <label className="text-gray-400 block mb-0.5">{paymentInfoForm.payment_method === "e_transfer" ? "E-Transfer Email" : "PayPal Email"}</label>
                                  <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.paypal_email} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, paypal_email: e.target.value })} placeholder="email@example.com" />
                                </div>
                              ) : paymentInfoForm.payment_method ? (
                                <>
                                  <div>
                                    <label className="text-gray-400 block mb-0.5">Account Name</label>
                                    <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.bank_account_name} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, bank_account_name: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className="text-gray-400 block mb-0.5">Institution</label>
                                    <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.bank_institution} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, bank_institution: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className="text-gray-400 block mb-0.5">Routing Number</label>
                                    <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.bank_routing_number} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, bank_routing_number: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className="text-gray-400 block mb-0.5">Account Number</label>
                                    <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.bank_account_number} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, bank_account_number: e.target.value })} />
                                  </div>
                                </>
                              ) : null}
                              <div className="flex items-center gap-2 pt-1">
                                <button className="px-3 py-1 bg-gray-900 text-white rounded text-xs hover:bg-gray-800 disabled:opacity-50" disabled={!paymentInfoForm.payment_method || paymentInfoSaving} onClick={() => savePaymentInfo(group.influencer!.id)}>
                                  {paymentInfoSaving ? "Saving..." : "Save"}
                                </button>
                                <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setPaymentInfoEditing(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : paymentInfoData[group.influencer.id] ? (() => {
                            const info = paymentInfoData[group.influencer!.id];
                            const method = info.payment_method;
                            return (
                              <div className="space-y-2 text-xs">
                                {info.payout_country && (
                                  <div><span className="text-gray-400">Country:</span> <span className="text-gray-700">{info.payout_country}</span></div>
                                )}
                                {method === "paypal" && (
                                  <div><span className="text-gray-400">PayPal:</span> <span className="text-gray-700 select-all">{info.paypal_email}</span></div>
                                )}
                                {method === "e_transfer" && (
                                  <div><span className="text-gray-400">E-Transfer:</span> <span className="text-gray-700 select-all">{info.paypal_email}</span></div>
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
                  )}
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
                          <>
                            <span className="inline-flex items-center h-6 px-2 rounded text-[10px] font-medium bg-green-100 text-green-700">
                              Paid
                            </span>
                            <button className="text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-wider" onClick={() => updatePayment(p.id, { status: "pending", paid_by: null, paid_at: null }, p)}>Undo</button>
                          </>
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
          {/* Legacy Affiliates Section */}
          {legacyGroups.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider">Legacy Affiliates</h2>
                <button
                  className="text-xs text-gray-400 hover:text-gray-600"
                  onClick={() => { setLegacyModalOpen(true); setLegacyEditing(null); setLegacyForm({ name: "", discount_code: "", commission_rate: "25", payment_method: "", payment_detail: "", notes: "" }); }}
                >
                  Manage
                </button>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {legacyGroups.map((group) => (
                  <div key={group.legacyAffiliate?.id || "unknown"} className="border-b border-gray-100 last:border-b-0">
                    <div className="flex items-center gap-3 px-5 py-3 bg-gray-50/50">
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 flex-shrink-0 bg-orange-50 flex items-center justify-center">
                        <span className="text-xs font-medium text-orange-600">{group.legacyAffiliate?.name?.[0] || "?"}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900">{group.legacyAffiliate?.name || "Unknown"}</div>
                        <div className="text-xs text-gray-400">{group.legacyAffiliate?.discount_code || "—"} · {group.legacyAffiliate?.commission_rate || 25}%</div>
                      </div>
                      <div className="text-sm font-medium text-gray-700">
                        ${group.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {group.payments.map((p) => {
                      const tc = TYPE_CONFIG[p.payment_type] || { label: p.payment_type, color: "bg-gray-100 text-gray-600" };
                      const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;
                      return (
                        <div key={p.id}>
                          <div className="flex items-center gap-4 px-5 py-2.5 pl-16 border-t border-gray-50 hover:bg-gray-50/30">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider border ${tc.color}`}>
                              {tc.label}
                            </span>

                            {p.payment_type === "legacy_affiliate_commission" && p.legacyAffiliate && (
                              <button
                                className="text-[10px] text-blue-500 hover:text-blue-700 uppercase tracking-wider flex-shrink-0"
                                onClick={() => openAudit(p.legacy_affiliate_id || "", p.legacyAffiliate!.name, p.legacy_affiliate_id || undefined)}
                              >
                                Audit
                              </button>
                            )}

                            <div className="w-24 text-sm text-gray-900">
                              {Number(p.amount_owed || 0) < 0 ? "-" : ""}${Math.abs(Number(p.amount_owed || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </div>

                            <div className="w-36">
                              <span className="text-xs text-gray-400 truncate">
                                {p.payment_method === "paypal"
                                  ? `PayPal — ${p.payment_detail || "—"}`
                                  : p.payment_method === "e_transfer"
                                  ? `E-Transfer — ${p.payment_detail || "—"}`
                                  : p.payment_method
                                  ? `Bank ${p.payment_detail || ""}`
                                  : "—"}
                              </span>
                            </div>

                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider ${sc.color}`}>
                              {sc.label}
                            </span>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-400 truncate">{p.notes || ""}</span>
                                <button
                                  className="text-gray-300 hover:text-gray-500 flex-shrink-0"
                                  onClick={() => { setEditingNote(p.id); setNoteText(p.notes || ""); }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                              </div>
                            </div>

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
                                <>
                                  <span className="inline-flex items-center h-6 px-2 rounded text-[10px] font-medium bg-green-100 text-green-700">Paid</span>
                                  <button className="text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-wider" onClick={() => updatePayment(p.id, { status: "pending", paid_by: null, paid_at: null }, p)}>Undo</button>
                                </>
                              )}
                              {p.status !== "skipped" && p.status !== "paid" && (
                                <button className="text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-wider" onClick={() => updatePayment(p.id, { status: "skipped" }, p)}>Skip</button>
                              )}
                            </div>
                          </div>

                          {p.payment_type === "legacy_affiliate_commission" && expandedDetails.has(p.id) && p.calculation_details && (
                            <div className="px-5 pl-16 pb-3 bg-orange-50/30 border-t border-orange-100">
                              <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-2 mb-1.5">
                                {p.calculation_details.order_count} orders &middot; ${p.calculation_details.total_gross?.toFixed(2)} gross &middot; -${p.calculation_details.total_refunds?.toFixed(2)} refunds &middot; ${p.calculation_details.total_net?.toFixed(2)} net &times; {(p.calculation_details.commission_rate * 100).toFixed(0)}% = ${p.calculation_details.commission_owed?.toFixed(2)}
                              </div>
                              <div className="space-y-0.5">
                                {(p.calculation_details.orders || []).map((o: any, idx: number) => (
                                  <div key={idx} className="flex items-center gap-4 text-[11px] text-gray-500">
                                    <span className="w-16 text-gray-400">#{o.order_number}</span>
                                    <span className="w-20">{new Date(o.created_at).toLocaleDateString()}</span>
                                    <span className="w-16 text-right">${o.gross_amount.toFixed(2)}</span>
                                    {o.refund_amount > 0 && <span className="text-red-400 w-16 text-right">-${o.refund_amount.toFixed(2)}</span>}
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
                  {/* Payment info — one per creator, admin/manager only */}
                  {(currentUser?.isAdmin || currentUser?.isManager) && group.influencer && (
                    <div className="relative">
                      <button
                        className="text-[10px] text-gray-400 hover:text-gray-600 hover:underline uppercase tracking-wider"
                        onClick={() => fetchPaymentInfo(group.influencer!.id)}
                      >
                        {group.payments[0]?.payment_method === "paypal"
                          ? `PayPal — ${group.payments[0]?.payment_detail || "—"}`
                          : group.payments[0]?.payment_method === "e_transfer"
                          ? `E-Transfer — ${group.payments[0]?.payment_detail || "—"}`
                          : group.payments[0]?.payment_method
                          ? `Bank ${group.payments[0]?.payment_detail || ""}`
                          : "Payment Info"}
                      </button>
                      {paymentInfoOpen === group.influencer.id && (
                        <div className="absolute top-6 right-0 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-80" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-between items-center mb-3">
                            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Payment Details</span>
                            <div className="flex items-center gap-2">
                              {paymentInfoEditing !== group.influencer.id && !paymentInfoLoading && (
                                <button onClick={() => startEditingPaymentInfo(group.influencer!.id)} className="text-gray-400 hover:text-gray-600">
                                  <Pencil className="h-3 w-3" />
                                </button>
                              )}
                              <button onClick={() => { setPaymentInfoOpen(null); setPaymentInfoEditing(null); }} className="text-gray-400 hover:text-gray-600">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          {paymentInfoLoading ? (
                            <div className="text-xs text-gray-400">Loading…</div>
                          ) : paymentInfoEditing === group.influencer.id ? (
                            <div className="space-y-2 text-xs">
                              <div>
                                <label className="text-gray-400 block mb-0.5">Method</label>
                                <select className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.payment_method} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, payment_method: e.target.value })}>
                                  <option value="">Select...</option>
                                  <option value="paypal">PayPal</option>
                                  <option value="us_ach">US ACH</option>
                                  <option value="ca_eft">CA EFT</option>
                                  <option value="intl_wire">Intl Wire</option>
                                  <option value="e_transfer">E-Transfer</option>
                                </select>
                              </div>
                              <div>
                                <label className="text-gray-400 block mb-0.5">Country</label>
                                <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.payout_country} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, payout_country: e.target.value })} placeholder="e.g. US, CA" />
                              </div>
                              {paymentInfoForm.payment_method === "paypal" || paymentInfoForm.payment_method === "e_transfer" ? (
                                <div>
                                  <label className="text-gray-400 block mb-0.5">{paymentInfoForm.payment_method === "e_transfer" ? "E-Transfer Email" : "PayPal Email"}</label>
                                  <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.paypal_email} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, paypal_email: e.target.value })} placeholder="email@example.com" />
                                </div>
                              ) : paymentInfoForm.payment_method ? (
                                <>
                                  <div>
                                    <label className="text-gray-400 block mb-0.5">Account Name</label>
                                    <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.bank_account_name} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, bank_account_name: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className="text-gray-400 block mb-0.5">Institution</label>
                                    <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.bank_institution} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, bank_institution: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className="text-gray-400 block mb-0.5">Routing Number</label>
                                    <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.bank_routing_number} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, bank_routing_number: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className="text-gray-400 block mb-0.5">Account Number</label>
                                    <input className="w-full border border-gray-200 rounded px-2 py-1 text-xs" value={paymentInfoForm.bank_account_number} onChange={(e) => setPaymentInfoForm({ ...paymentInfoForm, bank_account_number: e.target.value })} />
                                  </div>
                                </>
                              ) : null}
                              <div className="flex items-center gap-2 pt-1">
                                <button className="px-3 py-1 bg-gray-900 text-white rounded text-xs hover:bg-gray-800 disabled:opacity-50" disabled={!paymentInfoForm.payment_method || paymentInfoSaving} onClick={() => savePaymentInfo(group.influencer!.id)}>
                                  {paymentInfoSaving ? "Saving..." : "Save"}
                                </button>
                                <button className="text-xs text-gray-400 hover:text-gray-600" onClick={() => setPaymentInfoEditing(null)}>Cancel</button>
                              </div>
                            </div>
                          ) : paymentInfoData[group.influencer.id] ? (() => {
                            const info = paymentInfoData[group.influencer!.id];
                            const method = info.payment_method;
                            return (
                              <div className="space-y-2 text-xs">
                                {info.payout_country && <div><span className="text-gray-400">Country:</span> <span className="text-gray-700">{info.payout_country}</span></div>}
                                {method === "paypal" && <div><span className="text-gray-400">PayPal:</span> <span className="text-gray-700 select-all">{info.paypal_email}</span></div>}
                                {method === "e_transfer" && <div><span className="text-gray-400">E-Transfer:</span> <span className="text-gray-700 select-all">{info.paypal_email}</span></div>}
                                {method && method !== "paypal" && method !== "e_transfer" && (
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
                  )}
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
                          <>
                            <span className="inline-flex items-center h-6 px-2 rounded text-[10px] font-medium bg-green-100 text-green-700">Paid</span>
                            <button className="text-[10px] text-gray-400 hover:text-gray-600 uppercase tracking-wider" onClick={() => updatePayment(p.id, { status: "pending", paid_by: null, paid_at: null }, p)}>Undo</button>
                          </>
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
      {/* Legacy Affiliates Management Modal */}
      {legacyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setLegacyModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div className="text-sm font-semibold text-gray-900">Manage Legacy Affiliate Codes</div>
              <button onClick={() => setLegacyModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              {/* Existing codes */}
              {legacyAffiliates.length > 0 && (
                <table className="w-full text-xs mb-6">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-gray-500">Name</th>
                      <th className="text-left py-2 font-medium text-gray-500">Code</th>
                      <th className="text-left py-2 font-medium text-gray-500">Rate</th>
                      <th className="text-left py-2 font-medium text-gray-500">Payment</th>
                      <th className="text-left py-2 font-medium text-gray-500">Status</th>
                      <th className="py-2 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {legacyAffiliates.map((la) => (
                      <tr key={la.id} className="border-b border-gray-50">
                        <td className="py-2 text-gray-700">{la.name}</td>
                        <td className="py-2 font-mono text-gray-500">{la.discount_code}</td>
                        <td className="py-2 text-gray-500">{la.commission_rate}%</td>
                        <td className="py-2 text-gray-500">
                          {la.payment_method === "paypal" ? `PayPal — ${la.payment_detail || ""}` : la.payment_method === "e_transfer" ? `E-Transfer — ${la.payment_detail || ""}` : la.payment_method ? `Bank ${la.payment_detail || ""}` : "—"}
                        </td>
                        <td className="py-2">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${la.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-400"}`}>
                            {la.status}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <button
                            className="text-[10px] text-blue-500 hover:text-blue-700 uppercase tracking-wider mr-2"
                            onClick={() => {
                              setLegacyEditing(la.id);
                              setLegacyForm({
                                name: la.name,
                                discount_code: la.discount_code,
                                commission_rate: String(la.commission_rate),
                                payment_method: la.payment_method || "",
                                payment_detail: la.payment_detail || "",
                                notes: la.notes || "",
                              });
                            }}
                          >
                            Edit
                          </button>
                          {la.status === "active" && (
                            <button
                              className="text-[10px] text-red-500 hover:text-red-700 uppercase tracking-wider"
                              onClick={() => removeLegacyAffiliate(la.id)}
                            >
                              Remove
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Add / Edit form */}
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  {legacyEditing ? "Edit Code" : "Add New Code"}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    className="col-span-1 border border-gray-200 rounded px-3 py-1.5 text-xs"
                    placeholder="Name (e.g. Molly Dalton)"
                    value={legacyForm.name}
                    onChange={(e) => setLegacyForm({ ...legacyForm, name: e.target.value })}
                  />
                  <input
                    className="col-span-1 border border-gray-200 rounded px-3 py-1.5 text-xs font-mono"
                    placeholder="Discount Code (e.g. MOLLYDALTON)"
                    value={legacyForm.discount_code}
                    onChange={(e) => setLegacyForm({ ...legacyForm, discount_code: e.target.value })}
                  />
                  <input
                    className="col-span-1 border border-gray-200 rounded px-3 py-1.5 text-xs"
                    placeholder="Commission Rate (%)"
                    value={legacyForm.commission_rate}
                    onChange={(e) => setLegacyForm({ ...legacyForm, commission_rate: e.target.value })}
                    type="number"
                  />
                  <select
                    className="col-span-1 border border-gray-200 rounded px-3 py-1.5 text-xs"
                    value={legacyForm.payment_method}
                    onChange={(e) => setLegacyForm({ ...legacyForm, payment_method: e.target.value })}
                  >
                    <option value="">Payment Method...</option>
                    <option value="paypal">PayPal</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                  <input
                    className="col-span-1 border border-gray-200 rounded px-3 py-1.5 text-xs"
                    placeholder="Payment Detail (email or account)"
                    value={legacyForm.payment_detail}
                    onChange={(e) => setLegacyForm({ ...legacyForm, payment_detail: e.target.value })}
                  />
                  <input
                    className="col-span-1 border border-gray-200 rounded px-3 py-1.5 text-xs"
                    placeholder="Notes (optional)"
                    value={legacyForm.notes}
                    onChange={(e) => setLegacyForm({ ...legacyForm, notes: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!legacyForm.name || !legacyForm.discount_code || legacySaving}
                    onClick={saveLegacyAffiliate}
                  >
                    {legacySaving ? "Saving..." : legacyEditing ? "Update" : "Add Code"}
                  </Button>
                  {legacyEditing && (
                    <button
                      className="text-xs text-gray-400 hover:text-gray-600"
                      onClick={() => {
                        setLegacyEditing(null);
                        setLegacyForm({ name: "", discount_code: "", commission_rate: "25", payment_method: "", payment_detail: "", notes: "" });
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
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

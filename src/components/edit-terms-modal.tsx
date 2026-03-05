"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { X } from "lucide-react";

interface DealStructure {
  type: "affiliate" | "ad_spend" | "retainer" | "hybrid";
  commission_rate?: number;
  percentage?: number;
  minimum_spend?: number;
  first_month_minimum?: number;
  monthly_rate?: number;
  retainer?: number;
}

interface EditTermsModalProps {
  inviteId: string;
  initialValues: {
    videos_per_month: string;
    content_type: string;
    usage_rights: string;
    notes: string;
    deal_structure: DealStructure | null;
    commission_rate: number;
    status: string;
  };
  onClose: () => void;
  onSaved: (updated: any) => void;
}

const DEAL_TYPES = [
  { value: "affiliate", label: "Affiliate Commission" },
  { value: "ad_spend", label: "% of Ad Spend" },
  { value: "retainer", label: "Monthly Retainer" },
  { value: "hybrid", label: "Hybrid" },
] as const;

export function EditTermsModal({ inviteId, initialValues, onClose, onSaved }: EditTermsModalProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  const [videosPerMonth, setVideosPerMonth] = useState(initialValues.videos_per_month || "");
  const [contentType, setContentType] = useState(initialValues.content_type || "");
  const [notes, setNotes] = useState(initialValues.notes || "");

  // Deal structure
  const existing = initialValues.deal_structure;
  const [dealType, setDealType] = useState<DealStructure["type"]>(
    existing?.type || "affiliate"
  );
  const [commissionRate, setCommissionRate] = useState(
    existing?.commission_rate ?? initialValues.commission_rate ?? 10
  );
  const [adSpendPct, setAdSpendPct] = useState(existing?.percentage ?? 5);
  const [minSpend, setMinSpend] = useState(existing?.minimum_spend ?? 0);
  const [monthlyRate, setMonthlyRate] = useState(existing?.monthly_rate ?? 500);
  const [hybridCommission, setHybridCommission] = useState(existing?.commission_rate ?? 5);
  const [hybridRetainer, setHybridRetainer] = useState(existing?.retainer ?? 300);
  const [firstMonthEnabled, setFirstMonthEnabled] = useState((existing?.first_month_minimum ?? 0) > 0);
  const [firstMonthMin, setFirstMonthMin] = useState(existing?.first_month_minimum ?? 500);

  function buildDealStructure(): DealStructure {
    switch (dealType) {
      case "affiliate":
        return { type: "affiliate", commission_rate: commissionRate };
      case "ad_spend":
        return { type: "ad_spend", percentage: adSpendPct, ...(minSpend > 0 ? { minimum_spend: minSpend } : {}), ...(firstMonthEnabled && firstMonthMin > 0 ? { first_month_minimum: firstMonthMin } : {}) };
      case "retainer":
        return { type: "retainer", monthly_rate: monthlyRate };
      case "hybrid":
        return { type: "hybrid", commission_rate: hybridCommission, retainer: hybridRetainer };
    }
  }

  async function handleSave() {
    setSaving(true);
    const dealStructure = buildDealStructure();
    const resolvedCommission =
      dealType === "affiliate" ? commissionRate :
      dealType === "hybrid" ? hybridCommission :
      initialValues.commission_rate;

    const { error } = await (supabase as any)
      .from("creator_invites")
      .update({
        videos_per_month: videosPerMonth,
        content_type: contentType,
        notes,
        deal_structure: dealStructure,
        commission_rate: resolvedCommission,
      })
      .eq("id", inviteId);

    if (error) {
      alert("Failed to save: " + error.message);
      setSaving(false);
      return;
    }

    onSaved({
      videos_per_month: videosPerMonth,
      content_type: contentType,
      notes,
      deal_structure: dealStructure,
      commission_rate: resolvedCommission,
    });
    setSaving(false);
  }

  const inputClass = "w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Edit Terms</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {initialValues.status === "pending" && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Changes will be reflected on the invite link immediately.
            </div>
          )}

          <div>
            <label className={labelClass}>Videos per Month</label>
            <input type="text" value={videosPerMonth} onChange={(e) => setVideosPerMonth(e.target.value)} className={inputClass} placeholder="3-5" />
          </div>

          <div>
            <label className={labelClass}>Content Type</label>
            <input type="text" value={contentType} onChange={(e) => setContentType(e.target.value)} className={inputClass} placeholder="Talking-style UGC" />
          </div>

          {/* Deal Structure */}
          <div className="border-t pt-5">
            <label className={labelClass}>Deal Structure</label>
            <select
              value={dealType}
              onChange={(e) => setDealType(e.target.value as DealStructure["type"])}
              className={inputClass + " mb-3"}
            >
              {DEAL_TYPES.map((dt) => (
                <option key={dt.value} value={dt.value}>{dt.label}</option>
              ))}
            </select>

            {dealType === "affiliate" && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Commission Rate (%)</label>
                <input type="number" value={commissionRate} onChange={(e) => setCommissionRate(Number(e.target.value))} className={inputClass} />
              </div>
            )}

            {dealType === "ad_spend" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Percentage of Ad Spend (%)</label>
                  <input type="number" value={adSpendPct} onChange={(e) => setAdSpendPct(Number(e.target.value))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Minimum Spend Threshold (USD, optional)</label>
                  <input type="number" value={minSpend} onChange={(e) => setMinSpend(Number(e.target.value))} className={inputClass} placeholder="0" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={firstMonthEnabled} onChange={(e) => setFirstMonthEnabled(e.target.checked)} className="rounded border-gray-300" />
                  <span className="text-xs text-gray-600">Guarantee a minimum for month 1</span>
                </label>
                {firstMonthEnabled && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">First Month Minimum (USD)</label>
                    <input type="number" value={firstMonthMin} onChange={(e) => setFirstMonthMin(Number(e.target.value))} className={inputClass} placeholder="500" />
                  </div>
                )}
              </div>
            )}

            {dealType === "retainer" && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Monthly Rate (USD)</label>
                <input type="number" value={monthlyRate} onChange={(e) => setMonthlyRate(Number(e.target.value))} className={inputClass} />
              </div>
            )}

            {dealType === "hybrid" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Commission Rate (%)</label>
                  <input type="number" value={hybridCommission} onChange={(e) => setHybridCommission(Number(e.target.value))} className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Retainer Amount (USD/month)</label>
                  <input type="number" value={hybridRetainer} onChange={(e) => setHybridRetainer(Number(e.target.value))} className={inputClass} />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="border-t pt-5">
            <label className={labelClass}>Internal Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Internal only - not shown to creator"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

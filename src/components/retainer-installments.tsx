"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CampaignDeal, PaymentMilestone } from "@/types/database";
import { inferGate, earnedOn, endDate, endDateIsEstimate } from "@/lib/retainers";
import { formatCurrencyDetailed } from "@/lib/constants";
import { Check, Loader2, X } from "lucide-react";

interface RetainerInstallmentsProps {
  deal: CampaignDeal;
  onSaved: () => void;
}

// One pill per installment. Setting a delivered date is what EARNS an
// installment — it is the single input the accrual figures are built from, so it
// lives on the row rather than behind the deal dialog.
export function RetainerInstallments({ deal, onSaved }: RetainerInstallmentsProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const milestones = deal.payment_terms || [];
  if (milestones.length === 0) {
    return <span className="text-gray-300 text-xs">—</span>;
  }

  async function save(milestoneId: string, value: string | null) {
    setSaving(true);
    setError(null);

    const updated: PaymentMilestone[] = milestones.map((m) =>
      m.id === milestoneId ? { ...m, gate: inferGate(m), earned_on: value } : m
    );

    // A term that ends on content ("30 days after the final post") only gets a
    // real end date once the last installment lands, so recompute it here.
    const patch: Record<string, unknown> = { payment_terms: updated };
    if (deal.term_months && !deal.ends_on) {
      const allDelivered = updated.every((m) => earnedOn(m, deal) !== null);
      const last = updated
        .map((m) => earnedOn(m, deal))
        .filter((d): d is string => d !== null)
        .sort()
        .pop();
      if (allDelivered && last) {
        const tail = new Date(last + "T00:00:00");
        tail.setDate(tail.getDate() + 30);
        patch.ends_on = tail.toISOString().slice(0, 10);
      }
    }

    const { error: err } = await supabase
      .from("campaign_deals")
      .update(patch as never)
      .eq("id", deal.id);

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setOpenId(null);
    onSaved();
  }

  return (
    <div className="flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
      {milestones.map((m, i) => {
        const on = earnedOn(m, deal);
        const gate = inferGate(m);
        const isOpen = openId === m.id;

        const tone = m.is_paid
          ? "bg-green-50 border-green-300 text-green-800"
          : on
          ? "bg-amber-50 border-amber-300 text-amber-800"
          : "bg-gray-50 border-gray-300 text-gray-500";

        const state = m.is_paid ? "paid" : on ? "earned, unpaid" : "pending";

        return (
          <div key={m.id} className="relative">
            <button
              type="button"
              title={`${m.description} · ${formatCurrencyDetailed(m.amount)} · ${state}${on ? ` · ${on}` : ""}`}
              onClick={() => {
                setOpenId(isOpen ? null : m.id);
                setDraft(m.earned_on || "");
                setError(null);
              }}
              className={`px-1.5 py-0.5 rounded border text-[11px] font-medium hover:brightness-95 transition ${tone}`}
            >
              {m.is_paid && <Check className="h-3 w-3 inline -mt-0.5 mr-0.5" />}
              {i + 1}
            </button>

            {isOpen && (
              <div className="absolute z-30 top-full left-0 mt-1 w-64 bg-white border rounded-lg shadow-lg p-3 text-left">
                <div className="text-xs font-medium text-gray-900">{m.description}</div>
                <div className="text-[11px] text-gray-500 mb-2">
                  {formatCurrencyDetailed(m.amount)} · {state}
                </div>

                {gate === "on_execution" && !m.earned_on && deal.starts_on ? (
                  <p className="text-[11px] text-gray-500 mb-2">
                    Earned automatically on the start date ({deal.starts_on}). Set a date below only
                    to override it.
                  </p>
                ) : (
                  <p className="text-[11px] text-gray-500 mb-2">
                    Set the date the content was delivered. That date is when this installment earns.
                  </p>
                )}

                <input
                  type="date"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="w-full border rounded px-2 py-1 text-xs mb-2"
                />

                {error && <div className="text-[11px] text-red-600 mb-2">{error}</div>}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={saving || !draft}
                    onClick={() => save(m.id, draft)}
                    className="flex-1 bg-purple-600 text-white rounded px-2 py-1 text-xs font-medium disabled:opacity-40"
                  >
                    {saving ? <Loader2 className="h-3 w-3 animate-spin mx-auto" /> : "Mark delivered"}
                  </button>
                  {m.earned_on && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => save(m.id, null)}
                      className="text-xs text-gray-500 hover:text-red-600 px-1"
                      title="Clear the delivered date"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RetainerTerm({ deal }: { deal: CampaignDeal }) {
  const end = endDate(deal);
  if (!deal.term_months && !end) {
    return <span className="text-amber-600 text-xs">Not set</span>;
  }
  const estimate = endDateIsEstimate(deal);
  return (
    <div className="text-xs text-gray-600 leading-tight">
      {deal.term_months ? <div>{deal.term_months} months</div> : null}
      {end ? (
        <div className="text-gray-400" title={estimate ? "Projected from the term. The real end is set when the final content is marked delivered." : "Recorded end date"}>
          ends {end}{estimate ? " (est.)" : ""}
        </div>
      ) : (
        <div className="text-gray-400">ends 30d after final content</div>
      )}
    </div>
  );
}

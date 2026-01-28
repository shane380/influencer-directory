"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Influencer,
  Campaign,
  CampaignDeal,
  Deliverable,
  PaymentStatus,
  PaymentMilestone,
  InfluencerRates,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/constants";
import { Plus, Trash2, Loader2, DollarSign, Check } from "lucide-react";

interface DealDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  influencer: Influencer;
  campaign: Campaign;
  deal: CampaignDeal | null;
}

interface DeliverableRow extends Deliverable {
  id: string;
}

export function DealDialog({
  open,
  onClose,
  onSave,
  influencer,
  campaign,
  deal,
}: DealDialogProps) {
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [paymentTermsType, setPaymentTermsType] = useState<string>("50_50");
  const [paymentMilestones, setPaymentMilestones] = useState<PaymentMilestone[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rates, setRates] = useState<InfluencerRates | null>(null);

  // Autocomplete state
  const [previousDeliverables, setPreviousDeliverables] = useState<string[]>([]);
  const [activeAutocompleteId, setActiveAutocompleteId] = useState<string | null>(null);

  const supabase = createClient();

  // Fetch influencer rates and previous deliverables when dialog opens
  useEffect(() => {
    async function fetchData() {
      if (!open || !influencer) return;

      // Fetch rates
      try {
        const { data: ratesData } = await supabase
          .from("influencer_rates")
          .select("*")
          .eq("influencer_id", influencer.id)
          .single();
        if (ratesData) setRates(ratesData);
      } catch {
        // No rates found
      }

      // Fetch previous deliverables for autocomplete
      const { data: dealsData } = await supabase
        .from("campaign_deals")
        .select("deliverables")
        .order("created_at", { ascending: false })
        .limit(100);

      // Extract unique deliverable descriptions from previous deals
      if (dealsData) {
        const descriptions = new Set<string>();
        dealsData.forEach((deal: { deliverables: Deliverable[] }) => {
          (deal.deliverables || []).forEach((d) => {
            if (d.description) {
              descriptions.add(d.description);
            }
          });
        });
        setPreviousDeliverables(Array.from(descriptions).sort());
      }
    }

    fetchData();
  }, [open, influencer, supabase]);

  // Initialize form from existing deal
  useEffect(() => {
    if (deal) {
      setDeliverables(
        (deal.deliverables || []).map((d, i) => ({
          ...d,
          id: `existing-${i}`,
        }))
      );
      // Load payment terms if they exist
      if (deal.payment_terms && deal.payment_terms.length > 0) {
        setPaymentMilestones(deal.payment_terms);
        // Determine type based on milestones
        if (deal.payment_terms.length === 1 && deal.payment_terms[0].percentage === 100) {
          setPaymentTermsType("100_upfront");
        } else if (deal.payment_terms.length === 2 &&
          deal.payment_terms[0].percentage === 50 &&
          deal.payment_terms[1].percentage === 50) {
          setPaymentTermsType("50_50");
        } else {
          setPaymentTermsType("custom");
        }
      } else {
        setPaymentTermsType("50_50");
        setPaymentMilestones([]);
      }
      setNotes(deal.notes || "");
    } else {
      setDeliverables([]);
      setPaymentTermsType("50_50");
      setPaymentMilestones([]);
      setNotes("");
    }
    setError(null);
  }, [deal, open]);

  const addDeliverable = () => {
    setDeliverables((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        description: "",
        rate: 0,
        quantity: 1,
      },
    ]);
  };

  const updateDeliverable = (
    id: string,
    field: keyof Deliverable,
    value: string | number
  ) => {
    setDeliverables((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        return { ...d, [field]: value };
      })
    );
  };

  const getFilteredSuggestions = (query: string) => {
    if (!query || query.length < 2) return [];
    const lowerQuery = query.toLowerCase();
    return previousDeliverables
      .filter((desc) => desc.toLowerCase().includes(lowerQuery))
      .slice(0, 5);
  };

  const selectSuggestion = (id: string, suggestion: string) => {
    updateDeliverable(id, "description", suggestion);
    setActiveAutocompleteId(null);
  };

  const removeDeliverable = (id: string) => {
    setDeliverables((prev) => prev.filter((d) => d.id !== id));
  };

  const totalDealValue = deliverables.reduce(
    (sum, d) => sum + (d.rate || 0) * (d.quantity || 1),
    0
  );

  // Generate payment milestones based on preset
  const generateMilestones = (type: string, total: number): PaymentMilestone[] => {
    switch (type) {
      case "50_50":
        return [
          { id: "m1", description: "Upon execution", percentage: 50, amount: total * 0.5, is_paid: false, paid_date: null },
          { id: "m2", description: "Content is live", percentage: 50, amount: total * 0.5, is_paid: false, paid_date: null },
        ];
      case "100_upfront":
        return [
          { id: "m1", description: "Upon execution", percentage: 100, amount: total, is_paid: false, paid_date: null },
        ];
      case "custom":
        return paymentMilestones.length > 0 ? paymentMilestones : [];
      default:
        return [];
    }
  };

  // Update milestones when total or type changes
  useEffect(() => {
    if (paymentTermsType !== "custom") {
      setPaymentMilestones(generateMilestones(paymentTermsType, totalDealValue));
    } else if (paymentMilestones.length > 0) {
      // Update amounts for custom milestones based on new total
      setPaymentMilestones((prev) =>
        prev.map((m) => ({ ...m, amount: totalDealValue * (m.percentage / 100) }))
      );
    }
  }, [totalDealValue, paymentTermsType]);

  const addCustomMilestone = () => {
    const newMilestone: PaymentMilestone = {
      id: `custom-${Date.now()}`,
      description: "",
      percentage: 0,
      amount: 0,
      is_paid: false,
      paid_date: null,
    };
    setPaymentMilestones((prev) => [...prev, newMilestone]);
  };

  const updateMilestone = (id: string, field: keyof PaymentMilestone, value: string | number | boolean) => {
    setPaymentMilestones((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        if (field === "percentage") {
          const percentage = Number(value);
          return { ...m, percentage, amount: totalDealValue * (percentage / 100) };
        }
        return { ...m, [field]: value };
      })
    );
  };

  const toggleMilestonePaid = (id: string) => {
    setPaymentMilestones((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        return {
          ...m,
          is_paid: !m.is_paid,
          paid_date: !m.is_paid ? new Date().toISOString().split("T")[0] : null,
        };
      })
    );
  };

  const removeMilestone = (id: string) => {
    setPaymentMilestones((prev) => prev.filter((m) => m.id !== id));
  };

  // Calculate overall payment status from milestones
  const calculatePaymentStatus = (): PaymentStatus => {
    if (paymentMilestones.length === 0) return "not_paid";
    const paidCount = paymentMilestones.filter((m) => m.is_paid).length;
    if (paidCount === 0) return "not_paid";
    if (paidCount === paymentMilestones.length) return "paid_in_full";
    return "deposit_paid";
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);

    try {
      const dealData = {
        campaign_id: campaign.id,
        influencer_id: influencer.id,
        deliverables: deliverables.map(({ description, rate, quantity }) => ({
          description,
          rate,
          quantity,
        })),
        total_deal_value: totalDealValue,
        payment_status: calculatePaymentStatus(),
        payment_terms: paymentMilestones,
        notes: notes || null,
      };

      if (deal) {
        // Update existing deal
        const { error: updateError } = await supabase
          .from("campaign_deals")
          .update(dealData as never)
          .eq("id", deal.id);

        if (updateError) throw updateError;
      } else {
        // Insert new deal
        const { error: insertError } = await supabase
          .from("campaign_deals")
          .insert(dealData as never);

        if (insertError) throw insertError;
      }

      onSave();
      onClose();
    } catch (err: any) {
      console.error("Error saving deal:", err);
      setError(err.message || "Failed to save deal");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deal) return;

    setLoading(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("campaign_deals")
        .delete()
        .eq("id", deal.id);

      if (deleteError) throw deleteError;

      onSave();
      onClose();
    } catch (err: any) {
      console.error("Error deleting deal:", err);
      setError(err.message || "Failed to delete deal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl" style={{ width: "700px" }} onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-purple-600" />
            Deal Details - {influencer.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
          {/* Deliverables Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label className="text-sm font-medium">Deliverables</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addDeliverable}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>

            {deliverables.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center border rounded-lg">
                No deliverables added yet
              </p>
            ) : (
              <div className="space-y-3">
                {deliverables.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1 relative">
                      <Input
                        placeholder="e.g., 1 Reel + 2 Stories, Whitelisting 30 days, UGC Video 60 sec"
                        value={d.description || ""}
                        onChange={(e) => {
                          updateDeliverable(d.id, "description", e.target.value);
                          setActiveAutocompleteId(d.id);
                        }}
                        onFocus={() => setActiveAutocompleteId(d.id)}
                        onBlur={() => setTimeout(() => setActiveAutocompleteId(null), 200)}
                        className="h-9"
                      />
                      {activeAutocompleteId === d.id && getFilteredSuggestions(d.description || "").length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                          {getFilteredSuggestions(d.description || "").map((suggestion, idx) => (
                            <button
                              key={idx}
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 truncate"
                              onMouseDown={() => selectSuggestion(d.id, suggestion)}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="w-24">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                          $
                        </span>
                        <Input
                          type="number"
                          min="0"
                          placeholder="Rate"
                          value={d.rate || ""}
                          onChange={(e) =>
                            updateDeliverable(
                              d.id,
                              "rate",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          className="h-9 pl-5"
                        />
                      </div>
                    </div>

                    <div className="w-16">
                      <Input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={d.quantity || 1}
                        onChange={(e) =>
                          updateDeliverable(
                            d.id,
                            "quantity",
                            parseInt(e.target.value) || 1
                          )
                        }
                        className="h-9"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 p-0 text-red-500 hover:text-red-700 flex-shrink-0"
                      onClick={() => removeDeliverable(d.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                <div className="flex justify-end pt-2 border-t">
                  <div className="text-right">
                    <span className="text-sm text-gray-500">Total:</span>
                    <span className="ml-2 text-lg font-semibold">
                      {formatCurrency(totalDealValue)} USD
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Payment Terms Section */}
          <div className="border-t pt-4">
            <Label className="text-sm font-medium mb-3 block">Payment Terms</Label>

            {/* Preset Options */}
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => setPaymentTermsType("50_50")}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  paymentTermsType === "50_50"
                    ? "bg-purple-100 border-purple-300 text-purple-800"
                    : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                50% / 50%
              </button>
              <button
                type="button"
                onClick={() => setPaymentTermsType("100_upfront")}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  paymentTermsType === "100_upfront"
                    ? "bg-purple-100 border-purple-300 text-purple-800"
                    : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                100% Upfront
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentTermsType("custom");
                  if (paymentMilestones.length === 0) {
                    addCustomMilestone();
                  }
                }}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                  paymentTermsType === "custom"
                    ? "bg-purple-100 border-purple-300 text-purple-800"
                    : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                }`}
              >
                Custom
              </button>
            </div>

            {/* Payment Milestones */}
            <div className="space-y-2">
              {paymentMilestones.map((milestone) => (
                <div
                  key={milestone.id}
                  className={`flex items-center gap-2 p-3 rounded-lg ${
                    milestone.is_paid ? "bg-green-50 border border-green-200" : "bg-gray-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleMilestonePaid(milestone.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      milestone.is_paid
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-gray-300 hover:border-gray-400"
                    }`}
                  >
                    {milestone.is_paid && <Check className="h-4 w-4" />}
                  </button>

                  {paymentTermsType === "custom" ? (
                    <>
                      <Input
                        placeholder="Description (e.g., Upon signing)"
                        value={milestone.description}
                        onChange={(e) => updateMilestone(milestone.id, "description", e.target.value)}
                        className="flex-1 h-8"
                      />
                      <div className="w-20">
                        <div className="relative">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="%"
                            value={milestone.percentage || ""}
                            onChange={(e) => updateMilestone(milestone.id, "percentage", parseFloat(e.target.value) || 0)}
                            className="h-8 pr-6"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1">
                      <span className={`text-sm ${milestone.is_paid ? "line-through text-gray-500" : ""}`}>
                        {milestone.description}
                      </span>
                      <span className="text-xs text-gray-500 ml-2">({milestone.percentage}%)</span>
                    </div>
                  )}

                  <div className="text-sm font-medium w-24 text-right">
                    {formatCurrency(milestone.amount)}
                  </div>

                  {milestone.is_paid && milestone.paid_date && (
                    <Input
                      type="date"
                      value={milestone.paid_date}
                      onChange={(e) => updateMilestone(milestone.id, "paid_date", e.target.value)}
                      className="w-32 h-8 text-xs"
                    />
                  )}

                  {paymentTermsType === "custom" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      onClick={() => removeMilestone(milestone.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}

              {paymentTermsType === "custom" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addCustomMilestone}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Payment Milestone
                </Button>
              )}
            </div>

            {/* Total percentage check for custom */}
            {paymentTermsType === "custom" && paymentMilestones.length > 0 && (
              <div className="mt-2 text-xs">
                {(() => {
                  const totalPercentage = paymentMilestones.reduce((sum, m) => sum + m.percentage, 0);
                  if (totalPercentage !== 100) {
                    return (
                      <span className="text-amber-600">
                        Total: {totalPercentage}% (should equal 100%)
                      </span>
                    );
                  }
                  return <span className="text-green-600">Total: 100%</span>;
                })()}
              </div>
            )}
          </div>

          {/* Notes Section */}
          <div className="border-t pt-4">
            <Label htmlFor="deal_notes" className="text-sm font-medium mb-2 block">
              Notes
            </Label>
            <Textarea
              id="deal_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Payment terms, special conditions, etc..."
              rows={2}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="gap-2 mt-4">
          {deal && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              Delete Deal
            </Button>
          )}
          <div className="flex-1" />
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Deal"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

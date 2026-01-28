"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Influencer,
  Campaign,
  CampaignDeal,
  Deliverable,
  PaymentStatus,
  InfluencerRates,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  formatCurrency,
  paymentStatusLabels,
  paymentStatuses,
  paymentStatusColors,
} from "@/lib/constants";
import { Plus, Trash2, Loader2, DollarSign } from "lucide-react";

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
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("not_paid");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPaidDate, setDepositPaidDate] = useState("");
  const [finalPaidDate, setFinalPaidDate] = useState("");
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
      setPaymentStatus(deal.payment_status);
      setDepositAmount(deal.deposit_amount?.toString() || "");
      setDepositPaidDate(deal.deposit_paid_date?.split("T")[0] || "");
      setFinalPaidDate(deal.final_paid_date?.split("T")[0] || "");
      setNotes(deal.notes || "");
    } else {
      setDeliverables([]);
      setPaymentStatus("not_paid");
      setDepositAmount("");
      setDepositPaidDate("");
      setFinalPaidDate("");
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
        payment_status: paymentStatus,
        deposit_amount: depositAmount ? parseFloat(depositAmount) : null,
        deposit_paid_date: depositPaidDate || null,
        final_paid_date: finalPaidDate || null,
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
                      {formatCurrency(totalDealValue)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Payment Section */}
          <div className="border-t pt-4">
            <Label className="text-sm font-medium mb-3 block">Payment</Label>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="payment_status" className="text-xs text-gray-500">
                  Status
                </Label>
                <Select
                  id="payment_status"
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                >
                  {paymentStatuses.map((status) => (
                    <option key={status} value={status}>
                      {paymentStatusLabels[status]}
                    </option>
                  ))}
                </Select>
              </div>

              {(paymentStatus === "deposit_paid" || paymentStatus === "paid_on_post") && (
                <div className="space-y-2">
                  <Label htmlFor="deposit_amount" className="text-xs text-gray-500">
                    Deposit Amount
                  </Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                      $
                    </span>
                    <Input
                      id="deposit_amount"
                      type="number"
                      min="0"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder="0"
                      className="pl-7"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              {(paymentStatus === "deposit_paid" ||
                paymentStatus === "paid_on_post" ||
                paymentStatus === "paid_in_full") && (
                <div className="space-y-2">
                  <Label htmlFor="deposit_paid_date" className="text-xs text-gray-500">
                    {paymentStatus === "paid_in_full" ? "Payment Date" : "Deposit Paid Date"}
                  </Label>
                  <Input
                    id="deposit_paid_date"
                    type="date"
                    value={depositPaidDate}
                    onChange={(e) => setDepositPaidDate(e.target.value)}
                  />
                </div>
              )}

              {paymentStatus === "paid_in_full" && (
                <div className="space-y-2">
                  <Label htmlFor="final_paid_date" className="text-xs text-gray-500">
                    Final Payment Date
                  </Label>
                  <Input
                    id="final_paid_date"
                    type="date"
                    value={finalPaidDate}
                    onChange={(e) => setFinalPaidDate(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="mt-4">
              <Badge className={paymentStatusColors[paymentStatus]}>
                {paymentStatusLabels[paymentStatus]}
              </Badge>
            </div>
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

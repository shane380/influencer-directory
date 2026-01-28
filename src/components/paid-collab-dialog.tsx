"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Influencer,
  InfluencerInsert,
  Campaign,
  Deliverable,
  DeliverableType,
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
  deliverableTypeLabels,
  deliverableTypes,
  paymentStatusLabels,
  paymentStatuses,
  paymentStatusColors,
} from "@/lib/constants";
import { Plus, Trash2, Loader2, DollarSign, Search, Check, AlertCircle } from "lucide-react";
import Image from "next/image";

interface PaidCollabDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

interface DeliverableRow extends Deliverable {
  id: string;
}

export function PaidCollabDialog({
  open,
  onClose,
  onSave,
}: PaidCollabDialogProps) {
  // Selection state
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [influencerSearch, setInfluencerSearch] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  // Instagram lookup state
  const [instagramHandle, setInstagramHandle] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Influencer | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Deal state
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("not_paid");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositPaidDate, setDepositPaidDate] = useState("");
  const [finalPaidDate, setFinalPaidDate] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rates, setRates] = useState<InfluencerRates | null>(null);

  const supabase = createClient();

  // Fetch current user
  useEffect(() => {
    async function fetchCurrentUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    }
    if (open) {
      fetchCurrentUser();
    }
  }, [open, supabase]);

  // Fetch influencers and campaigns when dialog opens
  useEffect(() => {
    async function fetchData() {
      if (!open) return;
      setLoadingData(true);

      const [influencersRes, campaignsRes] = await Promise.all([
        supabase
          .from("influencers")
          .select("*")
          .order("name"),
        supabase
          .from("campaigns")
          .select("*")
          .in("status", ["planning", "active"])
          .order("created_at", { ascending: false }),
      ]);

      if (influencersRes.data) setInfluencers(influencersRes.data);
      if (campaignsRes.data) setCampaigns(campaignsRes.data);
      setLoadingData(false);
    }

    fetchData();
  }, [open, supabase]);

  // Fetch influencer rates when influencer is selected
  useEffect(() => {
    async function fetchRates() {
      if (!selectedInfluencer) {
        setRates(null);
        return;
      }

      try {
        const { data } = await supabase
          .from("influencer_rates")
          .select("*")
          .eq("influencer_id", selectedInfluencer.id)
          .single();

        setRates(data);
      } catch {
        setRates(null);
      }
    }

    fetchRates();
  }, [selectedInfluencer, supabase]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedInfluencer(null);
      setSelectedCampaign(null);
      setInfluencerSearch("");
      setInstagramHandle("");
      setDuplicateWarning(null);
      setDeliverables([]);
      setPaymentStatus("not_paid");
      setDepositAmount("");
      setDepositPaidDate("");
      setFinalPaidDate("");
      setNotes("");
      setError(null);
      setRates(null);
    }
  }, [open]);

  // Filter influencers based on search
  const filteredInfluencers = useMemo(() => {
    if (!influencerSearch) return influencers.slice(0, 50);
    const searchLower = influencerSearch.toLowerCase();
    return influencers
      .filter(
        (inf) =>
          inf.name.toLowerCase().includes(searchLower) ||
          inf.instagram_handle.toLowerCase().includes(searchLower)
      )
      .slice(0, 50);
  }, [influencers, influencerSearch]);

  const checkForDuplicate = async (handle: string): Promise<Influencer | null> => {
    const cleanHandle = handle.replace("@", "").toLowerCase().trim();
    const { data } = await supabase
      .from("influencers")
      .select("*")
      .ilike("instagram_handle", cleanHandle)
      .limit(1);
    return data && data.length > 0 ? data[0] : null;
  };

  const handleInstagramLookup = async () => {
    if (!instagramHandle.trim()) return;

    setLookingUp(true);
    setError(null);
    setDuplicateWarning(null);

    try {
      // First check if this influencer already exists
      const existingInfluencer = await checkForDuplicate(instagramHandle);

      if (existingInfluencer) {
        setDuplicateWarning(existingInfluencer);
        setLookingUp(false);
        return;
      }

      // If not, fetch from Instagram API
      const response = await fetch(`/api/instagram?handle=${encodeURIComponent(instagramHandle)}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch Instagram profile");
      }

      const profile = await response.json();

      // Download and upload photo
      let photoUrl: string | null = null;
      if (profile.profile_pic_url) {
        try {
          const photoResponse = await fetch(`/api/instagram/photo?url=${encodeURIComponent(profile.profile_pic_url)}`);
          if (photoResponse.ok) {
            const photoBlob = await photoResponse.blob();
            const fileName = `${profile.username}-${Date.now()}.jpg`;
            const { error: uploadError } = await supabase.storage
              .from("profile-photos")
              .upload(fileName, photoBlob, { contentType: "image/jpeg" });
            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from("profile-photos")
                .getPublicUrl(fileName);
              photoUrl = urlData.publicUrl;
            }
          }
        } catch {
          photoUrl = profile.profile_pic_url;
        }
      }

      // Create new influencer with paid partnership type
      const newInfluencerData: InfluencerInsert = {
        name: profile.full_name || profile.username,
        instagram_handle: profile.username,
        profile_photo_url: photoUrl,
        follower_count: profile.follower_count,
        tier: "C",
        partnership_type: "paid",
        relationship_status: "prospect",
        created_by: currentUserId,
        assigned_to: currentUserId,
      };

      const insertResult = await (supabase
        .from("influencers") as any)
        .insert(newInfluencerData)
        .select()
        .single();

      if (insertResult.error) throw insertResult.error;

      const newInfluencer = insertResult.data as Influencer;

      // Update local state and select the new influencer
      setInfluencers((prev) => [...prev, newInfluencer]);
      setSelectedInfluencer(newInfluencer);
      setInstagramHandle("");
    } catch (err: any) {
      setError(err.message || "Failed to add influencer");
    } finally {
      setLookingUp(false);
    }
  };

  const handleSelectDuplicate = () => {
    if (duplicateWarning) {
      setSelectedInfluencer(duplicateWarning);
      setDuplicateWarning(null);
      setInstagramHandle("");
    }
  };

  const addDeliverable = () => {
    setDeliverables((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        type: "ugc" as DeliverableType,
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

        // If changing type, auto-fill rate from influencer rates
        if (field === "type" && rates) {
          const type = value as DeliverableType;
          let autoRate = d.rate;
          if (type === "ugc" && rates.ugc_rate) autoRate = rates.ugc_rate;
          if (type === "collab_post" && rates.collab_post_rate) autoRate = rates.collab_post_rate;
          if (type === "organic_post" && rates.organic_post_rate) autoRate = rates.organic_post_rate;
          if (type === "whitelisting" && rates.whitelisting_rate) autoRate = rates.whitelisting_rate;
          return { ...d, type, rate: autoRate };
        }

        return { ...d, [field]: value };
      })
    );
  };

  const removeDeliverable = (id: string) => {
    setDeliverables((prev) => prev.filter((d) => d.id !== id));
  };

  const totalDealValue = deliverables.reduce(
    (sum, d) => sum + (d.rate || 0) * (d.quantity || 1),
    0
  );

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const handleSave = async () => {
    if (!selectedInfluencer || !selectedCampaign) {
      setError("Please select an influencer and campaign");
      return;
    }

    if (deliverables.length === 0) {
      setError("Please add at least one deliverable");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // First, check if influencer is already in this campaign
      const { data: existingEntry } = await (supabase
        .from("campaign_influencers") as any)
        .select("id, partnership_type")
        .eq("campaign_id", selectedCampaign.id)
        .eq("influencer_id", selectedInfluencer.id)
        .single();

      if (existingEntry) {
        // Update partnership type to paid if not already
        if (existingEntry.partnership_type !== "paid") {
          await (supabase
            .from("campaign_influencers") as any)
            .update({ partnership_type: "paid" })
            .eq("id", existingEntry.id);
        }
      } else {
        // Add influencer to campaign with paid partnership type
        const { error: insertError } = await (supabase
          .from("campaign_influencers") as any)
          .insert({
            campaign_id: selectedCampaign.id,
            influencer_id: selectedInfluencer.id,
            partnership_type: "paid",
            status: "prospect",
          });

        if (insertError) throw insertError;
      }

      // Check if deal already exists
      const { data: existingDeal } = await supabase
        .from("campaign_deals")
        .select("id")
        .eq("campaign_id", selectedCampaign.id)
        .eq("influencer_id", selectedInfluencer.id)
        .single();

      if (existingDeal) {
        setError("A deal already exists for this influencer in this campaign");
        setLoading(false);
        return;
      }

      // Create the deal
      const dealData = {
        campaign_id: selectedCampaign.id,
        influencer_id: selectedInfluencer.id,
        deliverables: deliverables.map(({ type, rate, quantity, description }) => ({
          type,
          rate,
          quantity,
          ...(description && { description }),
        })),
        total_deal_value: totalDealValue,
        payment_status: paymentStatus,
        deposit_amount: depositAmount ? parseFloat(depositAmount) : null,
        deposit_paid_date: depositPaidDate || null,
        final_paid_date: finalPaidDate || null,
        notes: notes || null,
      };

      const { error: dealError } = await supabase
        .from("campaign_deals")
        .insert(dealData as never);

      if (dealError) throw dealError;

      onSave();
      onClose();
    } catch (err: any) {
      console.error("Error creating paid collab:", err);
      setError(err.message || "Failed to create paid collab");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl" style={{ width: "700px" }} onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            New Paid Collaboration
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {loadingData ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Step 1: Select Influencer */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  1. Select Influencer
                </Label>
                {selectedInfluencer ? (
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="w-10 h-10 flex-shrink-0">
                      {selectedInfluencer.profile_photo_url ? (
                        <Image
                          src={selectedInfluencer.profile_photo_url}
                          alt={selectedInfluencer.name}
                          width={40}
                          height={40}
                          className="rounded-full object-cover w-full h-full"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-gray-500 text-sm font-medium">
                            {selectedInfluencer.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{selectedInfluencer.name}</p>
                      <p className="text-sm text-gray-500">@{selectedInfluencer.instagram_handle}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedInfluencer(null)}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="border rounded-lg">
                    {/* Search existing influencers */}
                    <div className="p-2 border-b">
                      <Label className="text-xs text-gray-500 mb-1 block">Search Existing</Label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search by name or handle..."
                          value={influencerSearch}
                          onChange={(e) => setInfluencerSearch(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {filteredInfluencers.length === 0 ? (
                        <p className="p-4 text-center text-gray-500 text-sm">
                          No influencers found
                        </p>
                      ) : (
                        filteredInfluencers.map((inf) => (
                          <button
                            key={inf.id}
                            className="w-full flex items-center gap-3 p-2 hover:bg-gray-50 transition-colors text-left border-b last:border-b-0"
                            onClick={() => setSelectedInfluencer(inf)}
                          >
                            <div className="w-8 h-8 flex-shrink-0">
                              {inf.profile_photo_url ? (
                                <Image
                                  src={inf.profile_photo_url}
                                  alt={inf.name}
                                  width={32}
                                  height={32}
                                  className="rounded-full object-cover w-full h-full"
                                  unoptimized
                                />
                              ) : (
                                <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center">
                                  <span className="text-gray-500 text-xs font-medium">
                                    {inf.name.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{inf.name}</p>
                              <p className="text-xs text-gray-500 truncate">@{inf.instagram_handle} · {formatNumber(inf.follower_count)}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    {/* Add new from Instagram */}
                    <div className="p-3 border-t bg-gray-50">
                      <Label className="text-xs text-gray-500 mb-2 block">Or Add New from Instagram</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">@</span>
                          <Input
                            placeholder="instagram_handle"
                            value={instagramHandle}
                            onChange={(e) => {
                              setInstagramHandle(e.target.value.replace("@", ""));
                              setDuplicateWarning(null);
                            }}
                            className="pl-8"
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={handleInstagramLookup}
                          disabled={lookingUp || !instagramHandle.trim()}
                        >
                          {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          <span className="ml-1">Add</span>
                        </Button>
                      </div>

                      {duplicateWarning && (
                        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-yellow-800">
                                This influencer already exists
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                {duplicateWarning.profile_photo_url && (
                                  <Image
                                    src={duplicateWarning.profile_photo_url}
                                    alt={duplicateWarning.name}
                                    width={32}
                                    height={32}
                                    className="rounded-full"
                                    unoptimized
                                  />
                                )}
                                <span className="text-sm">{duplicateWarning.name} (@{duplicateWarning.instagram_handle})</span>
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                className="mt-2"
                                onClick={handleSelectDuplicate}
                              >
                                Select This Influencer
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 2: Select Campaign */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  2. Select Campaign
                </Label>
                <Select
                  value={selectedCampaign?.id || ""}
                  onChange={(e) => {
                    const campaign = campaigns.find((c) => c.id === e.target.value);
                    setSelectedCampaign(campaign || null);
                  }}
                >
                  <option value="">Select a campaign...</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </option>
                  ))}
                </Select>
                {campaigns.length === 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    No active campaigns. Create a campaign first.
                  </p>
                )}
              </div>

              {/* Step 3: Define Deal */}
              {selectedInfluencer && selectedCampaign && (
                <>
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-medium">3. Define Deliverables</Label>
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
                        No deliverables added yet. Click "Add" to define what the influencer will deliver.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {deliverables.map((d) => (
                          <div
                            key={d.id}
                            className="grid grid-cols-[1fr,100px,60px,auto] gap-2 items-end p-3 bg-gray-50 rounded-lg"
                          >
                            <div>
                              <Label className="text-xs text-gray-500">Type</Label>
                              <Select
                                value={d.type}
                                onChange={(e) =>
                                  updateDeliverable(d.id, "type", e.target.value)
                                }
                                className="h-9"
                              >
                                {deliverableTypes.map((type) => (
                                  <option key={type} value={type}>
                                    {deliverableTypeLabels[type]}
                                  </option>
                                ))}
                              </Select>
                            </div>

                            <div>
                              <Label className="text-xs text-gray-500">Rate</Label>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                                  $
                                </span>
                                <Input
                                  type="number"
                                  min="0"
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

                            <div>
                              <Label className="text-xs text-gray-500">Qty</Label>
                              <Input
                                type="number"
                                min="1"
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
                              className="h-9 w-9 p-0 text-red-500 hover:text-red-700"
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

                    {rates && (
                      <p className="text-xs text-gray-400 mt-2">
                        Rate card: UGC {rates.ugc_rate ? formatCurrency(rates.ugc_rate) : "-"} |
                        Collab {rates.collab_post_rate ? formatCurrency(rates.collab_post_rate) : "-"} |
                        Organic {rates.organic_post_rate ? formatCurrency(rates.organic_post_rate) : "-"} |
                        Whitelisting {rates.whitelisting_rate ? formatCurrency(rates.whitelisting_rate) : "-"}
                      </p>
                    )}
                  </div>

                  {/* Payment Section */}
                  <div className="border-t pt-4">
                    <Label className="text-sm font-medium mb-3 block">4. Payment Status</Label>

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
                  </div>

                  {/* Notes Section */}
                  <div className="border-t pt-4">
                    <Label htmlFor="deal_notes" className="text-sm font-medium mb-2 block">
                      Notes (Optional)
                    </Label>
                    <Textarea
                      id="deal_notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Payment terms, special conditions, etc..."
                      rows={2}
                    />
                  </div>
                </>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </>
          )}
        </div>

        <DialogFooter className="gap-2 mt-4 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || !selectedInfluencer || !selectedCampaign || deliverables.length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Create Paid Collab
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

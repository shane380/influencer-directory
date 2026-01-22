"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Campaign,
  CampaignInsert,
  CampaignStatus,
  Influencer,
  InfluencerInsert,
  CampaignInfluencer,
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
import { Plus, X, Search, Loader2, AlertCircle } from "lucide-react";
import Image from "next/image";

interface CampaignDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  campaign: Campaign | null;
}

interface CampaignInfluencerWithDetails extends CampaignInfluencer {
  influencer: Influencer;
}

const statusColors: Record<CampaignStatus, string> = {
  planning: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
};

const initialFormData: CampaignInsert = {
  name: "",
  description: null,
  start_date: null,
  end_date: null,
  status: "planning",
  collection_deck_url: null,
};

export function CampaignDialog({
  open,
  onClose,
  onSave,
  campaign,
}: CampaignDialogProps) {
  const [formData, setFormData] = useState<CampaignInsert>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campaignInfluencers, setCampaignInfluencers] = useState<CampaignInfluencerWithDetails[]>([]);
  const [allInfluencers, setAllInfluencers] = useState<Influencer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showInfluencerSearch, setShowInfluencerSearch] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [instagramHandle, setInstagramHandle] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<Influencer | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const supabase = createClient();

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

  useEffect(() => {
    if (open) {
      fetchAllInfluencers();
      if (campaign) {
        setFormData({
          name: campaign.name,
          description: campaign.description,
          start_date: campaign.start_date,
          end_date: campaign.end_date,
          status: campaign.status,
          collection_deck_url: campaign.collection_deck_url,
        });
        fetchCampaignInfluencers(campaign.id);
      } else {
        setFormData(initialFormData);
        setCampaignInfluencers([]);
      }
      setError(null);
      setSearchQuery("");
      setShowInfluencerSearch(false);
      setDuplicateWarning(null);
    }
  }, [campaign, open]);

  const fetchAllInfluencers = async () => {
    const { data } = await supabase
      .from("influencers")
      .select("*")
      .order("name");
    setAllInfluencers(data || []);
  };

  const fetchCampaignInfluencers = async (campaignId: string) => {
    const { data } = await supabase
      .from("campaign_influencers")
      .select("*, influencer:influencers(*)")
      .eq("campaign_id", campaignId);
    setCampaignInfluencers(data || []);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value || null,
    }));
  };

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

      // Create new influencer
      const newInfluencerData: InfluencerInsert = {
        name: profile.full_name || profile.username,
        instagram_handle: profile.username,
        profile_photo_url: photoUrl,
        follower_count: profile.follower_count,
        tier: "C",
        partnership_type: "gifted_no_ask",
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

      // Add to campaign if we have a campaign ID
      if (campaign && newInfluencer) {
        await addInfluencerToCampaign(newInfluencer);
      } else if (newInfluencer) {
        // Add to local state for new campaigns
        setCampaignInfluencers((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            campaign_id: "",
            influencer_id: newInfluencer.id,
            compensation: null,
            notes: null,
            added_at: new Date().toISOString(),
            status: "prospect",
            partnership_type: newInfluencer.partnership_type,
            shopify_order_id: null,
            shopify_order_status: null,
            product_selections: null,
            content_posted: "none",
            approval_status: null,
            approval_note: null,
            approved_at: null,
            approved_by: null,
            influencer: newInfluencer,
          },
        ]);
      }

      setInstagramHandle("");
      setShowInfluencerSearch(false);
      fetchAllInfluencers();
    } catch (err: any) {
      setError(err.message || "Failed to add influencer");
    } finally {
      setLookingUp(false);
    }
  };

  const addInfluencerToCampaign = async (influencer: Influencer) => {
    // Check if already added
    if (campaignInfluencers.some((ci) => ci.influencer_id === influencer.id)) {
      setError("This influencer is already in this campaign");
      return;
    }

    // Look up the most recent campaign participation to get their last partnership_type
    const { data: lastCampaignData } = await (supabase
      .from("campaign_influencers") as any)
      .select("partnership_type")
      .eq("influencer_id", influencer.id)
      .order("added_at", { ascending: false })
      .limit(1);

    // Use last partnership type from campaigns, or fall back to influencer's global partnership_type
    const partnershipType = lastCampaignData && lastCampaignData.length > 0
      ? lastCampaignData[0].partnership_type
      : influencer.partnership_type;

    if (campaign) {
      const insertResult = await (supabase
        .from("campaign_influencers") as any)
        .insert({
          campaign_id: campaign.id,
          influencer_id: influencer.id,
          partnership_type: partnershipType,
        })
        .select("*, influencer:influencers(*)")
        .single();

      if (insertResult.error) {
        setError(insertResult.error.message);
        return;
      }

      setCampaignInfluencers((prev) => [...prev, insertResult.data as CampaignInfluencerWithDetails]);
    } else {
      // For new campaigns, just add to local state
      setCampaignInfluencers((prev) => [
        ...prev,
        {
          id: `temp-${Date.now()}`,
          campaign_id: "",
          influencer_id: influencer.id,
          compensation: null,
          notes: null,
          added_at: new Date().toISOString(),
          status: "prospect",
          partnership_type: partnershipType,
          shopify_order_id: null,
          shopify_order_status: null,
          product_selections: null,
          content_posted: "none",
          approval_status: null,
          approval_note: null,
          approved_at: null,
          approved_by: null,
          influencer,
        },
      ]);
    }

    setSearchQuery("");
    setShowInfluencerSearch(false);
    setDuplicateWarning(null);
  };

  const removeInfluencerFromCampaign = async (campaignInfluencerId: string) => {
    if (campaign && !campaignInfluencerId.startsWith("temp-")) {
      await supabase
        .from("campaign_influencers")
        .delete()
        .eq("id", campaignInfluencerId);
    }

    setCampaignInfluencers((prev) =>
      prev.filter((ci) => ci.id !== campaignInfluencerId)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      let campaignId = campaign?.id;

      if (campaign) {
        const updateResult = await (supabase
          .from("campaigns") as any)
          .update(formData)
          .eq("id", campaign.id);
        if (updateResult.error) throw updateResult.error;
      } else {
        const insertResult = await (supabase
          .from("campaigns") as any)
          .insert(formData)
          .select()
          .single();
        if (insertResult.error) throw insertResult.error;
        const newCampaign = insertResult.data as Campaign;
        campaignId = newCampaign.id;

        // Add influencers to the new campaign
        if (campaignInfluencers.length > 0 && campaignId) {
          const influencerInserts = campaignInfluencers.map((ci) => ({
            campaign_id: campaignId,
            influencer_id: ci.influencer_id,
          }));

          const linkResult = await (supabase
            .from("campaign_influencers") as any)
            .insert(influencerInserts);

          if (linkResult.error) throw linkResult.error;
        }
      }

      onSave();
    } catch (err: any) {
      setError(err.message || "Failed to save campaign");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!campaign || !confirm("Are you sure you want to delete this campaign?")) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("campaigns")
        .delete()
        .eq("id", campaign.id);
      if (error) throw error;
      onSave();
    } catch (err: any) {
      setError(err.message || "Failed to delete campaign");
    } finally {
      setLoading(false);
    }
  };

  const filteredInfluencers = allInfluencers.filter((inf) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      inf.name.toLowerCase().includes(query) ||
      inf.instagram_handle.toLowerCase().includes(query)
    );
  });

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>
            {campaign ? "Edit Campaign" : "Create New Campaign"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Campaign Name *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                name="status"
                value={formData.status || "planning"}
                onChange={handleChange}
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                name="start_date"
                type="date"
                value={formData.start_date || ""}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                name="end_date"
                type="date"
                value={formData.end_date || ""}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description || ""}
              onChange={handleChange}
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="collection_deck_url">Collection Deck URL</Label>
            <Input
              id="collection_deck_url"
              name="collection_deck_url"
              type="url"
              placeholder="https://..."
              value={formData.collection_deck_url || ""}
              onChange={handleChange}
            />
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Influencers ({campaignInfluencers.length})</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowInfluencerSearch(!showInfluencerSearch)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Influencer
              </Button>
            </div>

            {showInfluencerSearch && (
              <div className="bg-gray-50 p-4 rounded-lg mb-4 space-y-4">
                <div className="space-y-2">
                  <Label>Search Existing Influencers</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search by name or handle..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  {searchQuery && (
                    <div className="max-h-40 overflow-y-auto border rounded-md bg-white">
                      {filteredInfluencers.length === 0 ? (
                        <p className="p-3 text-sm text-gray-500">No influencers found</p>
                      ) : (
                        filteredInfluencers.slice(0, 5).map((inf) => (
                          <button
                            key={inf.id}
                            type="button"
                            className="w-full p-2 flex items-center gap-3 hover:bg-gray-50 border-b last:border-b-0"
                            onClick={() => addInfluencerToCampaign(inf)}
                          >
                            {inf.profile_photo_url ? (
                              <Image
                                src={inf.profile_photo_url}
                                alt={inf.name}
                                width={32}
                                height={32}
                                className="rounded-full"
                                unoptimized
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs">
                                {inf.name.charAt(0)}
                              </div>
                            )}
                            <div className="text-left">
                              <p className="text-sm font-medium">{inf.name}</p>
                              <p className="text-xs text-gray-500">@{inf.instagram_handle} · {formatNumber(inf.follower_count)}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <Label>Or Add New from Instagram</Label>
                  <div className="flex gap-2 mt-2">
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
                            This influencer already exists in your directory
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
                            onClick={() => {
                              addInfluencerToCampaign(duplicateWarning);
                              setInstagramHandle("");
                            }}
                          >
                            Add Existing to Campaign
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {campaignInfluencers.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">
                No influencers added yet
              </p>
            ) : (
              <div className="space-y-2">
                {campaignInfluencers.map((ci) => (
                  <div
                    key={ci.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {ci.influencer.profile_photo_url ? (
                        <Image
                          src={ci.influencer.profile_photo_url}
                          alt={ci.influencer.name}
                          width={40}
                          height={40}
                          className="rounded-full"
                          unoptimized
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                          {ci.influencer.name.charAt(0)}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{ci.influencer.name}</p>
                        <p className="text-sm text-gray-500">
                          @{ci.influencer.instagram_handle} · {formatNumber(ci.influencer.follower_count)} followers
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeInfluencerFromCampaign(ci.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter className="gap-2">
            {campaign && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
              >
                Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : campaign ? "Update" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Influencer,
  InfluencerInsert,
  WhitelistingType,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Loader2, Share2, Search, Check, AlertCircle } from "lucide-react";
import Image from "next/image";

interface WhitelistingDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function WhitelistingDialog({
  open,
  onClose,
  onSave,
}: WhitelistingDialogProps) {
  // Selection state
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [influencerSearch, setInfluencerSearch] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  // Instagram lookup state
  const [instagramHandle, setInstagramHandle] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<Influencer | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Whitelisting config
  const [whitelistingType, setWhitelistingType] = useState<WhitelistingType>("gifted");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Fetch influencers when dialog opens
  useEffect(() => {
    async function fetchData() {
      if (!open) return;
      setLoadingData(true);

      const { data } = await supabase
        .from("influencers")
        .select("*")
        .order("name");

      if (data) setInfluencers(data);
      setLoadingData(false);
    }

    fetchData();
  }, [open, supabase]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedInfluencer(null);
      setInfluencerSearch("");
      setInstagramHandle("");
      setDuplicateWarning(null);
      setWhitelistingType("gifted");
      setError(null);
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

      // Create new influencer with whitelisting enabled
      const newInfluencerData: InfluencerInsert = {
        name: profile.full_name || profile.username,
        instagram_handle: profile.username,
        profile_photo_url: photoUrl,
        follower_count: profile.follower_count,
        tier: "C",
        partnership_type: "unassigned",
        relationship_status: "prospect",
        whitelisting_enabled: true,
        whitelisting_type: whitelistingType,
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

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const handleSave = async () => {
    if (!selectedInfluencer) {
      setError("Please select an influencer");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Update the influencer to enable whitelisting
      const { error: updateError } = await (supabase
        .from("influencers") as any)
        .update({
          whitelisting_enabled: true,
          whitelisting_type: whitelistingType,
        })
        .eq("id", selectedInfluencer.id);

      if (updateError) throw updateError;

      onSave();
      onClose();
    } catch (err: any) {
      console.error("Error enabling whitelisting:", err);
      setError(err.message || "Failed to enable whitelisting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl" style={{ width: "600px" }} onClose={onClose}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-purple-600" />
            Add Whitelisting Influencer
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
                              <p className="text-xs text-gray-500 truncate">
                                @{inf.instagram_handle} · {formatNumber(inf.follower_count)}
                                {inf.whitelisting_enabled && (
                                  <span className="ml-2 text-purple-600">(Already whitelisting)</span>
                                )}
                              </p>
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

              {/* Step 2: Whitelisting Type */}
              {selectedInfluencer && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">
                    2. Whitelisting Type
                  </Label>
                  <Select
                    value={whitelistingType}
                    onChange={(e) => setWhitelistingType(e.target.value as WhitelistingType)}
                  >
                    <option value="gifted">Gifted (Product/Gift Card)</option>
                    <option value="paid">Paid</option>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    How will the influencer be compensated for whitelisting rights?
                  </p>
                </div>
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
            disabled={loading || !selectedInfluencer}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Add to Whitelisting
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

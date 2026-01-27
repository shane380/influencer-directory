"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Influencer,
  InfluencerInsert,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Loader2, AlertCircle, Plus } from "lucide-react";
import Image from "next/image";

interface AddInfluencerDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: () => void;
  campaignId: string;
  existingInfluencerIds: string[];
}

export function AddInfluencerDialog({
  open,
  onClose,
  onAdd,
  campaignId,
  existingInfluencerIds,
}: AddInfluencerDialogProps) {
  const [allInfluencers, setAllInfluencers] = useState<Influencer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [instagramHandle, setInstagramHandle] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<Influencer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [instagramPreview, setInstagramPreview] = useState<{
    username: string;
    full_name: string;
    profile_pic_url: string | null;
    follower_count: number;
  } | null>(null);
  const [requiresApproval, setRequiresApproval] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (open) {
      fetchAllInfluencers();
      fetchCurrentUser();
      setSearchQuery("");
      setInstagramHandle("");
      setDuplicateWarning(null);
      setError(null);
      setInstagramPreview(null);
      setRequiresApproval(false);
    }
  }, [open]);

  const fetchCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
    }
  };

  const fetchAllInfluencers = async () => {
    const { data } = await supabase
      .from("influencers")
      .select("*")
      .order("name");
    setAllInfluencers(data || []);
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

  // Extract username from Instagram URL or clean up handle input
  const parseInstagramInput = (input: string): string => {
    const trimmed = input.trim();

    // Check if it's a URL
    const urlPatterns = [
      /(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]+)\/?/,
      /(?:https?:\/\/)?(?:www\.)?instagr\.am\/([a-zA-Z0-9_.]+)\/?/,
    ];

    for (const pattern of urlPatterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        // Filter out non-username paths
        const username = match[1];
        if (!['p', 'reel', 'reels', 'stories', 'explore', 'direct', 'accounts'].includes(username.toLowerCase())) {
          return username;
        }
      }
    }

    // Otherwise treat as username, remove @ if present
    return trimmed.replace("@", "");
  };

  const handleInstagramLookup = async () => {
    if (!instagramHandle.trim()) return;

    setLookingUp(true);
    setError(null);
    setDuplicateWarning(null);
    setInstagramPreview(null);

    try {
      // Parse the input to extract username
      const username = parseInstagramInput(instagramHandle);

      if (!username) {
        setError("Could not extract a valid username from the input");
        setLookingUp(false);
        return;
      }

      // First check if this influencer already exists
      const existingInfluencer = await checkForDuplicate(username);

      if (existingInfluencer) {
        setDuplicateWarning(existingInfluencer);
        setLookingUp(false);
        return;
      }

      // Try Apify first (better rate limits), fall back to RapidAPI if not configured
      let response = await fetch(`/api/instagram-apify?handle=${encodeURIComponent(username)}`);

      // If Apify returns 500 (likely not configured), fall back to RapidAPI
      if (!response.ok && response.status === 500) {
        console.log("Apify not configured, falling back to RapidAPI");
        response = await fetch(`/api/instagram?handle=${encodeURIComponent(username)}`);
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch Instagram profile");
      }

      const profile = await response.json();

      // Show preview instead of auto-adding
      setInstagramPreview({
        username: profile.username,
        full_name: profile.full_name || profile.username,
        profile_pic_url: profile.profile_pic_url,
        follower_count: profile.follower_count,
      });
    } catch (err: any) {
      setError(err.message || "Failed to lookup Instagram profile");
    } finally {
      setLookingUp(false);
    }
  };

  const handleConfirmAddFromInstagram = async () => {
    if (!instagramPreview) return;

    setAdding(true);
    setError(null);

    try {
      // Start photo upload in parallel
      let photoPromise: Promise<string | null> = Promise.resolve(null);
      if (instagramPreview.profile_pic_url) {
        photoPromise = (async () => {
          try {
            const photoResponse = await fetch(`/api/instagram/photo?url=${encodeURIComponent(instagramPreview.profile_pic_url!)}`);
            if (photoResponse.ok) {
              const photoBlob = await photoResponse.blob();
              const fileName = `${instagramPreview.username}-${Date.now()}.jpg`;
              const { error: uploadError } = await supabase.storage
                .from("profile-photos")
                .upload(fileName, photoBlob, { contentType: "image/jpeg" });
              if (!uploadError) {
                const { data: urlData } = supabase.storage
                  .from("profile-photos")
                  .getPublicUrl(fileName);
                return urlData.publicUrl;
              }
            }
          } catch (err) {
            console.error("Photo upload failed:", err);
          }
          return null;
        })();
      }

      // Wait for photo with a 3 second timeout
      const photoUrl = await Promise.race([
        photoPromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
      ]);

      // Create new influencer
      const newInfluencerData: InfluencerInsert = {
        name: instagramPreview.full_name,
        instagram_handle: instagramPreview.username,
        profile_photo_url: photoUrl,
        follower_count: instagramPreview.follower_count,
        tier: "C",
        partnership_type: "unassigned",
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

      // If photo wasn't ready in time, update it when it completes
      if (!photoUrl && instagramPreview.profile_pic_url) {
        photoPromise.then(async (url) => {
          if (url) {
            await (supabase.from("influencers") as any)
              .update({ profile_photo_url: url })
              .eq("id", newInfluencer.id);
          }
        });
      }

      // Add to campaign
      await addInfluencerToCampaign(newInfluencer);

      setInstagramHandle("");
      setInstagramPreview(null);
      fetchAllInfluencers();
    } catch (err: any) {
      setError(err.message || "Failed to add influencer");
    } finally {
      setAdding(false);
    }
  };

  const addInfluencerToCampaign = async (influencer: Influencer) => {
    // Check if already added
    if (existingInfluencerIds.includes(influencer.id)) {
      setError("This influencer is already in this campaign");
      return;
    }

    setAdding(true);
    try {
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

      const insertData: any = {
        campaign_id: campaignId,
        influencer_id: influencer.id,
        partnership_type: partnershipType,
      };

      // Add approval status if approval is required
      if (requiresApproval) {
        insertData.approval_status = "pending";
      }

      const insertResult = await (supabase
        .from("campaign_influencers") as any)
        .insert(insertData);

      if (insertResult.error) {
        // Check for unique constraint violation (duplicate campaign-influencer combo)
        if (
          insertResult.error.code === "23505" ||
          insertResult.error.message?.includes("duplicate key") ||
          insertResult.error.message?.includes("campaign_influencers_campaign_id_influencer_id_key")
        ) {
          setError("This influencer is already in this campaign");
        } else {
          setError(insertResult.error.message);
        }
        return;
      }

      setSearchQuery("");
      setDuplicateWarning(null);
      onAdd();
    } catch (err: any) {
      setError(err.message || "Failed to add influencer");
    } finally {
      setAdding(false);
    }
  };

  const filteredInfluencers = allInfluencers.filter((inf) => {
    // Filter out already added influencers
    if (existingInfluencerIds.includes(inf.id)) return false;

    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      inf.name.toLowerCase().includes(query) ||
      inf.instagram_handle.toLowerCase().includes(query)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl" style={{ width: "700px" }} onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Add Influencer to Campaign</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add New via Instagram */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Search by Username or URL</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="username or instagram.com/username"
                  value={instagramHandle}
                  onChange={(e) => {
                    const value = e.target.value;
                    // Auto-extract username if a URL is pasted
                    if (value.includes('instagram.com/') || value.includes('instagr.am/')) {
                      const parsed = parseInstagramInput(value);
                      setInstagramHandle(parsed);
                    } else {
                      setInstagramHandle(value.replace("@", ""));
                    }
                    setDuplicateWarning(null);
                    setInstagramPreview(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleInstagramLookup();
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                onClick={handleInstagramLookup}
                disabled={lookingUp || !instagramHandle.trim()}
              >
                {lookingUp ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                <span className="ml-2">{lookingUp ? "Looking up..." : "Lookup"}</span>
              </Button>
            </div>
          </div>

          {/* Instagram Preview */}
          {instagramPreview && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm font-medium text-blue-800 mb-2">Found on Instagram</p>
              <div className="flex items-center gap-3">
                {instagramPreview.profile_pic_url ? (
                  <img
                    src={`/api/instagram/photo?url=${encodeURIComponent(instagramPreview.profile_pic_url)}`}
                    alt={instagramPreview.full_name}
                    width={48}
                    height={48}
                    className="rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-200 flex items-center justify-center">
                    <span className="text-blue-700 font-medium">
                      {instagramPreview.full_name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-medium">{instagramPreview.full_name}</p>
                  <p className="text-sm text-gray-600">@{instagramPreview.username}</p>
                  <p className="text-xs text-gray-500">
                    {instagramPreview.follower_count.toLocaleString()} followers
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setInstagramPreview(null);
                      setInstagramHandle("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleConfirmAddFromInstagram}
                    disabled={adding}
                  >
                    {adding ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-1" />
                        Add
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Duplicate Warning */}
          {duplicateWarning && (
            <div className={`border rounded-lg p-3 ${
              existingInfluencerIds.includes(duplicateWarning.id)
                ? "bg-red-50 border-red-200"
                : "bg-yellow-50 border-yellow-200"
            }`}>
              <div className="flex items-start gap-2">
                <AlertCircle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                  existingInfluencerIds.includes(duplicateWarning.id)
                    ? "text-red-600"
                    : "text-yellow-600"
                }`} />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    existingInfluencerIds.includes(duplicateWarning.id)
                      ? "text-red-800"
                      : "text-yellow-800"
                  }`}>
                    {existingInfluencerIds.includes(duplicateWarning.id)
                      ? "This influencer is already in this campaign"
                      : "This influencer already exists in your directory"}
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
                    <span className={`text-sm ${
                      existingInfluencerIds.includes(duplicateWarning.id)
                        ? "text-red-700"
                        : "text-yellow-700"
                    }`}>
                      {duplicateWarning.name} (@{duplicateWarning.instagram_handle})
                    </span>
                  </div>
                  {!existingInfluencerIds.includes(duplicateWarning.id) && (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        addInfluencerToCampaign(duplicateWarning);
                        setDuplicateWarning(null);
                        setInstagramHandle("");
                      }}
                      disabled={adding}
                    >
                      Add Existing to Campaign
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Requires Approval Toggle */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="requires-approval"
              checked={requiresApproval}
              onChange={(e) => setRequiresApproval(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <div className="flex-1">
              <Label htmlFor="requires-approval" className="text-sm font-medium cursor-pointer">
                Requires Approval
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">
                Flag this influencer for sign-off before proceeding
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500">Or select from directory</span>
            </div>
          </div>

          {/* Search Existing */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search existing influencers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Influencer List */}
            <div className="max-h-64 overflow-y-auto border rounded-lg">
              {filteredInfluencers.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500">
                  {searchQuery ? "No influencers found" : "All influencers already added"}
                </div>
              ) : (
                <div className="divide-y">
                  {filteredInfluencers.slice(0, 20).map((influencer) => (
                    <div
                      key={influencer.id}
                      className="flex items-center justify-between p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-3">
                        {influencer.profile_photo_url ? (
                          <Image
                            src={influencer.profile_photo_url}
                            alt={influencer.name}
                            width={36}
                            height={36}
                            className="rounded-full object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-gray-500 text-sm font-medium">
                              {influencer.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-sm">{influencer.name}</p>
                          <p className="text-xs text-gray-500">@{influencer.instagram_handle}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addInfluencerToCampaign(influencer)}
                        disabled={adding}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

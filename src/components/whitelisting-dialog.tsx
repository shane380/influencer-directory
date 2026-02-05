"use client";

import { useState, useEffect } from "react";
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
} from "@/components/ui/dialog";
import { Search, Loader2, AlertCircle, Plus, Share2 } from "lucide-react";
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

  // Whitelisting config
  const [whitelistingType, setWhitelistingType] = useState<WhitelistingType>("gifted");

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
      setWhitelistingType("gifted");
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

      // Create new influencer with whitelisting enabled
      const newInfluencerData: InfluencerInsert = {
        name: instagramPreview.full_name,
        instagram_handle: instagramPreview.username,
        profile_photo_url: photoUrl,
        follower_count: instagramPreview.follower_count,
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

      setInstagramHandle("");
      setInstagramPreview(null);
      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to add influencer");
    } finally {
      setAdding(false);
    }
  };

  const enableWhitelistingForInfluencer = async (influencer: Influencer) => {
    if (influencer.whitelisting_enabled) {
      setError("This influencer already has whitelisting enabled");
      return;
    }

    setAdding(true);
    setError(null);

    try {
      const { error: updateError } = await (supabase
        .from("influencers") as any)
        .update({
          whitelisting_enabled: true,
          whitelisting_type: whitelistingType,
        })
        .eq("id", influencer.id);

      if (updateError) throw updateError;

      setSearchQuery("");
      setDuplicateWarning(null);
      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to enable whitelisting");
    } finally {
      setAdding(false);
    }
  };

  const filteredInfluencers = allInfluencers.filter((inf) => {
    // Filter out already whitelisting-enabled influencers
    if (inf.whitelisting_enabled) return false;

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
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-purple-600" />
            Add Whitelisting Influencer
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Whitelisting Type Selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Whitelisting Type</Label>
            <Select
              value={whitelistingType}
              onChange={(e) => setWhitelistingType(e.target.value as WhitelistingType)}
            >
              <option value="gifted">Gifted (Product/Gift Card)</option>
              <option value="paid">Paid</option>
            </Select>
            <p className="text-xs text-gray-500">
              How will the influencer be compensated for whitelisting rights?
            </p>
          </div>

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
              duplicateWarning.whitelisting_enabled
                ? "bg-red-50 border-red-200"
                : "bg-yellow-50 border-yellow-200"
            }`}>
              <div className="flex items-start gap-2">
                <AlertCircle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                  duplicateWarning.whitelisting_enabled
                    ? "text-red-600"
                    : "text-yellow-600"
                }`} />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${
                    duplicateWarning.whitelisting_enabled
                      ? "text-red-800"
                      : "text-yellow-800"
                  }`}>
                    {duplicateWarning.whitelisting_enabled
                      ? "This influencer already has whitelisting enabled"
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
                      duplicateWarning.whitelisting_enabled
                        ? "text-red-700"
                        : "text-yellow-700"
                    }`}>
                      {duplicateWarning.name} (@{duplicateWarning.instagram_handle})
                    </span>
                  </div>
                  {!duplicateWarning.whitelisting_enabled && (
                    <Button
                      type="button"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        enableWhitelistingForInfluencer(duplicateWarning);
                      }}
                      disabled={adding}
                    >
                      Enable Whitelisting
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

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
                  {searchQuery ? "No influencers found" : "All influencers already have whitelisting enabled"}
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
                        onClick={() => enableWhitelistingForInfluencer(influencer)}
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

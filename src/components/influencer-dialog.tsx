"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Influencer,
  InfluencerInsert,
  Campaign,
  CampaignInfluencer,
  RelationshipStatus,
  PartnershipType,
  Profile,
  InfluencerRates,
  InfluencerMediaKit,
} from "@/types/database";
import { InfluencerRatesSection } from "@/components/influencer-rates-section";
import { MediaKitUpload } from "@/components/media-kit-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ExternalLink, Search, Loader2, Calendar, Megaphone, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

interface InfluencerDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  influencer: Influencer | null;
}

interface InstagramProfile {
  username: string;
  full_name: string;
  profile_pic_url: string;
  follower_count: number;
  following_count: number;
  media_count: number;
  biography: string;
  is_private: boolean;
  is_verified: boolean;
}

interface CampaignHistoryItem extends CampaignInfluencer {
  campaign: Campaign;
}

const statusColors: Record<RelationshipStatus, string> = {
  prospect: "bg-gray-100 text-gray-800",
  contacted: "bg-blue-100 text-blue-800",
  followed_up: "bg-yellow-100 text-yellow-800",
  lead_dead: "bg-red-100 text-red-800",
  creator_wants_paid: "bg-pink-100 text-pink-800",
  order_placed: "bg-orange-100 text-orange-800",
  order_delivered: "bg-teal-100 text-teal-800",
  order_follow_up_sent: "bg-indigo-100 text-indigo-800",
  order_follow_up_two_sent: "bg-purple-100 text-purple-800",
  posted: "bg-green-100 text-green-800",
};

const statusLabels: Record<RelationshipStatus, string> = {
  prospect: "Prospect",
  contacted: "Contacted",
  followed_up: "Followed Up",
  lead_dead: "Lead Dead",
  creator_wants_paid: "Creator Wants Paid",
  order_placed: "Order Placed",
  order_delivered: "Order Delivered",
  order_follow_up_sent: "Order Follow Up Sent",
  order_follow_up_two_sent: "Order Follow Up Two Sent",
  posted: "Posted",
};

const partnershipTypeLabels: Record<PartnershipType, string> = {
  unassigned: "Unassigned",
  gifted_no_ask: "Gifted No Ask",
  gifted_soft_ask: "Gifted Soft Ask",
  gifted_deliverable_ask: "Gifted Deliverable Ask",
  gifted_recurring: "Gifted Recurring",
  paid: "Paid",
};

const partnershipTypeColors: Record<PartnershipType, string> = {
  unassigned: "bg-red-100 text-red-800",
  gifted_no_ask: "bg-gray-100 text-gray-800",
  gifted_soft_ask: "bg-blue-100 text-blue-800",
  gifted_deliverable_ask: "bg-yellow-100 text-yellow-800",
  gifted_recurring: "bg-green-100 text-green-800",
  paid: "bg-purple-100 text-purple-800",
};

const initialFormData: InfluencerInsert = {
  name: "",
  instagram_handle: "",
  profile_photo_url: null,
  follower_count: 0,
  email: null,
  phone: null,
  mailing_address: null,
  agent_name: null,
  agent_email: null,
  agent_phone: null,
  partnership_type: "unassigned",
  tier: "C",
  relationship_status: "prospect",
  top_size: null,
  bottoms_size: null,
  notes: null,
  last_contacted_at: null,
  assigned_to: null,
};

export function InfluencerDialog({
  open,
  onClose,
  onSave,
  influencer,
}: InfluencerDialogProps) {
  const [formData, setFormData] = useState<InfluencerInsert>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [searchHandle, setSearchHandle] = useState("");
  const [campaignHistory, setCampaignHistory] = useState<CampaignHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rates, setRates] = useState<InfluencerRates | null>(null);
  const [mediaKits, setMediaKits] = useState<InfluencerMediaKit[]>([]);
  const [loadingRates, setLoadingRates] = useState(false);
  const supabase = createClient();

  // Fetch profiles and current user
  useEffect(() => {
    async function fetchProfilesAndUser() {
      if (!open) return;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }

      // Fetch all profiles
      const { data: profilesData } = await (supabase
        .from("profiles") as any)
        .select("*")
        .order("display_name");

      if (profilesData) {
        setProfiles(profilesData);
      }
    }

    fetchProfilesAndUser();
  }, [open, supabase]);

  useEffect(() => {
    if (influencer) {
      setFormData({
        name: influencer.name,
        instagram_handle: influencer.instagram_handle,
        profile_photo_url: influencer.profile_photo_url,
        follower_count: influencer.follower_count,
        email: influencer.email,
        phone: influencer.phone,
        mailing_address: influencer.mailing_address,
        agent_name: influencer.agent_name,
        agent_email: influencer.agent_email,
        agent_phone: influencer.agent_phone,
        partnership_type: influencer.partnership_type,
        tier: influencer.tier,
        relationship_status: influencer.relationship_status,
        top_size: influencer.top_size,
        bottoms_size: influencer.bottoms_size,
        notes: influencer.notes,
        last_contacted_at: influencer.last_contacted_at?.split("T")[0] || null,
        assigned_to: influencer.assigned_to,
      });
      setSearchHandle("");
    } else {
      // For new influencers, set the assigned_to to current user
      setFormData({
        ...initialFormData,
        assigned_to: currentUserId,
      });
      setSearchHandle("");
      setCampaignHistory([]);
    }
    setError(null);
    setShowDeleteConfirm(false);
  }, [influencer, open, currentUserId]);

  // Fetch campaign history when editing an existing influencer
  useEffect(() => {
    async function fetchCampaignHistory() {
      if (!influencer || !open) {
        setCampaignHistory([]);
        return;
      }

      setLoadingHistory(true);
      try {
        const { data, error } = await supabase
          .from("campaign_influencers")
          .select(`
            *,
            campaign:campaigns(*)
          `)
          .eq("influencer_id", influencer.id)
          .order("added_at", { ascending: false });

        if (error) throw error;
        setCampaignHistory(data || []);
      } catch (err) {
        console.error("Failed to fetch campaign history:", err);
      } finally {
        setLoadingHistory(false);
      }
    }

    fetchCampaignHistory();
  }, [influencer, open, supabase]);

  // Fetch rates and media kits for paid influencers
  useEffect(() => {
    async function fetchRatesAndMediaKits() {
      if (!influencer || !open) {
        setRates(null);
        setMediaKits([]);
        return;
      }

      setLoadingRates(true);
      try {
        // Fetch rates
        const { data: ratesData } = await supabase
          .from("influencer_rates")
          .select("*")
          .eq("influencer_id", influencer.id)
          .single();

        setRates(ratesData || null);

        // Fetch media kits
        const { data: mediaKitsData } = await supabase
          .from("influencer_media_kits")
          .select("*")
          .eq("influencer_id", influencer.id)
          .order("uploaded_at", { ascending: false });

        setMediaKits(mediaKitsData || []);
      } catch (err) {
        console.error("Failed to fetch rates/media kits:", err);
      } finally {
        setLoadingRates(false);
      }
    }

    fetchRatesAndMediaKits();
  }, [influencer, open, supabase]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "number"
          ? value === ""
            ? 0
            : parseFloat(value)
          : value || null,
    }));
  };

  const handleRatesChange = (updatedRates: Partial<InfluencerRates>) => {
    setRates((prev) => ({
      ...(prev || {
        id: "",
        influencer_id: influencer?.id || "",
        ugc_rate: null,
        collab_post_rate: null,
        organic_post_rate: null,
        whitelisting_rate: null,
        notes: null,
        created_at: "",
        updated_at: "",
      }),
      ...updatedRates,
    } as InfluencerRates));
  };

  const handleMediaKitUpload = (mediaKit: InfluencerMediaKit) => {
    setMediaKits((prev) => [mediaKit, ...prev]);
  };

  const handleMediaKitDelete = (mediaKitId: string) => {
    setMediaKits((prev) => prev.filter((mk) => mk.id !== mediaKitId));
  };

  const handleInstagramLookup = async () => {
    if (!searchHandle.trim()) {
      setError("Please enter an Instagram handle to search");
      return;
    }

    setLookingUp(true);
    setError(null);

    try {
      const response = await fetch(`/api/instagram?handle=${encodeURIComponent(searchHandle)}`);

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch Instagram profile");
      }

      const profile: InstagramProfile = await response.json();

      // Download and upload Instagram photo to Supabase storage
      let permanentPhotoUrl: string | null = null;
      if (profile.profile_pic_url) {
        try {
          // Fetch the Instagram photo through our API proxy
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
              permanentPhotoUrl = urlData.publicUrl;
            }
          }
        } catch (photoErr) {
          console.error("Failed to save Instagram photo:", photoErr);
          // Fall back to Instagram URL if upload fails
          permanentPhotoUrl = profile.profile_pic_url;
        }
      }

      // Auto-populate form with Instagram data
      setFormData((prev) => ({
        ...prev,
        name: profile.full_name || prev.name,
        instagram_handle: profile.username,
        profile_photo_url: permanentPhotoUrl || prev.profile_photo_url,
        follower_count: profile.follower_count,
        notes: profile.biography
          ? `Bio: ${profile.biography}${prev.notes ? `\n\n${prev.notes}` : ""}`
          : prev.notes,
      }));

      setSearchHandle("");
    } catch (err: any) {
      setError(err.message || "Failed to look up Instagram profile");
    } finally {
      setLookingUp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const dataToSave = {
        ...formData,
        last_contacted_at: formData.last_contacted_at
          ? new Date(formData.last_contacted_at).toISOString()
          : null,
      };

      let savedInfluencerId = influencer?.id;

      if (influencer) {
        const updateResult = await (supabase
          .from("influencers") as any)
          .update(dataToSave)
          .eq("id", influencer.id);

        if (updateResult.error) throw updateResult.error;
      } else {
        // Set created_by and assigned_to (default to creator) for new influencers
        const insertData = {
          ...dataToSave,
          created_by: currentUserId,
          assigned_to: dataToSave.assigned_to || currentUserId,
        };
        const insertResult = await (supabase.from("influencers") as any)
          .insert(insertData)
          .select()
          .single();

        if (insertResult.error) throw insertResult.error;
        savedInfluencerId = insertResult.data?.id;
      }

      // Save rates if partnership type is paid and we have rates data
      if (formData.partnership_type === "paid" && savedInfluencerId && rates) {
        const ratesData = {
          influencer_id: savedInfluencerId,
          ugc_rate: rates.ugc_rate,
          collab_post_rate: rates.collab_post_rate,
          organic_post_rate: rates.organic_post_rate,
          whitelisting_rate: rates.whitelisting_rate,
          notes: rates.notes,
        };

        // Upsert rates (insert or update)
        const { error: ratesError } = await supabase
          .from("influencer_rates")
          .upsert(ratesData as never, { onConflict: "influencer_id" });

        if (ratesError) {
          console.error("Failed to save rates:", ratesError);
        }
      }

      onSave();
    } catch (err: any) {
      setError(err.message || "Failed to save influencer");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!influencer) return;

    setLoading(true);
    setError(null);

    try {
      const deleteResult = await (supabase
        .from("influencers") as any)
        .delete()
        .eq("id", influencer.id);

      if (deleteResult.error) throw deleteResult.error;
      setShowDeleteConfirm(false);
      onSave();
    } catch (err: any) {
      setError(err.message || "Failed to delete influencer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>
            {influencer ? "Edit Influencer" : "Add New Influencer"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Instagram Lookup Section */}
          {!influencer && (
            <div className="bg-gray-50 p-4 rounded-lg space-y-3">
              <Label className="text-sm font-medium">Quick Add from Instagram</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">@</span>
                  <Input
                    placeholder="instagram_handle"
                    value={searchHandle}
                    onChange={(e) => setSearchHandle(e.target.value.replace("@", ""))}
                    className="pl-8"
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
                  disabled={lookingUp || !searchHandle.trim()}
                >
                  {lookingUp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  <span className="ml-2">{lookingUp ? "Looking up..." : "Lookup"}</span>
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Enter an Instagram handle to auto-fill profile picture and followers
              </p>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="relative">
              {formData.profile_photo_url ? (
                <Image
                  src={formData.profile_photo_url}
                  alt="Profile"
                  width={80}
                  height={80}
                  className="rounded-full object-cover w-20 h-20"
                  unoptimized
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-500 text-2xl font-medium">
                    {formData.name?.charAt(0)?.toUpperCase() || "?"}
                  </span>
                </div>
              )}
            </div>
            {formData.instagram_handle && (
              <Button
                type="button"
                variant="outline"
                onClick={() => window.open(`https://instagram.com/${formData.instagram_handle}`, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Instagram Profile
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram_handle">Instagram Handle *</Label>
              <Input
                id="instagram_handle"
                name="instagram_handle"
                value={formData.instagram_handle}
                onChange={handleChange}
                placeholder="username"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assigned_to">Assigned To</Label>
            <Select
              id="assigned_to"
              name="assigned_to"
              value={formData.assigned_to || ""}
              onChange={handleChange}
            >
              <option value="">Unassigned</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.display_name}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="follower_count">Follower Count *</Label>
            <Input
              id="follower_count"
              name="follower_count"
              type="number"
              value={formData.follower_count}
              onChange={handleChange}
              min={0}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email || ""}
                onChange={handleChange}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                value={formData.phone || ""}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mailing_address">Mailing Address</Label>
            <Textarea
              id="mailing_address"
              name="mailing_address"
              value={formData.mailing_address || ""}
              onChange={handleChange}
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="top_size">Top Size</Label>
              <Select
                id="top_size"
                name="top_size"
                value={formData.top_size || ""}
                onChange={handleChange}
              >
                <option value="">Select size...</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bottoms_size">Bottoms Size</Label>
              <Select
                id="bottoms_size"
                name="bottoms_size"
                value={formData.bottoms_size || ""}
                onChange={handleChange}
              >
                <option value="">Select size...</option>
                <option value="XS">XS</option>
                <option value="S">S</option>
                <option value="M">M</option>
                <option value="L">L</option>
                <option value="XL">XL</option>
              </Select>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-3">Agent Contact (Optional)</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="agent_name">Agent Name</Label>
                <Input
                  id="agent_name"
                  name="agent_name"
                  value={formData.agent_name || ""}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent_email">Agent Email</Label>
                <Input
                  id="agent_email"
                  name="agent_email"
                  type="email"
                  value={formData.agent_email || ""}
                  onChange={handleChange}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent_phone">Agent Phone</Label>
                <Input
                  id="agent_phone"
                  name="agent_phone"
                  type="tel"
                  value={formData.agent_phone || ""}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="partnership_type">Partnership Type *</Label>
              <Select
                id="partnership_type"
                name="partnership_type"
                value={formData.partnership_type}
                onChange={handleChange}
              >
                <option value="unassigned">Unassigned</option>
                <option value="gifted_no_ask">Gifted No Ask</option>
                <option value="gifted_soft_ask">Gifted Soft Ask</option>
                <option value="gifted_deliverable_ask">Gifted Deliverable Ask</option>
                <option value="gifted_recurring">Gifted Recurring</option>
                <option value="paid">Paid</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship_status">Status *</Label>
              <Select
                id="relationship_status"
                name="relationship_status"
                value={formData.relationship_status}
                onChange={handleChange}
              >
                <option value="prospect">Prospect</option>
                <option value="contacted">Contacted</option>
                <option value="followed_up">Followed Up</option>
                <option value="lead_dead">Lead Dead</option>
                <option value="creator_wants_paid">Creator Wants Paid</option>
                <option value="order_placed">Order Placed</option>
                <option value="order_delivered">Order Delivered</option>
                <option value="order_follow_up_sent">Order Follow Up Sent</option>
                <option value="order_follow_up_two_sent">Order Follow Up Two Sent</option>
                <option value="posted">Posted</option>
              </Select>
            </div>
          </div>

          {/* Rate Card Section - Only for Paid partnership */}
          {formData.partnership_type === "paid" && (
            <InfluencerRatesSection
              rates={rates}
              onChange={handleRatesChange}
            />
          )}

          {/* Media Kit Upload - Only for Paid partnership and existing influencers */}
          {formData.partnership_type === "paid" && influencer && (
            <MediaKitUpload
              influencerId={influencer.id}
              mediaKits={mediaKits}
              onUpload={handleMediaKitUpload}
              onDelete={handleMediaKitDelete}
            />
          )}

          <div className="space-y-2">
            <Label htmlFor="last_contacted_at">Last Contacted</Label>
            <Input
              id="last_contacted_at"
              name="last_contacted_at"
              type="date"
              value={formData.last_contacted_at || ""}
              onChange={handleChange}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes || ""}
              onChange={handleChange}
              rows={3}
              placeholder="Add any relevant notes about this influencer..."
            />
          </div>

          {/* Campaign History Section - only show when editing */}
          {influencer && (
            <div className="border-t pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Megaphone className="h-4 w-4 text-gray-500" />
                <h3 className="font-medium">Campaign History</h3>
              </div>
              {loadingHistory ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading campaigns...
                </div>
              ) : campaignHistory.length === 0 ? (
                <p className="text-sm text-gray-500">No campaigns yet</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {campaignHistory.map((item) => {
                    // Parse month/year without timezone issues
                    let monthYear = "No date";
                    if (item.campaign.start_date) {
                      const dateParts = item.campaign.start_date.split('T')[0].split('-');
                      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                        'July', 'August', 'September', 'October', 'November', 'December'];
                      monthYear = `${monthNames[parseInt(dateParts[1], 10) - 1]} ${dateParts[0]}`;
                    }

                    return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg text-sm"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{item.campaign.name}</p>
                          <span className="text-gray-500 text-xs">({monthYear})</span>
                        </div>
                        {item.compensation && (
                          <p className="text-gray-500 text-xs mt-1">Compensation: {item.compensation}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={partnershipTypeColors[item.partnership_type]}>
                          {partnershipTypeLabels[item.partnership_type]}
                        </Badge>
                        <Badge className={statusColors[item.status]}>
                          {statusLabels[item.status]}
                        </Badge>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Delete Confirmation */}
          {showDeleteConfirm && influencer && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-900">Delete Entire Profile?</p>
                  <p className="text-sm text-red-700 mt-1">
                    This will permanently delete <strong>{influencer.name}</strong>&apos;s entire profile and remove them from all campaigns. This action cannot be undone.
                  </p>
                  <p className="text-sm text-red-700 mt-2">
                    <strong>Tip:</strong> If you only want to remove them from a campaign, use the trash icon in the campaign view instead.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteConfirm}
                  disabled={loading}
                >
                  {loading ? "Deleting..." : "Yes, Delete Entire Profile"}
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            {influencer && !showDeleteConfirm && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteClick}
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
              {loading ? "Saving..." : influencer ? "Update" : "Add Influencer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

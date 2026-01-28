"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Influencer,
  InfluencerInsert,
  Campaign,
  CampaignInfluencer,
  CampaignDeal,
  Profile,
  InfluencerRates,
  InfluencerMediaKit,
  InfluencerOrder,
} from "@/types/database";
import { InfluencerProfileHeader } from "@/components/influencer-profile-header";
import { InfluencerOverviewTab } from "@/components/influencer-overview-tab";
import { InfluencerOrdersTab } from "@/components/influencer-orders-tab";
import { InfluencerCampaignsTab } from "@/components/influencer-campaigns-tab";
import { InfluencerContentTab } from "@/components/influencer-content-tab";
import { DealDialog } from "@/components/deal-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertTriangle, Pencil } from "lucide-react";

interface InfluencerDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  influencer: Influencer | null;
  initialTab?: string;
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

interface ShopifyCustomer {
  id: number;
  email: string;
  name: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  address?: {
    address1: string;
    address2?: string | null;
    city: string;
    province: string;
    zip: string;
    country: string;
  } | null;
}

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
  initialTab = "overview",
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
  const [activeTab, setActiveTab] = useState<string>("overview");

  // Orders state
  const [orders, setOrders] = useState<InfluencerOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const [shopifyCustomer, setShopifyCustomer] = useState<ShopifyCustomer | null>(null);

  // Deals state
  const [deals, setDeals] = useState<(CampaignDeal & { campaign: Campaign })[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<(CampaignDeal & { campaign: Campaign }) | null>(null);

  const supabase = createClient();

  // Fetch profiles and current user
  useEffect(() => {
    async function fetchProfilesAndUser() {
      if (!open) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }

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

  // Reset form when dialog opens/closes or influencer changes
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
      setFormData({
        ...initialFormData,
        assigned_to: currentUserId,
      });
      setSearchHandle("");
      setCampaignHistory([]);
      setOrders([]);
      setShopifyCustomer(null);
    }
    setError(null);
    setShowDeleteConfirm(false);
    setActiveTab(initialTab);
  }, [influencer, open, currentUserId, initialTab]);

  // Fetch campaign history
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

  // Fetch deals
  useEffect(() => {
    async function fetchDeals() {
      if (!influencer || !open) {
        setDeals([]);
        return;
      }

      setLoadingDeals(true);
      try {
        const { data, error } = await supabase
          .from("campaign_deals")
          .select(`
            *,
            campaign:campaigns(*)
          `)
          .eq("influencer_id", influencer.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setDeals(data || []);
      } catch (err) {
        console.error("Failed to fetch deals:", err);
      } finally {
        setLoadingDeals(false);
      }
    }

    fetchDeals();
  }, [influencer, open, supabase]);

  // Fetch rates and media kits
  useEffect(() => {
    async function fetchRatesAndMediaKits() {
      if (!influencer || !open) {
        setRates(null);
        setMediaKits([]);
        return;
      }

      setLoadingRates(true);
      try {
        const { data: ratesData } = await supabase
          .from("influencer_rates")
          .select("*")
          .eq("influencer_id", influencer.id)
          .single();

        setRates(ratesData || null);

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

  // Fetch Shopify customer and orders
  useEffect(() => {
    async function fetchShopifyData() {
      if (!influencer || !open || !influencer.shopify_customer_id) {
        setShopifyCustomer(null);
        setOrders([]);
        return;
      }

      setLoadingOrders(true);
      try {
        // Fetch Shopify customer details
        const customerResponse = await fetch(
          `/api/shopify/customers?id=${influencer.shopify_customer_id}`
        );
        if (customerResponse.ok) {
          const customerData = await customerResponse.json();
          setShopifyCustomer(customerData.customer);
        }

        // Fetch cached orders
        const ordersResponse = await fetch(
          `/api/influencers/${influencer.id}/orders`
        );
        if (ordersResponse.ok) {
          const ordersData = await ordersResponse.json();
          setOrders(ordersData.orders || []);
        }
      } catch (err) {
        console.error("Failed to fetch Shopify data:", err);
      } finally {
        setLoadingOrders(false);
      }
    }

    fetchShopifyData();
  }, [influencer, open]);

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

      let permanentPhotoUrl: string | null = null;
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
              permanentPhotoUrl = urlData.publicUrl;
            }
          }
        } catch (photoErr) {
          console.error("Failed to save Instagram photo:", photoErr);
          permanentPhotoUrl = profile.profile_pic_url;
        }
      }

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

  const handleRefreshOrders = async () => {
    if (!influencer?.shopify_customer_id) {
      console.log("No shopify_customer_id found for influencer");
      return;
    }

    console.log("Refreshing orders for customer ID:", influencer.shopify_customer_id, "name:", influencer.name);
    setRefreshingOrders(true);
    try {
      const response = await fetch("/api/shopify/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: influencer.id,
          shopify_customer_id: influencer.shopify_customer_id,
          influencer_name: influencer.name,
        }),
      });

      const data = await response.json();
      console.log("Sync response:", response.status, data);

      if (response.ok) {
        setOrders(data.orders || []);
        console.log("Orders synced:", data.orders?.length || 0);
      } else {
        console.error("Sync failed:", data.error);
      }
    } catch (err) {
      console.error("Failed to refresh orders:", err);
    } finally {
      setRefreshingOrders(false);
    }
  };

  const handleLinkCustomer = async (customerId: string) => {
    if (!influencer) return;

    try {
      // Save customer ID to influencer
      const { error: updateError } = await (supabase
        .from("influencers") as any)
        .update({ shopify_customer_id: customerId })
        .eq("id", influencer.id);

      if (updateError) throw updateError;

      // Fetch customer details
      const customerResponse = await fetch(`/api/shopify/customers?id=${customerId}`);
      if (customerResponse.ok) {
        const customerData = await customerResponse.json();
        setShopifyCustomer(customerData.customer);
      }

      // Sync orders
      setRefreshingOrders(true);
      const syncResponse = await fetch("/api/shopify/orders/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          influencer_id: influencer.id,
          shopify_customer_id: customerId,
          influencer_name: influencer.name,
        }),
      });

      if (syncResponse.ok) {
        const syncData = await syncResponse.json();
        setOrders(syncData.orders || []);
      }
    } catch (err) {
      console.error("Failed to link customer:", err);
    } finally {
      setRefreshingOrders(false);
    }
  };

  const handleOpenDealDialog = (deal: CampaignDeal & { campaign: Campaign }) => {
    setSelectedDeal(deal);
    setDealDialogOpen(true);
  };

  const handleCloseDealDialog = () => {
    setDealDialogOpen(false);
    setSelectedDeal(null);
  };

  const handleDealSave = async () => {
    // Refresh deals after save
    if (!influencer) return;

    const { data } = await supabase
      .from("campaign_deals")
      .select(`
        *,
        campaign:campaigns(*)
      `)
      .eq("influencer_id", influencer.id)
      .order("created_at", { ascending: false });

    if (data) {
      setDeals(data);
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

      // Save rates if partnership type is paid
      if (formData.partnership_type === "paid" && savedInfluencerId && rates) {
        const ratesData = {
          influencer_id: savedInfluencerId,
          ugc_rate: rates.ugc_rate,
          collab_post_rate: rates.collab_post_rate,
          organic_post_rate: rates.organic_post_rate,
          whitelisting_rate: rates.whitelisting_rate,
          notes: rates.notes,
        };

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
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl" style={{ width: "700px" }} onClose={onClose}>
        <DialogHeader>
          <DialogTitle>
            {influencer ? "Influencer Profile" : "Add New Influencer"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Profile Header */}
          <InfluencerProfileHeader
            influencer={influencer}
            formData={formData}
            profiles={profiles}
            onChange={handleChange}
            onInstagramLookup={handleInstagramLookup}
            lookingUp={lookingUp}
            searchHandle={searchHandle}
            onSearchHandleChange={setSearchHandle}
          />

          {/* Tabs - Only show for existing influencers */}
          {influencer ? (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="orders">Orders</TabsTrigger>
                <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                <TabsTrigger value="content">Content</TabsTrigger>
                <TabsTrigger value="deal">Deal</TabsTrigger>
              </TabsList>

              {/* Fixed size container for tab content to prevent modal resizing */}
              <div className="h-[400px] w-full overflow-y-auto">
                <TabsContent value="overview" className="mt-0 h-full w-full">
                  <InfluencerOverviewTab
                    influencer={influencer}
                    formData={formData}
                    onChange={handleChange}
                    rates={rates}
                    onRatesChange={handleRatesChange}
                    mediaKits={mediaKits}
                    onMediaKitUpload={handleMediaKitUpload}
                    onMediaKitDelete={handleMediaKitDelete}
                  />
                </TabsContent>

                <TabsContent value="orders" className="mt-0 h-full w-full">
                  <InfluencerOrdersTab
                    influencer={influencer}
                    orders={orders}
                    loadingOrders={loadingOrders}
                    onRefreshOrders={handleRefreshOrders}
                    onLinkCustomer={handleLinkCustomer}
                    refreshingOrders={refreshingOrders}
                    shopifyCustomer={shopifyCustomer}
                  />
                </TabsContent>

                <TabsContent value="campaigns" className="mt-0 h-full w-full">
                  <InfluencerCampaignsTab
                    campaignHistory={campaignHistory}
                    loadingHistory={loadingHistory}
                  />
                </TabsContent>

                <TabsContent value="content" className="mt-0 h-full w-full">
                  <InfluencerContentTab />
                </TabsContent>

                <TabsContent value="deal" className="mt-0 h-full w-full">
                  <div className="p-4 space-y-4">
                    {loadingDeals ? (
                      <div className="text-center text-gray-500 py-8">Loading deals...</div>
                    ) : deals.length === 0 ? (
                      <div className="text-center text-gray-500 py-8">No deals found for this influencer.</div>
                    ) : (
                      deals.map((deal) => {
                        const getUserName = (userId: string | null) => {
                          if (!userId) return null;
                          const profile = profiles.find((p) => p.id === userId);
                          return profile?.display_name || "Unknown user";
                        };

                        const hasWhitelisting = deal.deliverables?.some(
                          (d: { description: string }) => d.description?.toLowerCase().includes("whitelist")
                        );

                        const getDealStatusLabel = (status: string) => {
                          switch (status) {
                            case "negotiating": return "Negotiating";
                            case "confirmed": return "Confirmed";
                            case "cancelled": return "Cancelled";
                            default: return status;
                          }
                        };

                        const getDealStatusColor = (status: string) => {
                          switch (status) {
                            case "negotiating": return "bg-yellow-100 text-yellow-800";
                            case "confirmed": return "bg-green-100 text-green-800";
                            case "cancelled": return "bg-gray-100 text-gray-800";
                            default: return "bg-gray-100 text-gray-800";
                          }
                        };

                        const getContentStatusLabel = (status: string) => {
                          switch (status) {
                            case "not_started": return "Not Started";
                            case "content_approved": return "Content Approved";
                            case "content_live": return "Content Live";
                            default: return status;
                          }
                        };

                        const getContentStatusColor = (status: string) => {
                          switch (status) {
                            case "not_started": return "bg-gray-100 text-gray-800";
                            case "content_approved": return "bg-yellow-100 text-yellow-800";
                            case "content_live": return "bg-green-100 text-green-800";
                            default: return "bg-gray-100 text-gray-800";
                          }
                        };

                        const getWhitelistingStatusLabel = (status: string) => {
                          switch (status) {
                            case "not_applicable": return "N/A";
                            case "pending": return "Pending";
                            case "live": return "Live";
                            case "ended": return "Ended";
                            default: return status;
                          }
                        };

                        const getWhitelistingStatusColor = (status: string) => {
                          switch (status) {
                            case "not_applicable": return "bg-gray-100 text-gray-800";
                            case "pending": return "bg-yellow-100 text-yellow-800";
                            case "live": return "bg-green-100 text-green-800";
                            case "ended": return "bg-blue-100 text-blue-800";
                            default: return "bg-gray-100 text-gray-800";
                          }
                        };

                        return (
                          <div key={deal.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium text-gray-900">{deal.campaign?.name || "Unknown Campaign"}</h4>
                                <p className="text-sm text-gray-500">Created {new Date(deal.created_at).toLocaleDateString()}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenDealDialog(deal)}
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Edit
                                </Button>
                                <div className="text-right">
                                  <p className="text-lg font-semibold text-green-600">
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(deal.total_deal_value)} USD
                                  </p>
                                  <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                                    deal.payment_status === 'paid_in_full' ? 'bg-green-100 text-green-800' :
                                    deal.payment_status === 'deposit_paid' ? 'bg-yellow-100 text-yellow-800' :
                                    deal.payment_status === 'paid_on_post' ? 'bg-blue-100 text-blue-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                  {deal.payment_status === 'paid_in_full' ? 'Paid in Full' :
                                   deal.payment_status === 'deposit_paid' ? 'Deposit Paid' :
                                   deal.payment_status === 'paid_on_post' ? 'Paid on Post' :
                                   'Not Paid'}
                                </span>
                                </div>
                              </div>
                            </div>

                            {/* Status Tracking */}
                            <div className="flex flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">Deal:</span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${getDealStatusColor(deal.deal_status || "negotiating")}`}>
                                  {getDealStatusLabel(deal.deal_status || "negotiating")}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500">Content:</span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${getContentStatusColor(deal.content_status || "not_started")}`}>
                                  {getContentStatusLabel(deal.content_status || "not_started")}
                                  {deal.content_status === "content_live" && deal.content_live_date && (
                                    <span className="text-xs opacity-75">({new Date(deal.content_live_date).toLocaleDateString()})</span>
                                  )}
                                </span>
                              </div>
                              {hasWhitelisting && deal.whitelisting_status && deal.whitelisting_status !== "not_applicable" && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500">Whitelisting:</span>
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${getWhitelistingStatusColor(deal.whitelisting_status)}`}>
                                    {getWhitelistingStatusLabel(deal.whitelisting_status)}
                                    {(deal.whitelisting_status === "live" || deal.whitelisting_status === "ended") && deal.whitelisting_live_date && (
                                      <span className="text-xs opacity-75">({new Date(deal.whitelisting_live_date).toLocaleDateString()})</span>
                                    )}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Deliverables */}
                            {deal.deliverables && deal.deliverables.length > 0 && (
                              <div>
                                <p className="text-sm font-medium text-gray-700 mb-1">Deliverables:</p>
                                <ul className="text-sm text-gray-600 space-y-1">
                                  {deal.deliverables.map((d: { description: string; quantity: number; rate: number }, idx: number) => (
                                    <li key={idx} className="flex justify-between">
                                      <span>{d.quantity > 1 ? `${d.quantity}x ` : ''}{d.description}</span>
                                      <span className="text-gray-500">${d.rate * d.quantity}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Payment Milestones */}
                            {deal.payment_terms && deal.payment_terms.length > 0 && (
                              <div>
                                <p className="text-sm font-medium text-gray-700 mb-1">Payment Terms:</p>
                                <ul className="text-sm space-y-1">
                                  {deal.payment_terms.map((milestone: { id: string; description: string; percentage: number; amount: number; is_paid: boolean; paid_date: string | null; paid_by?: string | null }) => (
                                    <li key={milestone.id} className="flex items-center justify-between">
                                      <span className="flex items-center gap-2">
                                        {milestone.is_paid ? (
                                          <span className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</span>
                                        ) : (
                                          <span className="w-4 h-4 rounded-full border-2 border-gray-300"></span>
                                        )}
                                        <span className={milestone.is_paid ? 'text-gray-500 line-through' : 'text-gray-700'}>
                                          {milestone.description} ({milestone.percentage}%)
                                        </span>
                                      </span>
                                      <span className={milestone.is_paid ? 'text-green-600' : 'text-gray-500'}>
                                        ${milestone.amount}
                                        {milestone.is_paid && milestone.paid_date && (
                                          <span className="text-xs text-gray-400 ml-1">
                                            - {new Date(milestone.paid_date).toLocaleDateString()}
                                            {milestone.paid_by && (
                                              <span> by {getUserName(milestone.paid_by)}</span>
                                            )}
                                          </span>
                                        )}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {deal.notes && (
                              <div>
                                <p className="text-sm font-medium text-gray-700 mb-1">Notes:</p>
                                <p className="text-sm text-gray-600">{deal.notes}</p>
                              </div>
                            )}

                            {/* Audit Info */}
                            {(deal.updated_by || deal.created_by) && (
                              <div className="pt-2 border-t text-xs text-gray-400">
                                {deal.updated_by && deal.updated_at ? (
                                  <span>Last updated by {getUserName(deal.updated_by)} on {new Date(deal.updated_at).toLocaleDateString()}</span>
                                ) : deal.created_by ? (
                                  <span>Created by {getUserName(deal.created_by)} on {new Date(deal.created_at).toLocaleDateString()}</span>
                                ) : null}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          ) : (
            // For new influencers, show the overview form directly
            <InfluencerOverviewTab
              influencer={influencer}
              formData={formData}
              onChange={handleChange}
              rates={rates}
              onRatesChange={handleRatesChange}
              mediaKits={mediaKits}
              onMediaKitUpload={handleMediaKitUpload}
              onMediaKitDelete={handleMediaKitDelete}
            />
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

    {/* Deal Edit Dialog */}
    {selectedDeal && influencer && (
      <DealDialog
        open={dealDialogOpen}
        onClose={handleCloseDealDialog}
        onSave={handleDealSave}
        influencer={influencer}
        campaign={selectedDeal.campaign}
        deal={selectedDeal}
      />
    )}
    </>
  );
}

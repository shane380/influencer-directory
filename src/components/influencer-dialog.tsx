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
import { InfluencerContractsTab } from "@/components/influencer-contracts-tab";
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
import { AlertTriangle, Pencil, Plus, DollarSign } from "lucide-react";

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
  whitelisting_enabled: false,
  whitelisting_type: null,
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

  // Content count
  const [contentCount, setContentCount] = useState(0);

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
        whitelisting_enabled: influencer.whitelisting_enabled,
        whitelisting_type: influencer.whitelisting_type,
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
          .eq("influencer_id", influencer.id);

        if (error) throw error;

        // Sort by campaign start_date descending (most recent first)
        const historyData = data as CampaignHistoryItem[] || [];
        const sortedData = historyData.sort((a, b) => {
          const dateA = a.campaign?.start_date || "";
          const dateB = b.campaign?.start_date || "";
          return dateB.localeCompare(dateA);
        });

        setCampaignHistory(sortedData);

        // Update influencer's partnership_type and status from most recent campaign
        if (sortedData.length > 0) {
          const mostRecent = sortedData[0];
          setFormData((prev) => ({
            ...prev,
            partnership_type: mostRecent.partnership_type,
            relationship_status: mostRecent.status,
          }));
        }
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

  // Fetch content count
  useEffect(() => {
    async function fetchContentCount() {
      if (!influencer || !open) {
        setContentCount(0);
        return;
      }

      try {
        const { count, error } = await supabase
          .from("content")
          .select("*", { count: "exact", head: true })
          .eq("influencer_id", influencer.id);

        if (!error && count !== null) {
          setContentCount(count);
        }
      } catch (err) {
        console.error("Failed to fetch content count:", err);
      }
    }

    fetchContentCount();
  }, [influencer, open, supabase]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const newValue =
      type === "checkbox"
        ? (e.target as HTMLInputElement).checked
        : type === "number"
        ? value === ""
          ? 0
          : parseFloat(value)
        : value || null;

    setFormData((prev) => {
      const updated = { ...prev, [name]: newValue };
      // Clear whitelisting_type when whitelisting_enabled is turned off
      if (name === "whitelisting_enabled" && !newValue) {
        updated.whitelisting_type = null;
      }
      return updated;
    });
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

  const handleToggleMilestonePaid = async (deal: CampaignDeal & { campaign: Campaign }, milestoneId: string) => {
    if (!deal.payment_terms) return;

    const updatedMilestones = deal.payment_terms.map((m) => {
      if (m.id !== milestoneId) return m;
      const nowPaid = !m.is_paid;
      return {
        ...m,
        is_paid: nowPaid,
        paid_date: nowPaid ? new Date().toISOString().split("T")[0] : null,
        paid_by: nowPaid ? currentUserId : null,
      };
    });

    // Calculate new payment status
    const allPaid = updatedMilestones.every((m) => m.is_paid);
    const somePaid = updatedMilestones.some((m) => m.is_paid);
    const newPaymentStatus = allPaid ? "paid_in_full" : somePaid ? "deposit_paid" : "not_paid";

    // Update in database
    const { error } = await supabase
      .from("campaign_deals")
      .update({
        payment_terms: updatedMilestones,
        payment_status: newPaymentStatus,
        updated_by: currentUserId,
      } as never)
      .eq("id", deal.id);

    if (!error) {
      // Update local state
      setDeals((prev) =>
        prev.map((d) =>
          d.id === deal.id
            ? { ...d, payment_terms: updatedMilestones, payment_status: newPaymentStatus as any }
            : d
        )
      );
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
          .eq("id", influencer.id)
          .select();

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
                {(influencer.partnership_type === "paid" || influencer.whitelisting_enabled) && (
                  <TabsTrigger value="contracts">Contracts</TabsTrigger>
                )}
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
                  <InfluencerContentTab influencerId={influencer.id} />
                </TabsContent>

                <TabsContent value="deal" className="mt-0 h-full w-full">
                  <div className="p-4 space-y-4">
                    {loadingDeals ? (
                      <div className="text-center text-gray-500 py-8">Loading deals...</div>
                    ) : deals.length === 0 ? (
                      <div className="text-center py-8">
                        <DollarSign className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p className="text-gray-500">No paid collaborations</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-3"
                          onClick={() => handleOpenDealDialog({
                            id: "",
                            campaign_id: "",
                            influencer_id: influencer?.id || "",
                            deliverables: [],
                            total_deal_value: 0,
                            deal_status: "negotiating",
                            payment_status: "not_paid",
                            payment_terms: null,
                            deposit_amount: null,
                            deposit_paid_date: null,
                            final_paid_date: null,
                            notes: null,
                            content_status: "not_started",
                            content_live_date: null,
                            content_status_updated_by: null,
                            content_status_updated_at: null,
                            whitelisting_status: "not_applicable",
                            whitelisting_live_date: null,
                            whitelisting_status_updated_by: null,
                            whitelisting_status_updated_at: null,
                            created_by: null,
                            updated_by: null,
                            created_at: "",
                            updated_at: "",
                            campaign: {} as Campaign,
                          })}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Deal
                        </Button>
                      </div>
                    ) : (
                      // Sort deals by campaign start_date (most recent first)
                      [...deals]
                        .sort((a, b) => {
                          const dateA = a.campaign?.start_date || "";
                          const dateB = b.campaign?.start_date || "";
                          return dateB.localeCompare(dateA);
                        })
                        .map((deal) => {
                          const formatCurrency = (amount: number) => {
                            return new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            }).format(amount);
                          };

                          const formatMonth = (dateString: string | null) => {
                            if (!dateString) return "No date";
                            const dateParts = dateString.split('T')[0].split('-');
                            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                              'July', 'August', 'September', 'October', 'November', 'December'];
                            return `${monthNames[parseInt(dateParts[1], 10) - 1]} ${dateParts[0]}`;
                          };

                          const getDealStatusLabel = (status: string) => {
                            switch (status) {
                              case "negotiating": return "Negotiating";
                              case "confirmed": return "Confirmed";
                              case "cancelled": return "Cancelled";
                              default: return status;
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

                          const getPaymentStatusLabel = () => {
                            if (!deal.payment_terms || deal.payment_terms.length === 0) {
                              return deal.payment_status === 'paid_in_full' ? 'Paid' : 'Not Paid';
                            }
                            const paidCount = deal.payment_terms.filter((m) => m.is_paid).length;
                            if (paidCount === 0) return 'Not Paid';
                            if (paidCount === deal.payment_terms.length) return 'Paid';
                            return 'Partial';
                          };

                          const getPaymentStatusColor = () => {
                            const label = getPaymentStatusLabel();
                            if (label === 'Paid') return 'text-green-600';
                            if (label === 'Partial') return 'text-yellow-600';
                            return 'text-gray-500';
                          };

                          return (
                            <div key={deal.id} className="border rounded-lg overflow-hidden">
                              {/* Header: Month + Amount */}
                              <div className="px-4 py-3 bg-gray-50 flex items-center justify-between">
                                <span className="font-semibold text-gray-900">
                                  {formatMonth(deal.campaign?.start_date)}
                                </span>
                                <span className="text-lg font-bold text-gray-900">
                                  {formatCurrency(deal.total_deal_value)}
                                </span>
                              </div>

                              {/* Status row + Edit button */}
                              <div className="px-4 py-2 border-b flex items-center justify-between">
                                <div className="flex items-center gap-3 text-xs text-gray-500">
                                  <span>Deal: <span className="text-gray-700">{getDealStatusLabel(deal.deal_status || "negotiating")}</span></span>
                                  <span className="text-gray-300">·</span>
                                  <span>Content: <span className="text-gray-700">{getContentStatusLabel(deal.content_status || "not_started")}</span></span>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => handleOpenDealDialog(deal)}
                                >
                                  <Pencil className="h-3 w-3 mr-1" />
                                  Update
                                </Button>
                              </div>

                              {/* Deliverables */}
                              {deal.deliverables && deal.deliverables.length > 0 && (
                                <div className="px-4 py-3 border-b">
                                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Deliverables</p>
                                  <ul className="text-sm space-y-1">
                                    {deal.deliverables.map((d: { description: string; quantity: number; rate: number }, idx: number) => (
                                      <li key={idx} className="flex justify-between">
                                        <span className="text-gray-700">
                                          {d.quantity > 1 ? `${d.quantity}x ` : ''}{d.description}
                                        </span>
                                        <span className="text-gray-900 font-medium">
                                          {formatCurrency(d.rate * d.quantity)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Payment Terms */}
                              {deal.payment_terms && deal.payment_terms.length > 0 && (
                                <div className="px-4 py-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Payment Terms</p>
                                    <span className={`text-xs font-medium ${getPaymentStatusColor()}`}>
                                      {getPaymentStatusLabel()}
                                    </span>
                                  </div>
                                  <ul className="space-y-2">
                                    {deal.payment_terms.map((milestone: { id: string; description: string; percentage: number; amount: number; is_paid: boolean; paid_date: string | null; paid_by?: string | null }) => (
                                      <li key={milestone.id} className="flex items-center justify-between">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={milestone.is_paid}
                                            onChange={() => handleToggleMilestonePaid(deal, milestone.id)}
                                            className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                          />
                                          <span className={milestone.is_paid ? 'text-gray-400 line-through text-sm' : 'text-gray-700 text-sm'}>
                                            {milestone.description} ({milestone.percentage}%)
                                          </span>
                                        </label>
                                        <span className={milestone.is_paid ? 'text-green-600 text-sm font-medium' : 'text-gray-600 text-sm'}>
                                          {milestone.is_paid ? 'Paid' : formatCurrency(milestone.amount)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Notes (if any) */}
                              {deal.notes && (
                                <div className="px-4 py-2 border-t bg-gray-50">
                                  <p className="text-xs text-gray-500">{deal.notes}</p>
                                </div>
                              )}
                            </div>
                          );
                        })
                    )}
                  </div>
                </TabsContent>

                {(influencer.partnership_type === "paid" || influencer.whitelisting_enabled) && (
                  <TabsContent value="contracts" className="mt-0 h-full w-full">
                    <InfluencerContractsTab influencer={influencer} />
                  </TabsContent>
                )}
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

"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Influencer,
  Campaign,
  CampaignInfluencer,
  CampaignDeal,
  PartnershipType,
  Tier,
  RelationshipStatus,
  CampaignStatus,
  Profile,
  ShopifyOrderStatus,
  ContentPostedType,
  ApprovalStatus,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { InfluencerDialog } from "@/components/influencer-dialog";
import { CampaignDialog } from "@/components/campaign-dialog";
import { AddInfluencerDialog } from "@/components/add-influencer-dialog";
import { OrderDialog } from "@/components/order-dialog";
import { DealDialog } from "@/components/deal-dialog";
import { DealSummaryBadge } from "@/components/deal-summary-badge";
import { ApprovalDialog } from "@/components/approval-dialog";
import { BulkActionBar } from "@/components/bulk-action-bar";
import {
  Plus,
  Search,
  ArrowUpDown,
  Settings,
  Calendar,
  Trash2,
  ShoppingCart,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Sidebar } from "@/components/sidebar";

type SortField = "name" | "follower_count" | "added_at";
type SortDirection = "asc" | "desc";

const tierColors: Record<Tier, string> = {
  S: "bg-purple-100 text-purple-800",
  A: "bg-blue-100 text-blue-800",
  B: "bg-green-100 text-green-800",
  C: "bg-gray-100 text-gray-800",
};

// Muted status colors - gray background with colored dot
const statusColors: Record<RelationshipStatus, string> = {
  prospect: "bg-gray-50 text-gray-600",
  contacted: "bg-gray-50 text-gray-600",
  followed_up: "bg-gray-50 text-gray-600",
  lead_dead: "bg-gray-50 text-gray-600",
  creator_wants_paid: "bg-gray-50 text-gray-600",
  order_placed: "bg-gray-50 text-gray-600",
  order_delivered: "bg-gray-50 text-gray-600",
  order_follow_up_sent: "bg-gray-50 text-gray-600",
  order_follow_up_two_sent: "bg-gray-50 text-gray-600",
  posted: "bg-gray-50 text-gray-600",
};

// Colored dots for status indicators - simplified colors
// Gray = neutral/in progress, Orange = needs action, Green = complete, Red = issues
const statusDots: Record<RelationshipStatus, string> = {
  prospect: "bg-gray-300",
  contacted: "bg-gray-400",
  followed_up: "bg-gray-400",
  lead_dead: "bg-red-400",
  creator_wants_paid: "bg-red-400",
  order_placed: "bg-orange-400",
  order_delivered: "bg-green-500",
  order_follow_up_sent: "bg-orange-400",
  order_follow_up_two_sent: "bg-orange-400",
  posted: "bg-green-500",
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

// Muted partnership colors - subtle backgrounds
const partnershipTypeColors: Record<PartnershipType, string> = {
  unassigned: "bg-gray-50 text-gray-600",
  gifted_no_ask: "bg-gray-50 text-gray-600",
  gifted_soft_ask: "bg-gray-50 text-gray-600",
  gifted_deliverable_ask: "bg-gray-50 text-gray-600",
  gifted_recurring: "bg-gray-50 text-gray-600",
  paid: "bg-gray-50 text-gray-600",
};

// Colored dots for partnership indicators
const partnershipDots: Record<PartnershipType, string> = {
  unassigned: "bg-red-400",
  gifted_no_ask: "bg-gray-400",
  gifted_soft_ask: "bg-blue-400",
  gifted_deliverable_ask: "bg-amber-400",
  gifted_recurring: "bg-emerald-400",
  paid: "bg-purple-500",
};

const campaignStatusColors: Record<CampaignStatus, string> = {
  planning: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-800",
  cancelled: "bg-red-100 text-red-800",
};

const campaignStatusLabels: Record<CampaignStatus, string> = {
  planning: "Planning",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

// Muted order status colors
const orderStatusColors: Record<ShopifyOrderStatus, string> = {
  draft: "bg-gray-50 text-gray-600",
  placed: "bg-gray-50 text-gray-600",
  fulfilled: "bg-gray-50 text-gray-600",
};

// Colored dots for order status
const orderDots: Record<ShopifyOrderStatus, string> = {
  draft: "bg-amber-400",
  placed: "bg-blue-400",
  fulfilled: "bg-green-500",
};

const orderStatusLabels: Record<ShopifyOrderStatus, string> = {
  draft: "Draft",
  placed: "Placed",
  fulfilled: "Fulfilled",
};

const contentPostedLabels: Record<ContentPostedType, string> = {
  none: "No Content",
  stories: "Stories",
  in_feed_post: "In Feed Post",
  reel: "Reel",
  tiktok: "TikTok",
};

// Muted content posted colors
const contentPostedColors: Record<ContentPostedType, string> = {
  none: "bg-gray-50 text-gray-500",
  stories: "bg-gray-50 text-gray-600",
  in_feed_post: "bg-gray-50 text-gray-600",
  reel: "bg-gray-50 text-gray-600",
  tiktok: "bg-gray-50 text-gray-600",
};

// Colored dots for content indicators
const contentDots: Record<ContentPostedType, string> = {
  none: "bg-gray-300",
  stories: "bg-pink-400",
  in_feed_post: "bg-blue-400",
  reel: "bg-purple-400",
  tiktok: "bg-gray-800",
};

interface CampaignInfluencerWithDetails extends CampaignInfluencer {
  influencer: Influencer;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [campaignInfluencers, setCampaignInfluencers] = useState<CampaignInfluencerWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [partnershipTypeFilter, setPartnershipTypeFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [influencerDialogOpen, setInfluencerDialogOpen] = useState(false);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [addInfluencerDialogOpen, setAddInfluencerDialogOpen] = useState(false);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [selectedCampaignInfluencer, setSelectedCampaignInfluencer] = useState<CampaignInfluencerWithDetails | null>(null);
  const [deals, setDeals] = useState<Map<string, CampaignDeal>>(new Map());
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [selectedDealInfluencer, setSelectedDealInfluencer] = useState<CampaignInfluencerWithDetails | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<string>("all");
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [selectedApprovalInfluencer, setSelectedApprovalInfluencer] = useState<CampaignInfluencerWithDetails | null>(null);
  const [currentUser, setCurrentUser] = useState<{ displayName: string; email: string; profilePhotoUrl: string | null; isAdmin: boolean } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const supabase = createClient();

  const fetchProfiles = useCallback(async () => {
    const { data } = await (supabase.from("profiles") as any)
      .select("*")
      .order("display_name");
    if (data) {
      setProfiles(data);
    }
  }, [supabase]);

  const fetchCurrentUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await (supabase.from("profiles") as any)
        .select("display_name, profile_photo_url, is_admin")
        .eq("id", user.id)
        .single();
      setCurrentUser({
        displayName: profile?.display_name || user.email?.split("@")[0] || "User",
        email: user.email || "",
        profilePhotoUrl: profile?.profile_photo_url || null,
        isAdmin: profile?.is_admin || false,
      });
    }
  }, [supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const fetchCampaign = useCallback(async () => {
    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    if (error) {
      console.error("Error fetching campaign:", error);
      router.push("/");
      return;
    }
    setCampaign(data);
  }, [supabase, campaignId, router]);

  const fetchCampaignInfluencers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("campaign_influencers")
      .select(`
        *,
        influencer:influencers(*)
      `)
      .eq("campaign_id", campaignId);

    if (error) {
      console.error("Error fetching campaign influencers:", error);
    } else {
      setCampaignInfluencers(data || []);
    }
    setLoading(false);
  }, [supabase, campaignId]);

  const fetchDeals = useCallback(async () => {
    const { data, error } = await supabase
      .from("campaign_deals")
      .select("*")
      .eq("campaign_id", campaignId);

    if (error) {
      console.error("Error fetching deals:", error);
    } else {
      const dealsMap = new Map<string, CampaignDeal>();
      (data || []).forEach((deal: CampaignDeal) => {
        dealsMap.set(deal.influencer_id, deal);
      });
      setDeals(dealsMap);
    }
  }, [supabase, campaignId]);

  useEffect(() => {
    fetchCampaign();
    fetchCampaignInfluencers();
    fetchProfiles();
    fetchDeals();
    fetchCurrentUser();
  }, [fetchCampaign, fetchCampaignInfluencers, fetchProfiles, fetchDeals, fetchCurrentUser]);

  // Clear selection when filters change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, partnershipTypeFilter, approvalFilter, search]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleOpenInfluencerDialog = (influencer?: Influencer) => {
    setSelectedInfluencer(influencer || null);
    setInfluencerDialogOpen(true);
  };

  const handleCloseInfluencerDialog = () => {
    setInfluencerDialogOpen(false);
    setSelectedInfluencer(null);
  };

  const handleInfluencerSave = () => {
    handleCloseInfluencerDialog();
    fetchCampaignInfluencers();
  };

  const handleOpenCampaignDialog = () => {
    setCampaignDialogOpen(true);
  };

  const handleCloseCampaignDialog = () => {
    setCampaignDialogOpen(false);
  };

  const handleCampaignSave = () => {
    handleCloseCampaignDialog();
    fetchCampaign();
    fetchCampaignInfluencers();
  };

  // Update campaign-specific status
  const handleStatusChange = async (campaignInfluencerId: string, newStatus: RelationshipStatus) => {
    const { error } = await (supabase.from("campaign_influencers") as any).update({
      status: newStatus,
    }).eq("id", campaignInfluencerId);

    if (error) {
      console.error("Error updating status:", error);
    } else {
      fetchCampaignInfluencers();
    }
  };

  // Update campaign-specific partnership type and also update the influencer's global partnership type
  const handlePartnershipTypeChange = async (campaignInfluencerId: string, influencerId: string, newType: PartnershipType) => {
    // Update campaign-specific partnership type
    const { error: campaignError } = await (supabase.from("campaign_influencers") as any).update({
      partnership_type: newType,
    }).eq("id", campaignInfluencerId);

    if (campaignError) {
      console.error("Error updating campaign partnership type:", campaignError);
      return;
    }

    // Also update the influencer's global partnership type
    const { error: influencerError } = await (supabase.from("influencers") as any).update({
      partnership_type: newType,
    }).eq("id", influencerId);

    if (influencerError) {
      console.error("Error updating influencer partnership type:", influencerError);
    }

    fetchCampaignInfluencers();
  };

  // Remove influencer from campaign (not delete their profile)
  const handleRemoveFromCampaign = async (campaignInfluencerId: string, influencerName: string) => {
    if (!confirm(`Remove ${influencerName} from this campaign?`)) return;

    const { error } = await supabase
      .from("campaign_influencers")
      .delete()
      .eq("id", campaignInfluencerId);

    if (error) {
      console.error("Error removing influencer from campaign:", error);
    } else {
      fetchCampaignInfluencers();
    }
  };

  // Update influencer owner
  const handleOwnerChange = async (influencerId: string, newOwnerId: string | null) => {
    const { error } = await (supabase.from("influencers") as any)
      .update({ assigned_to: newOwnerId })
      .eq("id", influencerId);

    if (error) {
      console.error("Error updating owner:", error);
    } else {
      fetchCampaignInfluencers();
    }
  };

  // Open order dialog
  const handleOpenOrderDialog = (ci: CampaignInfluencerWithDetails) => {
    setSelectedCampaignInfluencer(ci);
    setOrderDialogOpen(true);
  };

  // Close order dialog
  const handleCloseOrderDialog = () => {
    setOrderDialogOpen(false);
    setSelectedCampaignInfluencer(null);
  };

  // Handle order save
  const handleOrderSave = () => {
    fetchCampaignInfluencers();
  };

  // Open deal dialog
  const handleOpenDealDialog = (ci: CampaignInfluencerWithDetails) => {
    setSelectedDealInfluencer(ci);
    setDealDialogOpen(true);
  };

  // Close deal dialog
  const handleCloseDealDialog = () => {
    setDealDialogOpen(false);
    setSelectedDealInfluencer(null);
  };

  // Handle deal save
  const handleDealSave = () => {
    fetchDeals();
  };

  // Open approval dialog
  const handleOpenApprovalDialog = (ci: CampaignInfluencerWithDetails) => {
    setSelectedApprovalInfluencer(ci);
    setApprovalDialogOpen(true);
  };

  // Close approval dialog
  const handleCloseApprovalDialog = () => {
    setApprovalDialogOpen(false);
    setSelectedApprovalInfluencer(null);
  };

  // Handle approval save
  const handleApprovalSave = () => {
    fetchCampaignInfluencers();
  };

  // Update content posted
  const handleContentPostedChange = async (campaignInfluencerId: string, newContent: ContentPostedType) => {
    const { error } = await (supabase.from("campaign_influencers") as any).update({
      content_posted: newContent,
    }).eq("id", campaignInfluencerId);

    if (error) {
      console.error("Error updating content posted:", error);
    } else {
      fetchCampaignInfluencers();
    }
  };

  // Filter and sort the influencers
  const filteredInfluencers = useMemo(() => campaignInfluencers
    .filter((ci) => {
      const influencer = ci.influencer;
      if (statusFilter !== "all" && ci.status !== statusFilter) return false;
      if (partnershipTypeFilter !== "all" && ci.partnership_type !== partnershipTypeFilter) return false;
      // Approval filter
      if (approvalFilter === "pending" && ci.approval_status !== "pending") return false;
      if (approvalFilter === "needs_review" && ci.approval_status !== "pending") return false;
      if (approvalFilter === "approved" && ci.approval_status !== "approved") return false;
      if (approvalFilter === "declined" && ci.approval_status !== "declined") return false;
      if (search) {
        const searchLower = search.toLowerCase();
        return (
          influencer.name.toLowerCase().includes(searchLower) ||
          influencer.instagram_handle.toLowerCase().includes(searchLower) ||
          (influencer.email?.toLowerCase().includes(searchLower) ?? false)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const multiplier = sortDirection === "asc" ? 1 : -1;
      if (sortField === "name") {
        return multiplier * a.influencer.name.localeCompare(b.influencer.name);
      } else if (sortField === "follower_count") {
        return multiplier * (a.influencer.follower_count - b.influencer.follower_count);
      } else if (sortField === "added_at") {
        return multiplier * (new Date(a.added_at).getTime() - new Date(b.added_at).getTime());
      }
      return 0;
    }), [campaignInfluencers, statusFilter, partnershipTypeFilter, approvalFilter, search, sortField, sortDirection]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString();
  };

  if (!campaign) {
    return (
      <div className="min-h-screen bg-gray-50 flex">
        <Sidebar
          activeTab="campaigns"
          onTabChange={(tab) => router.push(`/?tab=${tab}`)}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
        <div className="flex-1 ml-48 flex items-center justify-center">
          <div className="text-gray-500">Loading campaign...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar
        activeTab="campaigns"
        onTabChange={(tab) => router.push(`/?tab=${tab}`)}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      <main className="flex-1 ml-48 px-8 pt-12 pb-8 min-w-0">
        {/* Campaign Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <Badge className={campaignStatusColors[campaign.status]}>
              {campaignStatusLabels[campaign.status]}
            </Badge>
          </div>
          {campaign.description && (
            <p className="text-gray-600 mt-1">{campaign.description}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {campaign.start_date ? formatDate(campaign.start_date) : "No start date"}
              {campaign.end_date && <> - {formatDate(campaign.end_date)}</>}
            </div>
          </div>
          {/* Stats Summary Line */}
              {(() => {
                // Partnership breakdown
                const seeding = campaignInfluencers.filter((ci) =>
                  ["gifted_no_ask", "gifted_soft_ask", "gifted_deliverable_ask"].includes(ci.partnership_type)
                ).length;
                const recurring = campaignInfluencers.filter((ci) => ci.partnership_type === "gifted_recurring").length;
                const paid = campaignInfluencers.filter((ci) => ci.partnership_type === "paid").length;

                // Status breakdown
                const outreach = campaignInfluencers.filter((ci) =>
                  ["prospect", "contacted", "followed_up"].includes(ci.status)
                ).length;
                const orderPlaced = campaignInfluencers.filter((ci) => ci.status === "order_placed").length;
                const delivered = campaignInfluencers.filter((ci) => ci.status === "order_delivered").length;
                const followUp = campaignInfluencers.filter((ci) =>
                  ["order_follow_up_sent", "order_follow_up_two_sent"].includes(ci.status)
                ).length;
                const posted = campaignInfluencers.filter((ci) => ci.status === "posted").length;
                const deadLeads = campaignInfluencers.filter((ci) =>
                  ["lead_dead", "creator_wants_paid"].includes(ci.status)
                ).length;

                // Content breakdown
                const stories = campaignInfluencers.filter((ci) => ci.content_posted === "stories").length;
                const inFeed = campaignInfluencers.filter((ci) => ci.content_posted === "in_feed_post").length;
                const reels = campaignInfluencers.filter((ci) => ci.content_posted === "reel").length;
                const tiktoks = campaignInfluencers.filter((ci) => ci.content_posted === "tiktok").length;
                const totalContent = stories + inFeed + reels + tiktoks;

                return (
                  <div className="flex items-center gap-1 mt-3 text-sm text-gray-700">
                    <Tooltip
                      content={
                        <div className="space-y-1">
                          <div>{seeding} Seeding</div>
                          <div>{recurring} Recurring</div>
                          <div>{paid} Paid</div>
                        </div>
                      }
                    >
                      <span className="hover:text-gray-900">{campaignInfluencers.length} influencers</span>
                    </Tooltip>
                    <span className="text-gray-400 mx-1">·</span>
                    <Tooltip
                      content={
                        <div className="space-y-1">
                          {outreach > 0 && <div>{outreach} Outreach</div>}
                          {orderPlaced > 0 && <div>{orderPlaced} Placed</div>}
                          {delivered > 0 && <div>{delivered} Delivered</div>}
                          {followUp > 0 && <div>{followUp} Follow Up</div>}
                          {posted > 0 && <div>{posted} Posted</div>}
                          {deadLeads > 0 && <div>{deadLeads} Dead Leads</div>}
                        </div>
                      }
                    >
                      <span className="hover:text-gray-900">{delivered} delivered</span>
                    </Tooltip>
                    <span className="text-gray-400 mx-1">·</span>
                    <Tooltip
                      content={
                        totalContent > 0 ? (
                          <div className="space-y-1">
                            {stories > 0 && <div>{stories} {stories === 1 ? "Story" : "Stories"}</div>}
                            {inFeed > 0 && <div>{inFeed} {inFeed === 1 ? "Post" : "Posts"}</div>}
                            {reels > 0 && <div>{reels} {reels === 1 ? "Reel" : "Reels"}</div>}
                            {tiktoks > 0 && <div>{tiktoks} {tiktoks === 1 ? "TikTok" : "TikToks"}</div>}
                          </div>
                        ) : (
                          <div>No content posted yet</div>
                        )
                      }
                    >
                      <span className="hover:text-gray-900">{totalContent} content posted</span>
                    </Tooltip>
                  </div>
                );
              })()}
          <div className="flex gap-2 mt-4">
            {campaign.collection_deck_url && (
              <Button
                variant="outline"
                onClick={() => window.open(campaign.collection_deck_url!, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Collection Deck
              </Button>
            )}
            <Button variant="outline" onClick={handleOpenCampaignDialog}>
              <Settings className="h-4 w-4 mr-2" />
              Edit Campaign
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
            <Input
              placeholder="Search by name, handle, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 w-full"
            />
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto sm:w-[180px] flex-shrink-0">
            <option value="all">All Statuses</option>
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
          <Select value={partnershipTypeFilter} onChange={(e) => setPartnershipTypeFilter(e.target.value)} className="w-auto sm:w-[180px] flex-shrink-0">
            <option value="all">All Partnership Types</option>
            <option value="unassigned">Unassigned</option>
            <option value="gifted_no_ask">Gifted No Ask</option>
            <option value="gifted_soft_ask">Gifted Soft Ask</option>
            <option value="gifted_deliverable_ask">Gifted Deliverable Ask</option>
            <option value="gifted_recurring">Gifted Recurring</option>
            <option value="paid">Paid</option>
          </Select>
          {/* Approval Filter */}
          {(() => {
            const pendingCount = campaignInfluencers.filter(ci => ci.approval_status === "pending").length;
            const hasApprovals = campaignInfluencers.some(ci => ci.approval_status !== null);
            if (!hasApprovals && approvalFilter === "all") return null;
            return (
              <Select
                value={approvalFilter}
                onChange={(e) => setApprovalFilter(e.target.value)}
                className={`w-auto sm:w-[160px] flex-shrink-0 ${pendingCount > 0 && approvalFilter === "all" ? "border-amber-300 bg-amber-50" : ""}`}
              >
                <option value="all">
                  {pendingCount > 0 ? `Approvals (${pendingCount})` : "All Approvals"}
                </option>
                <option value="pending">Pending ({pendingCount})</option>
                <option value="approved">Approved</option>
                <option value="declined">Declined</option>
              </Select>
            );
          })()}
          <Button onClick={() => setAddInfluencerDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Influencer
          </Button>
        </div>

        {/* Influencer Table */}
        <div className={`bg-white rounded-lg border shadow-sm overflow-x-auto ${selectedIds.size > 0 ? "pb-20" : ""}`}>
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filteredInfluencers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {campaignInfluencers.length === 0
                ? "No influencers in this campaign yet. Click 'Add Influencer' to get started!"
                : "No influencers match your filters."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedIds.size === filteredInfluencers.length && filteredInfluencers.length > 0}
                      indeterminate={selectedIds.size > 0 && selectedIds.size < filteredInfluencers.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(filteredInfluencers.map((ci) => ci.influencer_id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                    />
                  </TableHead>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-gray-900"
                      onClick={() => handleSort("name")}
                    >
                      Name
                      <ArrowUpDown className="h-4 w-4" />
                    </button>
                  </TableHead>
                  <TableHead>Handle</TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-gray-900"
                      onClick={() => handleSort("follower_count")}
                    >
                      Followers
                      <ArrowUpDown className="h-4 w-4" />
                    </button>
                  </TableHead>
                  <TableHead>Partnership</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>
                    <button
                      className="flex items-center gap-1 hover:text-gray-900"
                      onClick={() => handleSort("added_at")}
                    >
                      Added
                      <ArrowUpDown className="h-4 w-4" />
                    </button>
                  </TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Content Posted</TableHead>
                  <TableHead>Deal</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInfluencers.map((ci) => (
                  <TableRow
                    key={ci.id}
                    className="cursor-pointer hover:bg-gray-50 transition-colors"
                    data-state={selectedIds.has(ci.influencer_id) ? "selected" : undefined}
                    onClick={() => handleOpenInfluencerDialog(ci.influencer)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(ci.influencer_id)}
                        onChange={() => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(ci.influencer_id)) {
                              next.delete(ci.influencer_id);
                            } else {
                              next.add(ci.influencer_id);
                            }
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="w-14 h-14 flex-shrink-0">
                        {ci.influencer.profile_photo_url ? (
                          <Image
                            src={ci.influencer.profile_photo_url}
                            alt={ci.influencer.name}
                            width={56}
                            height={56}
                            className="rounded-full object-cover w-full h-full"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center">
                            <span className="text-gray-500 text-lg font-medium">
                              {ci.influencer.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {ci.influencer.name}
                        {ci.approval_status && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenApprovalDialog(ci);
                            }}
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors ${
                              ci.approval_status === "pending"
                                ? "bg-amber-100 text-amber-600 hover:bg-amber-200"
                                : ci.approval_status === "approved"
                                ? "bg-green-100 text-green-600 hover:bg-green-200"
                                : "bg-red-100 text-red-600 hover:bg-red-200"
                            }`}
                            title={
                              ci.approval_status === "pending"
                                ? "Pending approval"
                                : ci.approval_status === "approved"
                                ? "Approved"
                                : "Declined"
                            }
                          >
                            {ci.approval_status === "pending" && <Clock className="h-3 w-3" />}
                            {ci.approval_status === "approved" && <CheckCircle2 className="h-3 w-3" />}
                            {ci.approval_status === "declined" && <XCircle className="h-3 w-3" />}
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-600">@{ci.influencer.instagram_handle}</TableCell>
                    <TableCell className="text-xs text-gray-600">{formatNumber(ci.influencer.follower_count)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={ci.partnership_type}
                        onChange={(e) => handlePartnershipTypeChange(ci.id, ci.influencer_id, e.target.value as PartnershipType)}
                        className="text-xs h-8 w-[100px] bg-transparent border-0 text-gray-600 px-0 focus:ring-0"
                        truncate
                        title={partnershipTypeLabels[ci.partnership_type]}
                      >
                        <option value="unassigned">Unassigned</option>
                        <option value="gifted_no_ask">Gifted</option>
                        <option value="gifted_soft_ask">Soft Ask</option>
                        <option value="gifted_deliverable_ask">Deliverable</option>
                        <option value="gifted_recurring">Recurring</option>
                        <option value="paid">Paid</option>
                      </Select>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDots[ci.status]}`}></span>
                        <Select
                          value={ci.status}
                          onChange={(e) => handleStatusChange(ci.id, e.target.value as RelationshipStatus)}
                          className="text-xs h-8 w-[110px] bg-transparent border-0 text-gray-700 px-0 focus:ring-0"
                          truncate
                          title={statusLabels[ci.status]}
                        >
                          <option value="prospect">Prospect</option>
                          <option value="contacted">Contacted</option>
                          <option value="followed_up">Followed Up</option>
                          <option value="lead_dead">Lead Dead</option>
                          <option value="creator_wants_paid">Wants Paid</option>
                          <option value="order_placed">Order Placed</option>
                          <option value="order_delivered">Delivered</option>
                          <option value="order_follow_up_sent">Follow Up 1</option>
                          <option value="order_follow_up_two_sent">Follow Up 2</option>
                          <option value="posted">Posted</option>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={ci.influencer.assigned_to || ""}
                        onChange={(e) => handleOwnerChange(ci.influencer.id, e.target.value || null)}
                        className="text-xs h-8 w-[90px] bg-transparent border-0 text-gray-600 px-0 focus:ring-0"
                        truncate
                        title={profiles.find(p => p.id === ci.influencer.assigned_to)?.display_name || "—"}
                      >
                        <option value="">—</option>
                        {profiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.display_name}
                          </option>
                        ))}
                      </Select>
                    </TableCell>
                    <TableCell className="text-gray-600">{formatDate(ci.added_at)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {ci.shopify_order_id ? (
                        <button
                          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                          onClick={() => handleOpenOrderDialog(ci)}
                        >
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${orderDots[ci.shopify_order_status || "draft"]}`}></span>
                          {orderStatusLabels[ci.shopify_order_status || "draft"]}
                        </button>
                      ) : ci.product_selections && (ci.product_selections as any[]).length > 0 ? (
                        <button
                          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                          onClick={() => handleOpenOrderDialog(ci)}
                        >
                          <span className="w-2 h-2 rounded-full flex-shrink-0 bg-purple-400"></span>
                          {(ci.product_selections as any[]).length} items
                        </button>
                      ) : (
                        <button
                          className="text-xs text-gray-400 hover:text-gray-600"
                          onClick={() => handleOpenOrderDialog(ci)}
                        >
                          <ShoppingCart className="h-4 w-4" />
                        </button>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {ci.content_posted && ci.content_posted !== "none" ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${contentDots[ci.content_posted]}`}></span>
                          <Select
                            value={ci.content_posted}
                            onChange={(e) => handleContentPostedChange(ci.id, e.target.value as ContentPostedType)}
                            className="text-xs h-8 w-[75px] bg-transparent border-0 text-gray-700 px-0 focus:ring-0"
                            truncate
                            title={contentPostedLabels[ci.content_posted]}
                          >
                            <option value="none">—</option>
                            <option value="stories">Stories</option>
                            <option value="in_feed_post">Post</option>
                            <option value="reel">Reel</option>
                            <option value="tiktok">TikTok</option>
                          </Select>
                        </div>
                      ) : (
                        <Select
                          value="none"
                          onChange={(e) => handleContentPostedChange(ci.id, e.target.value as ContentPostedType)}
                          className="text-xs h-8 w-[60px] bg-transparent border-0 text-gray-300 px-0 focus:ring-0"
                          truncate
                          title="—"
                        >
                          <option value="none">—</option>
                          <option value="stories">Stories</option>
                          <option value="in_feed_post">Post</option>
                          <option value="reel">Reel</option>
                          <option value="tiktok">TikTok</option>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {ci.partnership_type === "paid" ? (
                        <DealSummaryBadge
                          deal={deals.get(ci.influencer_id) || null}
                          onClick={() => handleOpenDealDialog(ci)}
                        />
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-400 hover:text-red-600"
                        onClick={() => handleRemoveFromCampaign(ci.id, ci.influencer.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="mt-4 text-sm text-gray-500">
          Showing {filteredInfluencers.length} of {campaignInfluencers.length} influencers in this campaign
        </div>

        {selectedIds.size > 0 && (
          <BulkActionBar
            selectedCount={selectedIds.size}
            selectedInfluencerIds={Array.from(selectedIds)}
            excludeCampaignIds={[campaignId]}
            onAddComplete={() => {
              setSelectedIds(new Set());
              fetchCampaignInfluencers();
            }}
            onCancel={() => setSelectedIds(new Set())}
          />
        )}
      </main>

      <InfluencerDialog
        open={influencerDialogOpen}
        onClose={handleCloseInfluencerDialog}
        onSave={handleInfluencerSave}
        influencer={selectedInfluencer}
      />

      <CampaignDialog
        open={campaignDialogOpen}
        onClose={handleCloseCampaignDialog}
        onSave={handleCampaignSave}
        campaign={campaign}
      />

      <AddInfluencerDialog
        open={addInfluencerDialogOpen}
        onClose={() => setAddInfluencerDialogOpen(false)}
        onAdd={() => {
          fetchCampaignInfluencers();
        }}
        campaignId={campaignId}
        existingInfluencerIds={campaignInfluencers.map((ci) => ci.influencer_id)}
      />

      {selectedCampaignInfluencer && (
        <OrderDialog
          open={orderDialogOpen}
          onClose={handleCloseOrderDialog}
          onSave={handleOrderSave}
          influencer={selectedCampaignInfluencer.influencer}
          campaignInfluencer={selectedCampaignInfluencer}
        />
      )}

      {selectedDealInfluencer && campaign && (
        <DealDialog
          open={dealDialogOpen}
          onClose={handleCloseDealDialog}
          onSave={handleDealSave}
          influencer={selectedDealInfluencer.influencer}
          campaign={campaign}
          deal={deals.get(selectedDealInfluencer.influencer_id) || null}
        />
      )}

      {selectedApprovalInfluencer && (
        <ApprovalDialog
          open={approvalDialogOpen}
          onClose={handleCloseApprovalDialog}
          onSave={handleApprovalSave}
          influencer={selectedApprovalInfluencer.influencer}
          campaignInfluencer={selectedApprovalInfluencer}
          profiles={profiles}
        />
      )}
    </div>
  );
}

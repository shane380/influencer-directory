"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Influencer,
  Campaign,
  CampaignInfluencer,
  PartnershipType,
  Tier,
  RelationshipStatus,
  CampaignStatus,
  Profile,
  ShopifyOrderStatus,
} from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InfluencerDialog } from "@/components/influencer-dialog";
import { CampaignDialog } from "@/components/campaign-dialog";
import { AddInfluencerDialog } from "@/components/add-influencer-dialog";
import { OrderDialog } from "@/components/order-dialog";
import {
  Plus,
  Search,
  ArrowUpDown,
  ChevronRight,
  Home,
  Settings,
  Calendar,
  Users,
  Trash2,
  ShoppingCart,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

type SortField = "name" | "follower_count" | "added_at";
type SortDirection = "asc" | "desc";

const tierColors: Record<Tier, string> = {
  S: "bg-purple-100 text-purple-800",
  A: "bg-blue-100 text-blue-800",
  B: "bg-green-100 text-green-800",
  C: "bg-gray-100 text-gray-800",
};

const statusColors: Record<RelationshipStatus, string> = {
  prospect: "bg-gray-100 text-gray-800",
  contacted: "bg-blue-100 text-blue-800",
  followed_up: "bg-yellow-100 text-yellow-800",
  lead_dead: "bg-red-100 text-red-800",
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

const orderStatusColors: Record<ShopifyOrderStatus, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  placed: "bg-blue-100 text-blue-800",
  fulfilled: "bg-green-100 text-green-800",
};

const orderStatusLabels: Record<ShopifyOrderStatus, string> = {
  draft: "Draft",
  placed: "Placed",
  fulfilled: "Fulfilled",
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

  const supabase = createClient();

  const fetchProfiles = useCallback(async () => {
    const { data } = await (supabase.from("profiles") as any)
      .select("*")
      .order("display_name");
    if (data) {
      setProfiles(data);
    }
  }, [supabase]);

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

  useEffect(() => {
    fetchCampaign();
    fetchCampaignInfluencers();
    fetchProfiles();
  }, [fetchCampaign, fetchCampaignInfluencers, fetchProfiles]);

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

  // Update campaign-specific partnership type
  const handlePartnershipTypeChange = async (campaignInfluencerId: string, newType: PartnershipType) => {
    const { error } = await (supabase.from("campaign_influencers") as any).update({
      partnership_type: newType,
    }).eq("id", campaignInfluencerId);

    if (error) {
      console.error("Error updating partnership type:", error);
    } else {
      fetchCampaignInfluencers();
    }
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

  // Filter and sort the influencers
  const filteredInfluencers = campaignInfluencers
    .filter((ci) => {
      const influencer = ci.influencer;
      if (statusFilter !== "all" && ci.status !== statusFilter) return false;
      if (partnershipTypeFilter !== "all" && ci.partnership_type !== partnershipTypeFilter) return false;
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
    });

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading campaign...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Breadcrumbs */}
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
            <Link href="/" className="hover:text-gray-900 flex items-center gap-1">
              <Home className="h-4 w-4" />
              Dashboard
            </Link>
            <ChevronRight className="h-4 w-4" />
            <Link href="/?tab=campaigns" className="hover:text-gray-900">
              Campaigns
            </Link>
            <ChevronRight className="h-4 w-4" />
            <span className="text-gray-900 font-medium">{campaign.name}</span>
          </nav>

          {/* Campaign Header */}
          <div className="flex items-start justify-between">
            <div>
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
              <div className="flex items-center gap-4 mt-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-gray-600">Seeding:</span>
                  <span className="font-medium">
                    {campaignInfluencers.filter((ci) =>
                      ["gifted_no_ask", "gifted_soft_ask", "gifted_deliverable_ask"].includes(ci.partnership_type)
                    ).length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-gray-600">Gifted Recurring:</span>
                  <span className="font-medium">
                    {campaignInfluencers.filter((ci) => ci.partnership_type === "gifted_recurring").length}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                  <span className="text-gray-600">Paid:</span>
                  <span className="font-medium">
                    {campaignInfluencers.filter((ci) => ci.partnership_type === "paid").length}
                  </span>
                </div>
              </div>
            </div>
            <Button variant="outline" onClick={handleOpenCampaignDialog}>
              <Settings className="h-4 w-4 mr-2" />
              Edit Campaign
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
          <Button onClick={() => setAddInfluencerDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Influencer
          </Button>
        </div>

        {/* Influencer Table */}
        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
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
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInfluencers.map((ci) => (
                  <TableRow
                    key={ci.id}
                    className="cursor-pointer"
                    onClick={() => handleOpenInfluencerDialog(ci.influencer)}
                  >
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
                    <TableCell className="font-medium">{ci.influencer.name}</TableCell>
                    <TableCell className="text-gray-600">@{ci.influencer.instagram_handle}</TableCell>
                    <TableCell>{formatNumber(ci.influencer.follower_count)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={ci.partnership_type}
                        onChange={(e) => handlePartnershipTypeChange(ci.id, e.target.value as PartnershipType)}
                        className={`text-xs h-8 w-[130px] ${partnershipTypeColors[ci.partnership_type]} border-0`}
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
                      <Select
                        value={ci.status}
                        onChange={(e) => handleStatusChange(ci.id, e.target.value as RelationshipStatus)}
                        className={`text-xs h-8 w-[120px] ${statusColors[ci.status]} border-0`}
                      >
                        <option value="prospect">Prospect</option>
                        <option value="contacted">Contacted</option>
                        <option value="followed_up">Followed Up</option>
                        <option value="lead_dead">Dead</option>
                        <option value="order_placed">Placed</option>
                        <option value="order_delivered">Delivered</option>
                        <option value="order_follow_up_sent">Follow Up 1</option>
                        <option value="order_follow_up_two_sent">Follow Up 2</option>
                        <option value="posted">Posted</option>
                      </Select>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={ci.influencer.assigned_to || ""}
                        onChange={(e) => handleOwnerChange(ci.influencer.id, e.target.value || null)}
                        className="text-xs h-8 w-[110px]"
                      >
                        <option value="">Unassigned</option>
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
                        <Badge
                          className={`cursor-pointer ${orderStatusColors[ci.shopify_order_status || "draft"]}`}
                          onClick={() => handleOpenOrderDialog(ci)}
                        >
                          {orderStatusLabels[ci.shopify_order_status || "draft"]}
                        </Badge>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenOrderDialog(ci)}
                        >
                          <ShoppingCart className="h-4 w-4 mr-1" />
                          Order
                        </Button>
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
    </div>
  );
}

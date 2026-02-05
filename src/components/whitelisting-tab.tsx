"use client";

import { Influencer, WhitelistingType, CampaignInfluencer, ShopifyOrderStatus, RelationshipStatus } from "@/types/database";
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
import { Search, RefreshCw, Plus, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useState, useMemo } from "react";
import { OrderDialog } from "@/components/order-dialog";

interface WhitelistingTabProps {
  influencers: Influencer[];
  loading: boolean;
  onRefresh: () => void;
  onInfluencerClick: (influencer: Influencer) => void;
  onAddNew: () => void;
}

const whitelistingTypeColors: Record<WhitelistingType, string> = {
  paid: "bg-green-100 text-green-800",
  gifted: "bg-purple-100 text-purple-800",
};

const whitelistingTypeLabels: Record<WhitelistingType, string> = {
  paid: "Paid",
  gifted: "Gifted",
};

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
  order_follow_up_sent: "Follow Up Sent",
  order_follow_up_two_sent: "Follow Up 2 Sent",
  posted: "Posted",
};

// Order status colors and labels
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

export function WhitelistingTab({
  influencers,
  loading,
  onRefresh,
  onInfluencerClick,
  onAddNew,
}: WhitelistingTabProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [selectedInfluencerForOrder, setSelectedInfluencerForOrder] = useState<Influencer | null>(null);

  const handleOpenOrderDialog = (influencer: Influencer, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedInfluencerForOrder(influencer);
    setOrderDialogOpen(true);
  };

  const handleCloseOrderDialog = () => {
    setOrderDialogOpen(false);
    setSelectedInfluencerForOrder(null);
  };

  const handleOrderSave = () => {
    onRefresh();
  };

  // Create a virtual campaign influencer for the order dialog
  const createVirtualCampaignInfluencer = (influencer: Influencer): CampaignInfluencer => ({
    id: `virtual-${influencer.id}`,
    campaign_id: "",
    influencer_id: influencer.id,
    compensation: null,
    notes: null,
    added_at: new Date().toISOString(),
    status: influencer.relationship_status,
    partnership_type: influencer.partnership_type,
    shopify_order_id: null,
    shopify_order_status: null,
    product_selections: null,
    content_posted: "none",
    approval_status: null,
    approval_note: null,
    approved_at: null,
    approved_by: null,
  });

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const filteredInfluencers = useMemo(() => {
    return influencers.filter((influencer) => {
      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const matchesSearch =
          influencer.name.toLowerCase().includes(searchLower) ||
          influencer.instagram_handle.toLowerCase().includes(searchLower) ||
          (influencer.email && influencer.email.toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }

      // Type filter
      if (typeFilter !== "all" && influencer.whitelisting_type !== typeFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== "all" && influencer.relationship_status !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [influencers, search, typeFilter, statusFilter]);

  return (
    <div>
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
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-auto sm:w-[150px] flex-shrink-0"
        >
          <option value="all">All Types</option>
          <option value="paid">Paid</option>
          <option value="gifted">Gifted</option>
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-auto sm:w-[180px] flex-shrink-0"
        >
          <option value="all">All Statuses</option>
          <option value="prospect">Prospect</option>
          <option value="contacted">Contacted</option>
          <option value="followed_up">Followed Up</option>
          <option value="order_placed">Order Placed</option>
          <option value="order_delivered">Order Delivered</option>
          <option value="order_follow_up_sent">Follow Up Sent</option>
          <option value="order_follow_up_two_sent">Follow Up 2 Sent</option>
          <option value="posted">Posted</option>
          <option value="lead_dead">Lead Dead</option>
          <option value="creator_wants_paid">Creator Wants Paid</option>
        </Select>
        <Button variant="outline" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button onClick={onAddNew}>
          <Plus className="h-4 w-4 mr-2" />
          Add New
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border shadow-sm min-h-[200px]">
        {loading && influencers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : !loading && filteredInfluencers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {search || typeFilter !== "all" || statusFilter !== "all"
              ? "No influencers match your filters."
              : "No influencers available for whitelisting yet."}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Handle</TableHead>
                <TableHead>Followers</TableHead>
                <TableHead>Whitelisting Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInfluencers.map((influencer) => (
                <TableRow
                  key={influencer.id}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => onInfluencerClick(influencer)}
                >
                  <TableCell>
                    <div className="w-14 h-14 flex-shrink-0">
                      {influencer.profile_photo_url ? (
                        <Image
                          src={influencer.profile_photo_url}
                          alt={influencer.name}
                          width={56}
                          height={56}
                          className="rounded-full object-cover w-full h-full"
                          unoptimized
                        />
                      ) : (
                        <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-gray-500 text-lg font-medium">
                            {influencer.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{influencer.name}</TableCell>
                  <TableCell className="text-gray-600">@{influencer.instagram_handle}</TableCell>
                  <TableCell>{formatNumber(influencer.follower_count)}</TableCell>
                  <TableCell>
                    {influencer.whitelisting_type ? (
                      <Badge className={whitelistingTypeColors[influencer.whitelisting_type]}>
                        {whitelistingTypeLabels[influencer.whitelisting_type]}
                      </Badge>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[influencer.relationship_status]}>
                      {statusLabels[influencer.relationship_status]}
                    </Badge>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {influencer.shopify_order_id ? (
                      <button
                        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                        onClick={(e) => handleOpenOrderDialog(influencer, e)}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${orderDots[influencer.shopify_order_status || "draft"]}`}></span>
                        {orderStatusLabels[influencer.shopify_order_status || "draft"]}
                      </button>
                    ) : influencer.product_selections && (influencer.product_selections as any[]).length > 0 ? (
                      <button
                        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                        onClick={(e) => handleOpenOrderDialog(influencer, e)}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-purple-400"></span>
                        {(influencer.product_selections as any[]).length} items
                      </button>
                    ) : (
                      <button
                        className="text-xs text-gray-400 hover:text-gray-600"
                        onClick={(e) => handleOpenOrderDialog(influencer, e)}
                      >
                        <ShoppingCart className="h-4 w-4" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Showing {filteredInfluencers.length} of {influencers.length} whitelisting influencers
      </div>

      {/* Order Dialog */}
      {selectedInfluencerForOrder && (
        <OrderDialog
          open={orderDialogOpen}
          onClose={handleCloseOrderDialog}
          onSave={handleOrderSave}
          influencer={selectedInfluencerForOrder}
          campaignInfluencer={createVirtualCampaignInfluencer(selectedInfluencerForOrder)}
        />
      )}
    </div>
  );
}

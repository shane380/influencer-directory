"use client";

import { Influencer, WhitelistingType, InfluencerOrder, CampaignInfluencer, ShopifyOrderStatus } from "@/types/database";
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
import { useState, useMemo, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
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

const partnershipTypeLabels: Record<string, string> = {
  unassigned: "Unassigned",
  gifted_no_ask: "Gifted No Ask",
  gifted_soft_ask: "Gifted Soft Ask",
  gifted_deliverable_ask: "Gifted Deliverable Ask",
  gifted_recurring: "Gifted Recurring",
  paid: "Paid",
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
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [selectedInfluencerForOrder, setSelectedInfluencerForOrder] = useState<Influencer | null>(null);
  const [recentOrders, setRecentOrders] = useState<Map<string, InfluencerOrder>>(new Map());
  const supabase = createClient();

  // Fetch most recent order for each influencer
  useEffect(() => {
    async function fetchRecentOrders() {
      if (influencers.length === 0) return;

      const influencerIds = influencers.map(i => i.id);
      const { data: orders } = await (supabase
        .from("influencer_orders") as any)
        .select("*")
        .in("influencer_id", influencerIds)
        .order("order_date", { ascending: false });

      if (orders) {
        // Keep only the most recent order per influencer
        const orderMap = new Map<string, InfluencerOrder>();
        for (const order of orders as InfluencerOrder[]) {
          if (!orderMap.has(order.influencer_id)) {
            orderMap.set(order.influencer_id, order);
          }
        }
        setRecentOrders(orderMap);
      }
    }
    fetchRecentOrders();
  }, [influencers, supabase]);

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

      return true;
    });
  }, [influencers, search, typeFilter]);

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
            {search || typeFilter !== "all"
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
                <TableHead>Partnership Type</TableHead>
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
                  <TableCell className="text-gray-600 text-sm">
                    {partnershipTypeLabels[influencer.partnership_type] || influencer.partnership_type}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {recentOrders.has(influencer.id) ? (
                      <button
                        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                        onClick={(e) => handleOpenOrderDialog(influencer, e)}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500"></span>
                        #{recentOrders.get(influencer.id)?.order_number}
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

"use client";

import { useEffect, useState, useCallback, Suspense, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Influencer, PartnershipType, Campaign, CampaignStatus, Profile, CampaignDeal, PaymentStatus, DealStatus, ContentStatus, ShopifyOrderStatus, CampaignInfluencer } from "@/types/database";
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
import { PaidCollabDialog } from "@/components/paid-collab-dialog";
import { PaidCollabsBudgetBar } from "@/components/paid-collabs-budget-bar";
import { OrderDialog } from "@/components/order-dialog";
import { Sidebar } from "@/components/sidebar";
import { Plus, Search, ArrowUpDown, ChevronDown, ChevronRight, Loader2, Users, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

const PAGE_SIZE = 50;

type SortField = "name" | "follower_count" | "last_contacted_at";
type SortDirection = "asc" | "desc";
type Tab = "influencers" | "campaigns" | "paid_collabs";

const partnershipTypeLabels: Record<PartnershipType, string> = {
  unassigned: "Unassigned",
  gifted_no_ask: "Gifted No Ask",
  gifted_soft_ask: "Gifted Soft Ask",
  gifted_deliverable_ask: "Gifted Deliverable Ask",
  gifted_recurring: "Gifted Recurring",
  paid: "Paid",
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

const paymentStatusColors: Record<PaymentStatus, string> = {
  not_paid: "bg-red-100 text-red-800",
  deposit_paid: "bg-yellow-100 text-yellow-800",
  paid_on_post: "bg-blue-100 text-blue-800",
  paid_in_full: "bg-green-100 text-green-800",
};

const paymentStatusLabels: Record<PaymentStatus, string> = {
  not_paid: "Not Paid",
  deposit_paid: "Deposit Paid",
  paid_on_post: "Paid on Post",
  paid_in_full: "Paid in Full",
};

const dealStatusColors: Record<DealStatus, string> = {
  negotiating: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-800",
};

const dealStatusLabels: Record<DealStatus, string> = {
  negotiating: "Negotiating",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

const contentStatusColors: Record<ContentStatus, string> = {
  not_started: "bg-gray-100 text-gray-800",
  content_approved: "bg-yellow-100 text-yellow-800",
  content_live: "bg-green-100 text-green-800",
};

const contentStatusLabels: Record<ContentStatus, string> = {
  not_started: "Not Started",
  content_approved: "Approved",
  content_live: "Live",
};

const orderStatusColors: Record<ShopifyOrderStatus | "none", string> = {
  none: "bg-gray-100 text-gray-600",
  draft: "bg-amber-100 text-amber-800",
  placed: "bg-blue-100 text-blue-800",
  fulfilled: "bg-green-100 text-green-800",
};

const orderStatusLabels: Record<ShopifyOrderStatus | "none", string> = {
  none: "No Order",
  draft: "Draft",
  placed: "Placed",
  fulfilled: "Fulfilled",
};

interface CampaignWithCount extends Campaign {
  influencer_count: number;
}

interface PaidCollabWithDetails extends CampaignDeal {
  influencer: Influencer;
  campaign: Campaign;
  campaign_influencer?: CampaignInfluencer & { influencer?: Influencer };
}

function HomePageContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "influencers";

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [influencersTotalCount, setInfluencersTotalCount] = useState(0);
  const [campaigns, setCampaigns] = useState<CampaignWithCount[]>([]);
  const [paidCollabs, setPaidCollabs] = useState<PaidCollabWithDetails[]>([]);
  const [loadingInfluencers, setLoadingInfluencers] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingPaidCollabs, setLoadingPaidCollabs] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);
  const [paidCollabsLoaded, setPaidCollabsLoaded] = useState(false);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [dealStatusFilter, setDealStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [partnershipTypeFilter, setPartnershipTypeFilter] = useState<string>("all");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [influencerDialogOpen, setInfluencerDialogOpen] = useState(false);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [paidCollabDialogOpen, setPaidCollabDialogOpen] = useState(false);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const [currentUser, setCurrentUser] = useState<{ displayName: string; email: string; profilePhotoUrl: string | null; isAdmin: boolean } | null>(null);
  const [influencerDialogInitialTab, setInfluencerDialogInitialTab] = useState<string>("overview");
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [selectedOrderCollab, setSelectedOrderCollab] = useState<PaidCollabWithDetails | null>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const supabase = createClient();
  const router = useRouter();

  const fetchCurrentUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Try to get display name, photo, and admin status from profile
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

  const fetchProfiles = useCallback(async () => {
    const { data } = await (supabase.from("profiles") as any)
      .select("*")
      .order("display_name");
    if (data) {
      setProfiles(data);
    }
  }, [supabase]);

  const fetchInfluencers = useCallback(async (options: { loadMore?: boolean; currentCount?: number } = {}) => {
    const { loadMore = false, currentCount = 0 } = options;

    if (loadMore) {
      setLoadingMore(true);
    } else {
      setLoadingInfluencers(true);
    }

    const offset = loadMore ? currentCount : 0;

    // Build query with count
    let query = supabase
      .from("influencers")
      .select("*", { count: "exact" });

    // Apply filters
    if (partnershipTypeFilter !== "all") {
      query = query.eq("partnership_type", partnershipTypeFilter);
    }
    if (assignedToFilter !== "all") {
      if (assignedToFilter === "unassigned") {
        query = query.is("assigned_to", null);
      } else {
        query = query.eq("assigned_to", assignedToFilter);
      }
    }

    // Apply server-side search
    if (debouncedSearch) {
      const searchTerm = `%${debouncedSearch}%`;
      query = query.or(`name.ilike.${searchTerm},instagram_handle.ilike.${searchTerm},email.ilike.${searchTerm}`);
    }

    // Apply sorting and pagination
    const ascending = sortDirection === "asc";
    query = query
      .order(sortField, { ascending, nullsFirst: false })
      .range(offset, offset + PAGE_SIZE - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error("Error fetching influencers:", error);
    } else {
      if (loadMore) {
        setInfluencers((prev) => [...prev, ...(data || [])]);
      } else {
        setInfluencers(data || []);
      }
      setInfluencersTotalCount(count || 0);
    }

    setLoadingInfluencers(false);
    setLoadingMore(false);
  }, [supabase, partnershipTypeFilter, assignedToFilter, sortField, sortDirection, debouncedSearch]);

  const fetchCampaigns = useCallback(async (forceRefresh = false) => {
    // Skip if already loaded and not forcing refresh
    if (campaignsLoaded && !forceRefresh) {
      return;
    }

    setLoadingCampaigns(true);
    let query = supabase
      .from("campaigns")
      .select("*, campaign_influencers(count)")
      .order("created_at", { ascending: false });

    if (campaignStatusFilter !== "all") {
      query = query.eq("status", campaignStatusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching campaigns:", error);
    } else {
      const campaignsWithCount = (data || []).map((c: any) => ({
        ...c,
        influencer_count: c.campaign_influencers?.[0]?.count || 0,
      }));
      setCampaigns(campaignsWithCount);
      setCampaignsLoaded(true);
    }
    setLoadingCampaigns(false);
  }, [supabase, campaignStatusFilter, campaignsLoaded]);

  const fetchPaidCollabs = useCallback(async (forceRefresh = false) => {
    // Skip if already loaded and not forcing refresh
    if (paidCollabsLoaded && !forceRefresh) {
      return;
    }

    setLoadingPaidCollabs(true);

    let query = supabase
      .from("campaign_deals")
      .select("*, influencer:influencers(*), campaign:campaigns(*)")
      .order("created_at", { ascending: false });

    if (paymentStatusFilter !== "all") {
      query = query.eq("payment_status", paymentStatusFilter);
    }

    if (dealStatusFilter !== "all") {
      query = query.eq("deal_status", dealStatusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching paid collabs:", error);
      setLoadingPaidCollabs(false);
      return;
    }

    const deals = (data || []) as PaidCollabWithDetails[];

    // Fetch campaign_influencers to get order status and full record for OrderDialog
    if (deals.length > 0) {
      const pairs = deals.map(d => ({ influencer_id: d.influencer_id, campaign_id: d.campaign_id }));
      const { data: ciData } = await supabase
        .from("campaign_influencers")
        .select("*, influencer:influencers(*)")
        .or(pairs.map(p => `and(influencer_id.eq.${p.influencer_id},campaign_id.eq.${p.campaign_id})`).join(','));

      // Merge campaign_influencer into deals
      const ciMap = new Map<string, CampaignInfluencer & { influencer?: Influencer }>();
      (ciData || []).forEach((ci: CampaignInfluencer & { influencer?: Influencer }) => {
        ciMap.set(`${ci.influencer_id}-${ci.campaign_id}`, ci);
      });

      deals.forEach(deal => {
        const ci = ciMap.get(`${deal.influencer_id}-${deal.campaign_id}`);
        if (ci) {
          deal.campaign_influencer = ci;
          (deal as any).shopify_order_id = ci.shopify_order_id;
          (deal as any).shopify_order_status = ci.shopify_order_status;
        }
      });
    }

    setPaidCollabs(deals);
    setPaidCollabsLoaded(true);
    setLoadingPaidCollabs(false);
  }, [supabase, paymentStatusFilter, dealStatusFilter]);

  // Fetch profiles and current user on mount
  useEffect(() => {
    fetchProfiles();
    fetchCurrentUser();
  }, [fetchProfiles, fetchCurrentUser]);

  // Sync active tab with URL parameter
  useEffect(() => {
    const tabParam = searchParams.get("tab") as Tab;
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams, activeTab]);

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [search]);

  // Reset campaignsLoaded when filter changes to force refetch
  useEffect(() => {
    setCampaignsLoaded(false);
  }, [campaignStatusFilter]);

  // Fetch influencers when filters/search/sort change (not on tab switch if data exists)
  useEffect(() => {
    if (activeTab === "influencers" && influencers.length === 0) {
      fetchInfluencers();
    }
  }, [activeTab]);

  // Refetch influencers when filters change
  useEffect(() => {
    if (activeTab === "influencers") {
      fetchInfluencers();
    }
  }, [partnershipTypeFilter, assignedToFilter, sortField, sortDirection, debouncedSearch]);

  // Fetch campaigns only on first visit (not on tab switch if data exists)
  useEffect(() => {
    if (activeTab === "campaigns" && campaigns.length === 0 && !campaignsLoaded) {
      fetchCampaigns();
    }
  }, [activeTab]);

  // Pre-fetch paid collabs on mount so data is ready before tab switch
  useEffect(() => {
    fetchPaidCollabs();
  }, []);

  // Refetch paid collabs when filters change
  useEffect(() => {
    if (paidCollabsLoaded) {
      fetchPaidCollabs(true);
    }
  }, [paymentStatusFilter, dealStatusFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const handleOpenInfluencerDialog = (influencer?: Influencer) => {
    setSelectedInfluencer(influencer || null);
    setInfluencerDialogInitialTab("overview");
    setInfluencerDialogOpen(true);
  };

  const handleCloseInfluencerDialog = () => {
    setInfluencerDialogOpen(false);
    setSelectedInfluencer(null);
  };

  const handleInfluencerSave = () => {
    handleCloseInfluencerDialog();
    fetchInfluencers(); // Refresh list after save
  };

  const loadMoreInfluencers = () => {
    fetchInfluencers({ loadMore: true, currentCount: influencers.length });
  };

  const handleOpenCampaignDialog = (campaign?: Campaign) => {
    setSelectedCampaign(campaign || null);
    setCampaignDialogOpen(true);
  };

  const handleCloseCampaignDialog = () => {
    setCampaignDialogOpen(false);
    setSelectedCampaign(null);
  };

  const handleCampaignSave = () => {
    handleCloseCampaignDialog();
    fetchCampaigns(true); // Force refresh after save
  };

  const handlePaidCollabSave = () => {
    setPaidCollabDialogOpen(false);
    fetchPaidCollabs(true); // Force refresh after save
  };

  const handleOpenOrderDialog = (collab: PaidCollabWithDetails) => {
    setSelectedOrderCollab(collab);
    setOrderDialogOpen(true);
  };

  const handleCloseOrderDialog = () => {
    setOrderDialogOpen(false);
    setSelectedOrderCollab(null);
  };

  const handleOrderSave = () => {
    fetchPaidCollabs(true); // Force refresh after save
  };

  const handleOwnerChange = async (influencerId: string, newOwnerId: string | null) => {
    // Optimistically update the local state
    setInfluencers((prev) =>
      prev.map((inf) =>
        inf.id === influencerId ? { ...inf, assigned_to: newOwnerId } : inf
      )
    );

    const { error } = await (supabase.from("influencers") as any)
      .update({ assigned_to: newOwnerId })
      .eq("id", influencerId);

    if (error) {
      console.error("Error updating owner:", error);
      // Revert on error by refetching
      fetchInfluencers();
    }
  };

  // Client-side filter for campaigns (small dataset)
  const filteredCampaigns = campaigns.filter((campaign) => {
    if (!search) return true;
    return campaign.name.toLowerCase().includes(search.toLowerCase());
  });

  // Client-side filter for paid collabs
  const filteredPaidCollabs = paidCollabs.filter((collab) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      collab.influencer?.name?.toLowerCase().includes(searchLower) ||
      collab.influencer?.instagram_handle?.toLowerCase().includes(searchLower) ||
      collab.campaign?.name?.toLowerCase().includes(searchLower)
    );
  });

  const hasMoreInfluencers = influencers.length < influencersTotalCount;

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (date: string | null) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDeliverables = (deliverables: { description: string; quantity: number }[]) => {
    if (!deliverables || deliverables.length === 0) return "-";
    return deliverables
      .map((d) => d.quantity > 1 ? `${d.quantity}x ${d.description || "Unknown"}` : (d.description || "Unknown"))
      .join(", ");
  };

  // Group campaigns by month based on start_date
  const groupCampaignsByMonth = (campaigns: CampaignWithCount[]) => {
    const grouped: Record<string, CampaignWithCount[]> = {};

    campaigns.forEach((campaign) => {
      let monthKey = 'no-date';

      if (campaign.start_date) {
        // Parse date parts directly to avoid timezone issues
        const dateParts = campaign.start_date.split('T')[0].split('-');
        const year = dateParts[0];
        const month = dateParts[1];
        monthKey = `${year}-${month}`;
      }

      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(campaign);
    });

    // Sort months in descending order (most recent first)
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      if (a === 'no-date') return 1;
      if (b === 'no-date') return -1;
      return b.localeCompare(a);
    });

    return sortedKeys.map((key) => {
      let label = 'No Start Date';
      if (key !== 'no-date') {
        const [year, month] = key.split('-');
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
        label = `${monthNames[parseInt(month, 10) - 1]} ${year}`;
      }
      return {
        monthKey: key,
        label,
        campaigns: grouped[key],
      };
    });
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };

  const groupedCampaigns = groupCampaignsByMonth(filteredCampaigns);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab as Tab);
          window.history.replaceState(null, "", `/?tab=${tab}`);
        }}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Main content */}
      <main className="flex-1 ml-48 px-8 pt-12 pb-8">
        {/* Tab content wrapper */}
        <div className="relative max-w-6xl">
          {/* Influencers Tab - always mounted */}
          <div className={activeTab === "influencers" ? "" : "hidden"}>
          {/* Influencer Filters */}
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
            <Select value={partnershipTypeFilter} onChange={(e) => setPartnershipTypeFilter(e.target.value)} className="w-auto sm:w-[180px] flex-shrink-0">
              <option value="all">All Partnership Types</option>
              <option value="unassigned">Unassigned</option>
              <option value="gifted_no_ask">Gifted No Ask</option>
              <option value="gifted_soft_ask">Gifted Soft Ask</option>
              <option value="gifted_deliverable_ask">Gifted Deliverable Ask</option>
              <option value="gifted_recurring">Gifted Recurring</option>
              <option value="paid">Paid</option>
            </Select>
            <Select value={assignedToFilter} onChange={(e) => setAssignedToFilter(e.target.value)} className="w-auto sm:w-[180px] flex-shrink-0">
              <option value="all">All Owners</option>
              <option value="unassigned">Unassigned</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.display_name}
                </option>
              ))}
            </Select>
            <Button onClick={() => handleOpenInfluencerDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Influencer
            </Button>
          </div>

          {/* Influencer Table */}
          <div className="bg-white rounded-lg border shadow-sm min-h-[200px]">
            {loadingInfluencers && influencers.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : !loadingInfluencers && influencers.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                {debouncedSearch ? "No influencers match your search." : "No influencers found. Add your first one!"}
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
                    <TableHead className="w-[140px]">Owner</TableHead>
                    <TableHead>
                      <button
                        className="flex items-center gap-1 hover:text-gray-900"
                        onClick={() => handleSort("last_contacted_at")}
                      >
                        Last Contact
                        <ArrowUpDown className="h-4 w-4" />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {influencers.map((influencer) => (
                    <TableRow
                      key={influencer.id}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleOpenInfluencerDialog(influencer)}
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
                      <TableCell className="text-gray-600 text-sm">
                        {partnershipTypeLabels[influencer.partnership_type]}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="w-[140px]">
                        <Select
                          value={influencer.assigned_to || ""}
                          onChange={(e) => handleOwnerChange(influencer.id, e.target.value || null)}
                          className="text-xs h-8 w-[130px]"
                        >
                          <option value="">Unassigned</option>
                          {profiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                              {profile.display_name}
                            </option>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {formatDate(influencer.last_contacted_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Load More Button */}
          {hasMoreInfluencers && !loadingInfluencers && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={loadMoreInfluencers}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Load more (${influencersTotalCount - influencers.length} remaining)`
                )}
              </Button>
            </div>
          )}

          <div className="mt-4 text-sm text-gray-500">
            Showing {influencers.length} of {influencersTotalCount} influencers
          </div>
        </div>

          {/* Campaigns Tab - always mounted */}
          <div className={activeTab === "campaigns" ? "" : "hidden"}>
          {/* Campaign Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              <Input
                placeholder="Search campaigns..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 w-full"
              />
            </div>
            <Select value={campaignStatusFilter} onChange={(e) => setCampaignStatusFilter(e.target.value)} className="w-auto sm:w-[180px] flex-shrink-0">
              <option value="all">All Statuses</option>
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Button onClick={() => handleOpenCampaignDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </div>

          {/* Campaigns Grouped by Month */}
          <div className="space-y-4 min-h-[200px]">
            {loadingCampaigns && campaigns.length === 0 ? (
              <div className="bg-white rounded-lg border shadow-sm p-8 text-center text-gray-500">
                Loading...
              </div>
            ) : !loadingCampaigns && groupedCampaigns.length === 0 ? (
              <div className="bg-white rounded-lg border shadow-sm p-8 text-center text-gray-500">
                No campaigns found. Create your first one!
              </div>
            ) : (
              groupedCampaigns.map((group) => (
                <div key={group.monthKey} className="bg-white rounded-lg border shadow-sm overflow-hidden">
                  {/* Month Header */}
                  <div className="w-full px-4 py-3 flex items-center justify-between bg-gray-50">
                    <button
                      className="flex items-center gap-3 hover:bg-gray-100 -ml-2 px-2 py-1 rounded transition-colors"
                      onClick={() => toggleMonth(group.monthKey)}
                    >
                      {expandedMonths.has(group.monthKey) ? (
                        <ChevronDown className="h-5 w-5 text-gray-500" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-500" />
                      )}
                      <span className="font-semibold text-gray-900">{group.label}</span>
                      <Badge variant="secondary" className="ml-2">
                        {group.campaigns.length} campaign{group.campaigns.length !== 1 ? 's' : ''}
                      </Badge>
                    </button>
                    {group.campaigns.length > 1 && group.monthKey !== 'no-date' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/campaigns/month/${group.monthKey}`);
                        }}
                      >
                        <Users className="h-4 w-4 mr-1" />
                        View All ({group.campaigns.reduce((sum, c) => sum + c.influencer_count, 0)})
                      </Button>
                    )}
                  </div>

                  {/* Campaigns List */}
                  {expandedMonths.has(group.monthKey) && (
                    <div className="divide-y">
                      {group.campaigns.map((campaign) => (
                        <div
                          key={campaign.id}
                          className="px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => router.push(`/campaigns/${campaign.id}`)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <span className="font-medium text-gray-900">{campaign.name}</span>
                                <Badge className={campaignStatusColors[campaign.status]}>
                                  {campaignStatusLabels[campaign.status]}
                                </Badge>
                              </div>
                              {campaign.description && (
                                <p className="text-sm text-gray-500 mt-1 line-clamp-1">
                                  {campaign.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-6 text-sm text-gray-500">
                              <div className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {campaign.influencer_count}
                              </div>
                              <div className="w-24 text-right">
                                {formatDate(campaign.start_date)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="mt-4 text-sm text-gray-500">
            Showing {filteredCampaigns.length} of {campaigns.length} campaigns
          </div>
          </div>

          {/* Paid Collabs Tab - always mounted */}
          <div className={activeTab === "paid_collabs" ? "" : "hidden"}>
          {/* Budget Bar */}
          <PaidCollabsBudgetBar
            deals={paidCollabs}
            onBudgetChange={() => fetchPaidCollabs(true)}
          />

          {/* Paid Collabs Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 z-10" />
              <Input
                placeholder="Search by influencer or campaign..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 w-full"
              />
            </div>
            <Select value={dealStatusFilter} onChange={(e) => setDealStatusFilter(e.target.value)} className="w-auto sm:w-[140px] flex-shrink-0">
              <option value="all">All Deal Statuses</option>
              <option value="negotiating">Negotiating</option>
              <option value="confirmed">Confirmed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            <Select value={paymentStatusFilter} onChange={(e) => setPaymentStatusFilter(e.target.value)} className="w-auto sm:w-[160px] flex-shrink-0">
              <option value="all">All Payments</option>
              <option value="not_paid">Not Paid</option>
              <option value="deposit_paid">Deposit Paid</option>
              <option value="paid_on_post">Paid on Post</option>
              <option value="paid_in_full">Paid in Full</option>
            </Select>
            <Button onClick={() => setPaidCollabDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Paid Collab
            </Button>
          </div>

          {/* Paid Collabs Table */}
          <div className="bg-white rounded-lg border shadow-sm min-h-[200px]">
            <div className={!paidCollabsLoaded ? "" : "hidden"}>
              <div className="p-8 text-center text-gray-500">Loading...</div>
            </div>
            <div className={paidCollabsLoaded && filteredPaidCollabs.length === 0 ? "" : "hidden"}>
              <div className="p-8 text-center text-gray-500">
                {search ? "No paid collabs match your search." : "No paid collaborations found."}
              </div>
            </div>
            <div className={paidCollabsLoaded && filteredPaidCollabs.length > 0 ? "" : "hidden"}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Influencer</TableHead>
                    <TableHead>Handle</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Deliverables</TableHead>
                    <TableHead>Deal Value</TableHead>
                    <TableHead>Deal</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Content</TableHead>
                    <TableHead>Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPaidCollabs.map((collab) => (
                    <TableRow
                      key={collab.id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => {
                        if (collab.influencer) {
                          setSelectedInfluencer(collab.influencer);
                          setInfluencerDialogInitialTab("deal");
                          setInfluencerDialogOpen(true);
                        }
                      }}
                    >
                      <TableCell>
                        <div className="w-14 h-14 flex-shrink-0">
                          {collab.influencer?.profile_photo_url ? (
                            <Image
                              src={collab.influencer.profile_photo_url}
                              alt={collab.influencer.name}
                              width={56}
                              height={56}
                              className="rounded-full object-cover w-full h-full"
                              unoptimized
                            />
                          ) : (
                            <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center">
                              <span className="text-gray-500 text-lg font-medium">
                                {collab.influencer?.name?.charAt(0).toUpperCase() || "?"}
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {collab.influencer?.name || "-"}
                      </TableCell>
                      <TableCell className="text-gray-600">
                        {collab.influencer?.instagram_handle ? `@${collab.influencer.instagram_handle}` : "-"}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <button
                          className="text-gray-600 text-left hover:text-purple-600 hover:underline cursor-pointer"
                          onClick={() => router.push(`/campaigns/${collab.campaign_id}`)}
                        >
                          {collab.campaign?.name || "-"}
                        </button>
                      </TableCell>
                      <TableCell className="text-gray-600 text-sm max-w-[200px] truncate">
                        {formatDeliverables(collab.deliverables)}
                      </TableCell>
                      <TableCell className="font-medium text-green-600">
                        {formatCurrency(collab.total_deal_value)}
                      </TableCell>
                      <TableCell>
                        <Badge className={dealStatusColors[(collab.deal_status || "negotiating") as DealStatus]}>
                          {dealStatusLabels[(collab.deal_status || "negotiating") as DealStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {collab.campaign_influencer ? (
                          (collab as any).shopify_order_id ? (
                            <button
                              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                              onClick={() => handleOpenOrderDialog(collab)}
                            >
                              <Badge className={orderStatusColors[((collab as any).shopify_order_status || "none") as ShopifyOrderStatus | "none"]}>
                                {orderStatusLabels[((collab as any).shopify_order_status || "none") as ShopifyOrderStatus | "none"]}
                              </Badge>
                            </button>
                          ) : collab.campaign_influencer.product_selections && (collab.campaign_influencer.product_selections as any[]).length > 0 ? (
                            <button
                              className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                              onClick={() => handleOpenOrderDialog(collab)}
                            >
                              <Badge className="bg-purple-100 text-purple-800">
                                {(collab.campaign_influencer.product_selections as any[]).length} items
                              </Badge>
                            </button>
                          ) : (
                            <button
                              className="text-xs text-gray-400 hover:text-gray-600"
                              onClick={() => handleOpenOrderDialog(collab)}
                            >
                              <ShoppingCart className="h-4 w-4" />
                            </button>
                          )
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={contentStatusColors[(collab.content_status || "not_started") as ContentStatus]}>
                          {contentStatusLabels[(collab.content_status || "not_started") as ContentStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={paymentStatusColors[collab.payment_status]}>
                          {paymentStatusLabels[collab.payment_status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-500">
            Showing {filteredPaidCollabs.length} of {paidCollabs.length} paid collaborations
          </div>
          </div>
        </div>
      </main>

      <InfluencerDialog
        open={influencerDialogOpen}
        onClose={handleCloseInfluencerDialog}
        onSave={handleInfluencerSave}
        influencer={selectedInfluencer}
        initialTab={influencerDialogInitialTab}
      />

      <CampaignDialog
        open={campaignDialogOpen}
        onClose={handleCloseCampaignDialog}
        onSave={handleCampaignSave}
        campaign={selectedCampaign}
      />

      <PaidCollabDialog
        open={paidCollabDialogOpen}
        onClose={() => setPaidCollabDialogOpen(false)}
        onSave={handlePaidCollabSave}
      />

      {selectedOrderCollab && selectedOrderCollab.campaign_influencer && (
        <OrderDialog
          open={orderDialogOpen}
          onClose={handleCloseOrderDialog}
          onSave={handleOrderSave}
          influencer={selectedOrderCollab.influencer}
          campaignInfluencer={selectedOrderCollab.campaign_influencer as any}
        />
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">Loading...</div>}>
      <HomePageContent />
    </Suspense>
  );
}

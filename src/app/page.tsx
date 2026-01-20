"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { Influencer, PartnershipType, Tier, Campaign, CampaignStatus, Profile } from "@/types/database";
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
import { Plus, Search, LogOut, ArrowUpDown, Users, Megaphone, ChevronDown, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

type SortField = "name" | "follower_count" | "last_contacted_at";
type SortDirection = "asc" | "desc";
type Tab = "influencers" | "campaigns";

const tierColors: Record<Tier, string> = {
  S: "bg-purple-100 text-purple-800",
  A: "bg-blue-100 text-blue-800",
  B: "bg-green-100 text-green-800",
  C: "bg-gray-100 text-gray-800",
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

interface CampaignWithCount extends Campaign {
  influencer_count: number;
}

function HomePageContent() {
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab) || "influencers";

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [partnershipTypeFilter, setPartnershipTypeFilter] = useState<string>("all");
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [influencerDialogOpen, setInfluencerDialogOpen] = useState(false);
  const [campaignDialogOpen, setCampaignDialogOpen] = useState(false);
  const [selectedInfluencer, setSelectedInfluencer] = useState<Influencer | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");

  const supabase = createClient();
  const router = useRouter();

  const fetchProfiles = useCallback(async () => {
    const { data } = await (supabase.from("profiles") as any)
      .select("*")
      .order("display_name");
    if (data) {
      setProfiles(data);
    }
  }, [supabase]);

  const fetchInfluencers = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("influencers").select("*");

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

    const ascending = sortDirection === "asc";
    query = query.order(sortField, { ascending, nullsFirst: false });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching influencers:", error);
    } else {
      setInfluencers(data || []);
    }
    setLoading(false);
  }, [supabase, partnershipTypeFilter, assignedToFilter, sortField, sortDirection]);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
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
    }
    setLoading(false);
  }, [supabase, campaignStatusFilter]);

  // Fetch profiles on mount
  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // Sync active tab with URL parameter
  useEffect(() => {
    const tabParam = searchParams.get("tab") as Tab;
    if (tabParam && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [searchParams, activeTab]);

  useEffect(() => {
    if (activeTab === "influencers") {
      fetchInfluencers();
    } else {
      fetchCampaigns();
    }
  }, [activeTab, fetchInfluencers, fetchCampaigns]);

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
    setInfluencerDialogOpen(true);
  };

  const handleCloseInfluencerDialog = () => {
    setInfluencerDialogOpen(false);
    setSelectedInfluencer(null);
  };

  const handleInfluencerSave = () => {
    handleCloseInfluencerDialog();
    fetchInfluencers();
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
    fetchCampaigns();
  };

  const handleOwnerChange = async (influencerId: string, newOwnerId: string | null) => {
    const { error } = await (supabase.from("influencers") as any)
      .update({ assigned_to: newOwnerId })
      .eq("id", influencerId);

    if (error) {
      console.error("Error updating owner:", error);
    } else {
      fetchInfluencers();
    }
  };

  const filteredInfluencers = influencers.filter((influencer) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      influencer.name.toLowerCase().includes(searchLower) ||
      influencer.instagram_handle.toLowerCase().includes(searchLower) ||
      (influencer.email?.toLowerCase().includes(searchLower) ?? false)
    );
  });

  const filteredCampaigns = campaigns.filter((campaign) => {
    if (!search) return true;
    return campaign.name.toLowerCase().includes(search.toLowerCase());
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Influencer Directory</h1>
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <Button
            variant={activeTab === "influencers" ? "default" : "outline"}
            onClick={() => {
              setActiveTab("influencers");
              router.push("/?tab=influencers");
            }}
          >
            <Users className="h-4 w-4 mr-2" />
            Influencers
          </Button>
          <Button
            variant={activeTab === "campaigns" ? "default" : "outline"}
            onClick={() => {
              setActiveTab("campaigns");
              router.push("/?tab=campaigns");
            }}
          >
            <Megaphone className="h-4 w-4 mr-2" />
            Campaigns
          </Button>
        </div>

        {activeTab === "influencers" ? (
          <>
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
            <div className="bg-white rounded-lg border shadow-sm">
              {loading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : filteredInfluencers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No influencers found. Add your first one!
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
                    {filteredInfluencers.map((influencer) => (
                      <TableRow
                        key={influencer.id}
                        className="cursor-pointer"
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
                        <TableCell>
                          <Badge className={partnershipTypeColors[influencer.partnership_type]}>
                            {partnershipTypeLabels[influencer.partnership_type]}
                          </Badge>
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

            <div className="mt-4 text-sm text-gray-500">
              Showing {filteredInfluencers.length} of {influencers.length} influencers
            </div>
          </>
        ) : (
          <>
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
            <div className="space-y-4">
              {loading ? (
                <div className="bg-white rounded-lg border shadow-sm p-8 text-center text-gray-500">
                  Loading...
                </div>
              ) : groupedCampaigns.length === 0 ? (
                <div className="bg-white rounded-lg border shadow-sm p-8 text-center text-gray-500">
                  No campaigns found. Create your first one!
                </div>
              ) : (
                groupedCampaigns.map((group) => (
                  <div key={group.monthKey} className="bg-white rounded-lg border shadow-sm overflow-hidden">
                    {/* Month Header */}
                    <button
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                      onClick={() => toggleMonth(group.monthKey)}
                    >
                      <div className="flex items-center gap-3">
                        {expandedMonths.has(group.monthKey) ? (
                          <ChevronDown className="h-5 w-5 text-gray-500" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-500" />
                        )}
                        <span className="font-semibold text-gray-900">{group.label}</span>
                        <Badge variant="secondary" className="ml-2">
                          {group.campaigns.length} campaign{group.campaigns.length !== 1 ? 's' : ''}
                        </Badge>
                      </div>
                    </button>

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
          </>
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
        campaign={selectedCampaign}
      />
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

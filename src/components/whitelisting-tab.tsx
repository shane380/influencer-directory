"use client";

import { Influencer, WhitelistingType } from "@/types/database";
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
import { Search, RefreshCw, Plus } from "lucide-react";
import Image from "next/image";
import { useState, useMemo } from "react";

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

export function WhitelistingTab({
  influencers,
  loading,
  onRefresh,
  onInfluencerClick,
  onAddNew,
}: WhitelistingTabProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Showing {filteredInfluencers.length} of {influencers.length} whitelisting influencers
      </div>
    </div>
  );
}

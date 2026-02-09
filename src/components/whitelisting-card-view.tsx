"use client";

import { useMemo, useState } from "react";
import { Influencer, InfluencerOrder, InfluencerContent, CampaignDeal } from "@/types/database";
import { Select } from "@/components/ui/select";
import { WhitelistingCreatorCard, hasExpiringUsage, hasExpiredUsage } from "@/components/whitelisting-creator-card";
import { AlertTriangle } from "lucide-react";
import { parseISO, differenceInDays } from "date-fns";

interface WhitelistingCardViewProps {
  influencers: Influencer[];
  allInfluencers: Influencer[];
  orders: InfluencerOrder[];
  content: InfluencerContent[];
  deals: CampaignDeal[];
  loading: boolean;
  onInfluencerClick: (influencer: Influencer) => void;
  onAddNew: () => void;
  onRefresh: () => void;
  onSendProduct: (influencer: Influencer, e: React.MouseEvent) => void;
}

type SortOption = "followers" | "sends" | "content" | "expiring" | "recent";

export function WhitelistingCardView({
  influencers,
  allInfluencers,
  orders,
  content,
  deals,
  loading,
  onInfluencerClick,
  onSendProduct,
}: WhitelistingCardViewProps) {
  const [sortBy, setSortBy] = useState<SortOption>("followers");
  const [showExpiringOnly, setShowExpiringOnly] = useState(false);

  // Build data grouped by influencer
  const dataByInfluencer = useMemo(() => {
    const map = new Map<string, {
      orders: InfluencerOrder[];
      content: InfluencerContent[];
      deals: CampaignDeal[];
    }>();

    // Initialize for all influencers
    influencers.forEach((inf) => {
      map.set(inf.id, { orders: [], content: [], deals: [] });
    });

    orders.forEach((o) => {
      const entry = map.get(o.influencer_id);
      if (entry) entry.orders.push(o);
    });

    content.forEach((c) => {
      const entry = map.get(c.influencer_id);
      if (entry) entry.content.push(c);
    });

    deals.forEach((d) => {
      const entry = map.get(d.influencer_id);
      if (entry) entry.deals.push(d);
    });

    return map;
  }, [influencers, orders, content, deals]);

  // Summary stats from all (unfiltered) influencers
  const summaryStats = useMemo(() => {
    const allOrders = orders.filter((o) =>
      allInfluencers.some((inf) => inf.id === o.influencer_id)
    );
    const liveDeals = deals.filter((d) => d.whitelisting_status === "live");

    return {
      creators: allInfluencers.length,
      packagesSent: allOrders.length,
      awaitingContent: allInfluencers.filter(
        (inf) =>
          inf.relationship_status === "order_delivered" ||
          inf.relationship_status === "order_follow_up_sent" ||
          inf.relationship_status === "order_follow_up_two_sent"
      ).length,
      postedWhitelisted: allInfluencers.filter(
        (inf) => inf.relationship_status === "posted"
      ).length + liveDeals.length,
    };
  }, [allInfluencers, orders, deals]);

  // Count expiring
  const expiringCount = useMemo(() => {
    let count = 0;
    influencers.forEach((inf) => {
      const data = dataByInfluencer.get(inf.id);
      if (data && (hasExpiringUsage(data.deals) || hasExpiredUsage(data.deals))) {
        count++;
      }
    });
    return count;
  }, [influencers, dataByInfluencer]);

  // Filter by expiring
  const filteredByExpiring = useMemo(() => {
    if (!showExpiringOnly) return influencers;
    return influencers.filter((inf) => {
      const data = dataByInfluencer.get(inf.id);
      return data && (hasExpiringUsage(data.deals) || hasExpiredUsage(data.deals));
    });
  }, [influencers, showExpiringOnly, dataByInfluencer]);

  // Sort
  const sortedInfluencers = useMemo(() => {
    const arr = [...filteredByExpiring];

    switch (sortBy) {
      case "followers":
        arr.sort((a, b) => b.follower_count - a.follower_count);
        break;
      case "sends":
        arr.sort((a, b) => {
          const aOrders = dataByInfluencer.get(a.id)?.orders.length || 0;
          const bOrders = dataByInfluencer.get(b.id)?.orders.length || 0;
          return bOrders - aOrders;
        });
        break;
      case "content":
        arr.sort((a, b) => {
          const aContent = dataByInfluencer.get(a.id)?.content.length || 0;
          const bContent = dataByInfluencer.get(b.id)?.content.length || 0;
          return bContent - aContent;
        });
        break;
      case "expiring":
        arr.sort((a, b) => {
          const aExp = getEarliestExpiry(dataByInfluencer.get(a.id)?.deals || []);
          const bExp = getEarliestExpiry(dataByInfluencer.get(b.id)?.deals || []);
          return aExp - bExp;
        });
        break;
      case "recent":
        arr.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
    }
    return arr;
  }, [filteredByExpiring, sortBy, dataByInfluencer]);

  return (
    <div>
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Creators" value={summaryStats.creators} />
        <SummaryCard label="Packages Sent" value={summaryStats.packagesSent} />
        <SummaryCard label="Awaiting Content" value={summaryStats.awaitingContent} />
        <SummaryCard label="Posted / Whitelisted" value={summaryStats.postedWhitelisted} />
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4">
        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="w-[160px] text-sm"
        >
          <option value="followers">Sort: Followers</option>
          <option value="sends">Sort: Sends</option>
          <option value="content">Sort: Content</option>
          <option value="expiring">Sort: Expiring</option>
          <option value="recent">Sort: Recent</option>
        </Select>

        {expiringCount > 0 && (
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              showExpiringOnly
                ? "bg-red-500 text-white"
                : "bg-red-50 text-red-700 hover:bg-red-100"
            }`}
            onClick={() => setShowExpiringOnly(!showExpiringOnly)}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {expiringCount} Usage Alert{expiringCount !== 1 ? "s" : ""}
          </button>
        )}

        <span className="ml-auto text-xs text-gray-500">
          {sortedInfluencers.length} creator{sortedInfluencers.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Card Grid */}
      {loading && influencers.length === 0 ? (
        <div className="py-16 text-center text-gray-500">Loading...</div>
      ) : sortedInfluencers.length === 0 ? (
        <div className="py-16 text-center text-gray-500">
          {showExpiringOnly
            ? "No usage alerts found."
            : "No creators match your filters."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sortedInfluencers.map((influencer, i) => {
            const data = dataByInfluencer.get(influencer.id) || {
              orders: [],
              content: [],
              deals: [],
            };
            return (
              <WhitelistingCreatorCard
                key={influencer.id}
                influencer={influencer}
                orders={data.orders}
                content={data.content}
                deals={data.deals}
                onSendProduct={onSendProduct}
                onProfileClick={onInfluencerClick}
                animationDelay={i * 50}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-4 py-3 text-center">
      <div className="text-2xl font-semibold text-gray-900 leading-tight">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-gray-500 mt-1">
        {label}
      </div>
    </div>
  );
}

function getEarliestExpiry(deals: CampaignDeal[]): number {
  if (deals.length === 0) return Infinity;

  let earliest = Infinity;
  const now = new Date();

  deals.forEach((d) => {
    if (!d.whitelisting_live_date) return;
    const expiryDate = d.whitelisting_expiry_date
      ? parseISO(d.whitelisting_expiry_date)
      : new Date(parseISO(d.whitelisting_live_date).getTime() + 90 * 24 * 60 * 60 * 1000);
    const remaining = differenceInDays(expiryDate, now);
    if (remaining < earliest) earliest = remaining;
  });

  return earliest;
}

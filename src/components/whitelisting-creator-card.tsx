"use client";

import { Influencer, InfluencerOrder, InfluencerContent, CampaignDeal, WhitelistingType, RelationshipStatus } from "@/types/database";

import { StatusBadgeDropdown } from "@/components/status-badge-dropdown";
import { WhitelistingContentTimeline } from "@/components/whitelisting-content-timeline";
import { WhitelistingDealsSection } from "@/components/whitelisting-deals-section";
import { WhitelistingSendHistory } from "@/components/whitelisting-send-history";
import { Package, Camera, ShoppingCart } from "lucide-react";
import Image from "next/image";
import { parseISO, differenceInDays } from "date-fns";

interface WhitelistingCreatorCardProps {
  influencer: Influencer;
  orders: InfluencerOrder[];
  content: InfluencerContent[];
  deals: CampaignDeal[];
  onSendProduct: (influencer: Influencer, e: React.MouseEvent) => void;
  onProfileClick: (influencer: Influencer) => void;
  onStatusChange: (influencerId: string, newStatus: RelationshipStatus) => void;
  animationDelay: number;
}

const whitelistingTypeColors: Record<WhitelistingType, string> = {
  paid: "bg-green-100 text-green-800",
  gifted: "bg-purple-100 text-purple-800",
};

const formatNumber = (num: number) => {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

function hasExpiringUsage(deals: CampaignDeal[]) {
  const now = new Date();
  return deals.some((d) => {
    if (!d.whitelisting_live_date || d.whitelisting_status === "ended") return false;
    const expiryDate = d.whitelisting_expiry_date
      ? parseISO(d.whitelisting_expiry_date)
      : new Date(parseISO(d.whitelisting_live_date).getTime() + 90 * 24 * 60 * 60 * 1000);
    const remaining = differenceInDays(expiryDate, now);
    return remaining <= 7;
  });
}

function hasExpiredUsage(deals: CampaignDeal[]) {
  const now = new Date();
  return deals.some((d) => {
    if (!d.whitelisting_live_date) return false;
    const expiryDate = d.whitelisting_expiry_date
      ? parseISO(d.whitelisting_expiry_date)
      : new Date(parseISO(d.whitelisting_live_date).getTime() + 90 * 24 * 60 * 60 * 1000);
    return differenceInDays(expiryDate, now) <= 0;
  });
}

export function WhitelistingCreatorCard({
  influencer,
  orders,
  content,
  deals,
  onSendProduct,
  onProfileClick,
  onStatusChange,
  animationDelay,
}: WhitelistingCreatorCardProps) {
  const now = new Date();
  const activeDeals = deals.filter((d) => {
    if (d.whitelisting_status !== "live") return false;
    if (d.whitelisting_expiry_date) {
      return parseISO(d.whitelisting_expiry_date) > now;
    }
    return true; // live with no expiry still counts as active
  });

  return (
    <div
      className="group bg-white rounded-lg border border-gray-200 shadow-sm hover:-translate-y-[3px] hover:shadow-lg transition-all duration-200 opacity-0 animate-card-fade-in overflow-hidden flex flex-col"
      style={{ animationDelay: `${animationDelay}ms` }}
    >
      {/* Header */}
      <div
        className="p-5 cursor-pointer"
        onClick={() => onProfileClick(influencer)}
      >
        <div className="flex items-center gap-3">
          {/* Photo */}
          <div className="relative w-12 h-12 flex-shrink-0">
            {influencer.profile_photo_url ? (
              <Image
                src={influencer.profile_photo_url}
                alt={influencer.name}
                width={48}
                height={48}
                className="rounded-full object-cover w-full h-full"
                unoptimized
              />
            ) : (
              <div className="w-full h-full rounded-full bg-gray-200 flex items-center justify-center">
                <span className="text-gray-500 text-sm font-medium">
                  {influencer.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {/* Type overlay */}
            {influencer.whitelisting_type && (
              <span className={`absolute -bottom-0.5 -right-0.5 text-[8px] font-bold px-1 py-0 rounded ${
                influencer.whitelisting_type === "paid"
                  ? "bg-green-500 text-white"
                  : "bg-purple-500 text-white"
              }`}>
                {influencer.whitelisting_type === "paid" ? "PAID" : "GIFT"}
              </span>
            )}
          </div>

          {/* Name + handle/followers + status */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 leading-tight truncate">
              {influencer.name}
            </h3>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs text-gray-500 truncate">
                @{influencer.instagram_handle}
              </span>
              <span className="text-xs text-gray-300">·</span>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {formatNumber(influencer.follower_count)} followers
              </span>
              <StatusBadgeDropdown
                status={influencer.relationship_status}
                onStatusChange={(newStatus) => onStatusChange(influencer.id, newStatus)}
                className="ml-auto flex-shrink-0"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="px-5 py-4 grid grid-cols-3 gap-2 border-t border-gray-100">
        <div className="text-center">
          <div className="text-[16px] font-semibold text-gray-900 mb-1">{orders.length}</div>
          <div className="text-[9px] uppercase tracking-wider text-gray-500">Packages Sent</div>
        </div>
        <div className="text-center">
          <div className="text-[16px] font-semibold text-gray-900 mb-1">{content.length}</div>
          <div className="text-[9px] uppercase tracking-wider text-gray-500">Content</div>
        </div>
        <div className="text-center">
          <div className="text-[16px] font-semibold text-gray-900 mb-1">{activeDeals.length}</div>
          <div className="text-[9px] uppercase tracking-wider text-gray-500">Active</div>
        </div>
      </div>

      {/* Collapsible sections */}
      <div className="flex-1 border-t border-gray-100">
        <WhitelistingDealsSection deals={deals} />
        <WhitelistingContentTimeline content={content} deals={deals} />
        <WhitelistingSendHistory orders={orders} />
      </div>

      {/* Action bar — visible on hover, height always reserved */}
      <div className="border-t border-gray-200 px-5 py-3 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900 transition-colors"
          onClick={(e) => onSendProduct(influencer, e)}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          Send
        </button>
        <button
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900 transition-colors"
          onClick={() => onProfileClick(influencer)}
        >
          <Camera className="h-3.5 w-3.5" />
          Log Content
        </button>
        <button
          className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-900 transition-colors ml-auto"
          onClick={() => onProfileClick(influencer)}
        >
          <Package className="h-3.5 w-3.5" />
          Profile
        </button>
      </div>
    </div>
  );
}

// Export utility for card view to detect expiring deals
export { hasExpiringUsage, hasExpiredUsage };

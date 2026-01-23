"use client";

import { Campaign, CampaignInfluencer, PartnershipType, RelationshipStatus } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Megaphone, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";

interface CampaignHistoryItem extends CampaignInfluencer {
  campaign: Campaign;
}

interface InfluencerCampaignsTabProps {
  campaignHistory: CampaignHistoryItem[];
  loadingHistory: boolean;
}

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

function formatCampaignDate(dateString: string | null): string {
  if (!dateString) return "No date";
  const dateParts = dateString.split('T')[0].split('-');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];
  return `${monthNames[parseInt(dateParts[1], 10) - 1]} ${dateParts[0]}`;
}

export function InfluencerCampaignsTab({
  campaignHistory,
  loadingHistory,
}: InfluencerCampaignsTabProps) {
  if (loadingHistory) {
    return (
      <div className="text-center py-8">
        <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-gray-400" />
        <p className="text-gray-500">Loading campaigns...</p>
      </div>
    );
  }

  if (campaignHistory.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Megaphone className="h-12 w-12 mx-auto mb-3 text-gray-300" />
        <p>No campaigns yet</p>
        <p className="text-sm mt-1">Add this influencer to a campaign to see history here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto">
      {campaignHistory.map((item) => (
        <div
          key={item.id}
          className="border rounded-lg p-3 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Link
                  href={`/campaigns/${item.campaign.id}`}
                  className="font-medium hover:text-blue-600 flex items-center gap-1"
                >
                  {item.campaign.name}
                  <ExternalLink className="h-3 w-3" />
                </Link>
                <span className="text-gray-500 text-xs">
                  ({formatCampaignDate(item.campaign.start_date)})
                </span>
              </div>
              {item.compensation && (
                <p className="text-gray-500 text-sm mt-1">
                  Compensation: {item.compensation}
                </p>
              )}
              {item.notes && (
                <p className="text-gray-500 text-sm mt-1 truncate max-w-md">
                  {item.notes}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge className={partnershipTypeColors[item.partnership_type]}>
                {partnershipTypeLabels[item.partnership_type]}
              </Badge>
              <Badge className={statusColors[item.status]}>
                {statusLabels[item.status]}
              </Badge>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

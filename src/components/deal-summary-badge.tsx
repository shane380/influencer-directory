"use client";

import { CampaignDeal } from "@/types/database";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, paymentStatusLabels, paymentStatusColors } from "@/lib/constants";
import { DollarSign } from "lucide-react";

interface DealSummaryBadgeProps {
  deal: CampaignDeal | null;
  onClick: () => void;
}

export function DealSummaryBadge({ deal, onClick }: DealSummaryBadgeProps) {
  if (!deal) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="text-purple-600 border-purple-300 hover:bg-purple-50"
        onClick={onClick}
      >
        <DollarSign className="h-3.5 w-3.5 mr-1" />
        Add Deal
      </Button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 hover:opacity-80 transition-opacity"
    >
      <Badge className="bg-purple-100 text-purple-800 font-medium">
        {formatCurrency(deal.total_deal_value)}
      </Badge>
      <Badge className={paymentStatusColors[deal.payment_status]}>
        {paymentStatusLabels[deal.payment_status]}
      </Badge>
    </button>
  );
}

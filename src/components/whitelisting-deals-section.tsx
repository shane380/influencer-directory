"use client";

import { CampaignDeal } from "@/types/database";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Shield } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

interface WhitelistingDealsSectionProps {
  deals: CampaignDeal[];
}

export function WhitelistingDealsSection({ deals }: WhitelistingDealsSectionProps) {
  const relevantDeals = deals.filter(
    (d) => d.whitelisting_status === "live" || d.whitelisting_status === "ended"
  );

  if (relevantDeals.length === 0) return null;

  const summaryBadge = getMostUrgentStatus(relevantDeals);

  return (
    <Collapsible className="border-t border-gray-200">
      <CollapsibleTrigger className="px-5 py-3 text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-900">
        <Shield className="h-3.5 w-3.5 mr-1.5" />
        {relevantDeals.length} WHITELISTING DEAL{relevantDeals.length !== 1 ? "S" : ""}
        <Badge className={`${summaryBadge.color} text-[9px] px-1.5 py-0 ml-2`}>
          {summaryBadge.label}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-5 pb-3">
        <div className="space-y-3">
          {relevantDeals.map((deal) => {
            const description = deal.deliverables && deal.deliverables.length > 0
              ? deal.deliverables.map((d) => d.description).join(", ")
              : "Whitelisting";

            return (
              <div key={deal.id} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge className={
                    deal.whitelisting_status === "live"
                      ? "bg-green-100 text-green-800 text-[10px] px-1.5 py-0"
                      : "bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0"
                  }>
                    {deal.whitelisting_status === "live" ? "LIVE" : "ENDED"}
                  </Badge>
                  <span className="text-xs text-gray-900 truncate flex-1">{description}</span>
                </div>

                {deal.whitelisting_live_date && deal.whitelisting_expiry_date ? (
                  <DealTimeline deal={deal} />
                ) : deal.whitelisting_live_date && !deal.whitelisting_expiry_date ? (
                  <p className="text-[11px] text-amber-600">
                    Live since {format(parseISO(deal.whitelisting_live_date), "MMM d, yyyy")} — no expiry set
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function getMostUrgentStatus(deals: CampaignDeal[]): { label: string; color: string } {
  const now = new Date();
  let hasExpired = false;
  let hasLive = false;

  for (const d of deals) {
    if (d.whitelisting_status === "live") {
      if (d.whitelisting_expiry_date && differenceInDays(parseISO(d.whitelisting_expiry_date), now) <= 0) {
        hasExpired = true;
      } else {
        hasLive = true;
      }
    }
    if (d.whitelisting_status === "ended") {
      // ended is least urgent, just note it
    }
  }

  if (hasExpired) return { label: "EXPIRED", color: "bg-red-100 text-red-700 animate-pulse" };
  if (hasLive) return { label: "LIVE", color: "bg-green-100 text-green-800" };
  return { label: "ENDED", color: "bg-gray-100 text-gray-600" };
}

function DealTimeline({ deal }: { deal: CampaignDeal }) {
  const now = new Date();
  const liveDate = parseISO(deal.whitelisting_live_date!);
  const expiryDate = parseISO(deal.whitelisting_expiry_date!);

  const totalDays = differenceInDays(expiryDate, liveDate);
  const elapsed = differenceInDays(now, liveDate);
  const remaining = differenceInDays(expiryDate, now);
  const percent = totalDays > 0 ? (elapsed / totalDays) * 100 : 100;

  let barColor = "bg-green-500";
  let badge: string | null = null;
  let badgeColor = "";

  if (remaining <= 0) {
    barColor = "bg-red-500";
    badge = "EXPIRED";
    badgeColor = "bg-red-100 text-red-700 animate-pulse";
  } else if (remaining <= 7) {
    barColor = "bg-red-500";
    badge = `${remaining}d LEFT`;
    badgeColor = "bg-red-50 text-red-700";
  } else if (remaining <= 14) {
    barColor = "bg-amber-500";
    badge = `${remaining}d LEFT`;
    badgeColor = "bg-amber-50 text-amber-700";
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        {badge && (
          <Badge className={`${badgeColor} text-[9px] px-1.5 py-0 whitespace-nowrap`}>
            {badge}
          </Badge>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
        <span>{format(liveDate, "MMM d, yyyy")}</span>
        <span>{format(expiryDate, "MMM d, yyyy")}</span>
      </div>
    </div>
  );
}

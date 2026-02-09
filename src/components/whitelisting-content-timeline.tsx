"use client";

import { InfluencerContent, CampaignDeal } from "@/types/database";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Camera } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

interface WhitelistingContentTimelineProps {
  content: InfluencerContent[];
  deals: CampaignDeal[];
}

const contentTypeBadge: Record<string, string> = {
  story: "bg-pink-50 text-pink-700",
  post: "bg-blue-50 text-blue-700",
  reel: "bg-purple-50 text-purple-700",
};

export function WhitelistingContentTimeline({ content, deals }: WhitelistingContentTimelineProps) {
  if (content.length === 0) return null;

  // Build deal lookups: by id and by campaign_id
  const dealById = new Map<string, CampaignDeal>();
  const dealByCampaign = new Map<string, CampaignDeal>();
  deals.forEach((d) => {
    dealById.set(d.id, d);
    dealByCampaign.set(d.campaign_id, d);
  });

  const sorted = [...content].sort(
    (a, b) =>
      new Date(b.posted_at || b.scraped_at).getTime() -
      new Date(a.posted_at || a.scraped_at).getTime()
  );

  return (
    <Collapsible className="border-t border-gray-200">
      <CollapsibleTrigger className="px-5 py-3 text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-900">
        <Camera className="h-3.5 w-3.5 mr-1.5" />
        {content.length} CONTENT ASSET{content.length !== 1 ? "S" : ""}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-5 pb-3">
        <div className="space-y-3">
          {sorted.map((item) => {
            const deal = (item.deal_id ? dealById.get(item.deal_id) : undefined)
              || (item.campaign_id ? dealByCampaign.get(item.campaign_id) : undefined);
            const usageBar = deal ? getUsageInfo(deal) : null;

            return (
              <div key={item.id} className="space-y-1.5">
                <div className="flex items-start gap-2">
                  <Badge className={`${contentTypeBadge[item.type] || "bg-gray-50 text-gray-700"} text-[10px] px-1.5 py-0`}>
                    {item.type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    {item.caption && (
                      <p className="text-xs text-gray-900 truncate">{item.caption}</p>
                    )}
                    <span className="text-[10px] text-gray-400">
                      {item.posted_at
                        ? format(parseISO(item.posted_at), "MMM d, yyyy")
                        : "Date unknown"}
                    </span>
                  </div>
                </div>

                {usageBar && (
                  <div className="ml-0">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${usageBar.color}`}
                          style={{ width: `${Math.min(usageBar.percent, 100)}%` }}
                        />
                      </div>
                      {usageBar.badge && (
                        <Badge className={`${usageBar.badgeColor} text-[9px] px-1.5 py-0 whitespace-nowrap`}>
                          {usageBar.badge}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function getUsageInfo(deal: CampaignDeal) {
  if (!deal.whitelisting_live_date) return null;

  const now = new Date();
  const liveDate = parseISO(deal.whitelisting_live_date);
  const expiryDate = deal.whitelisting_expiry_date
    ? parseISO(deal.whitelisting_expiry_date)
    : new Date(liveDate.getTime() + 90 * 24 * 60 * 60 * 1000);

  const totalDays = differenceInDays(expiryDate, liveDate);
  const elapsed = differenceInDays(now, liveDate);
  const remaining = differenceInDays(expiryDate, now);
  const percent = totalDays > 0 ? (elapsed / totalDays) * 100 : 100;

  let color = "bg-green-500";
  let badge: string | null = null;
  let badgeColor = "";

  if (remaining <= 0) {
    color = "bg-red-500";
    badge = "USAGE EXPIRED";
    badgeColor = "bg-red-50 text-red-700";
  } else if (remaining <= 7) {
    color = "bg-amber-500";
    badge = "EXPIRING SOON";
    badgeColor = "bg-amber-50 text-amber-700";
  }

  return { percent, color, badge, badgeColor };
}

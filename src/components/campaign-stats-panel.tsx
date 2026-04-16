"use client";

import {
  CampaignInfluencer,
  RelationshipStatus,
  ShopifyOrderStatus,
} from "@/types/database";
import { ChevronRight } from "lucide-react";

interface CampaignStatsPanelProps {
  campaignName: string;
  campaignInfluencers: CampaignInfluencer[];
}

export function CampaignStatsPanel({
  campaignName,
  campaignInfluencers,
}: CampaignStatsPanelProps) {
  const total = campaignInfluencers.length;

  // Tier counts
  const seeding = campaignInfluencers.filter((ci) =>
    ["gifted_no_ask", "gifted_soft_ask", "gifted_deliverable_ask"].includes(ci.partnership_type)
  ).length;
  const recurring = campaignInfluencers.filter((ci) => ci.partnership_type === "gifted_recurring").length;
  const paid = campaignInfluencers.filter((ci) => ci.partnership_type === "paid").length;

  // Funnel counts
  const prospectCount = campaignInfluencers.filter((ci) => ci.status === "prospect").length;
  const contactedCount = total - prospectCount;

  const approvedStatuses: RelationshipStatus[] = [
    "order_placed",
    "order_delivered",
    "order_follow_up_sent",
    "order_follow_up_two_sent",
    "posted",
  ];
  const approvedCount = campaignInfluencers.filter((ci) =>
    approvedStatuses.includes(ci.status)
  ).length;
  const declinedCount = campaignInfluencers.filter((ci) => ci.status === "lead_dead").length;
  const pendingCount = campaignInfluencers.filter((ci) => ci.status === "creator_wants_paid").length;

  const orderStatuses: ShopifyOrderStatus[] = ["draft", "fulfilled", "shipped", "delivered"];
  const ordersPlacedCount = campaignInfluencers.filter(
    (ci) => ci.shopify_order_status && orderStatuses.includes(ci.shopify_order_status)
  ).length;
  const shippedCount = campaignInfluencers.filter((ci) => ci.shopify_order_status === "shipped").length;
  const deliveredCount = campaignInfluencers.filter((ci) => ci.shopify_order_status === "delivered").length;

  const contentInfluencers = campaignInfluencers.filter((ci) => ci.content_posted !== "none");
  const postedCount = contentInfluencers.length;
  const stories = campaignInfluencers.filter((ci) => ci.content_posted === "stories").length;
  const inFeed = campaignInfluencers.filter((ci) => ci.content_posted === "in_feed_post").length;
  const reels = campaignInfluencers.filter((ci) => ci.content_posted === "reel").length;
  const tiktoks = campaignInfluencers.filter((ci) => ci.content_posted === "tiktok").length;

  // Content sub-line
  const contentParts: string[] = [];
  if (reels > 0) contentParts.push(`${reels} ${reels === 1 ? "reel" : "reels"}`);
  if (stories > 0) contentParts.push(`${stories} ${stories === 1 ? "story" : "stories"}`);
  if (inFeed > 0) contentParts.push(`${inFeed} ${inFeed === 1 ? "post" : "posts"}`);
  if (tiktoks > 0) contentParts.push(`${tiktoks} ${tiktoks === 1 ? "tiktok" : "tiktoks"}`);

  // Rates
  const repliedCount = campaignInfluencers.filter(
    (ci) => ci.status !== "prospect" && ci.status !== "followed_up"
  ).length;
  const responseRate = contactedCount > 0 ? (repliedCount / contactedCount) * 100 : 0;
  const acceptanceRate = repliedCount > 0 ? (approvedCount / repliedCount) * 100 : 0;
  const postRate = deliveredCount > 0 ? (postedCount / deliveredCount) * 100 : 0;

  const funnelSteps = [
    {
      label: "Roster",
      value: total,
      subLine: null,
    },
    {
      label: "Contacted",
      value: contactedCount,
      subLine: prospectCount > 0 ? (
        <span className="text-red-500">{prospectCount} not yet reached</span>
      ) : null,
    },
    {
      label: "Approved",
      value: approvedCount,
      subLine: (
        <span>
          {declinedCount > 0 && <span className="text-red-500">{declinedCount} declined</span>}
          {declinedCount > 0 && pendingCount > 0 && <span className="text-gray-400"> · </span>}
          {pendingCount > 0 && <span className="text-amber-500">{pendingCount} pending</span>}
        </span>
      ),
    },
    {
      label: "Orders Placed",
      value: ordersPlacedCount,
      subLine: (
        <span>
          {shippedCount > 0 && <span>{shippedCount} shipped</span>}
          {shippedCount > 0 && deliveredCount > 0 && <span className="text-gray-400"> · </span>}
          {deliveredCount > 0 && <span>{deliveredCount} delivered</span>}
        </span>
      ),
    },
    {
      label: "Content Posted",
      value: postedCount,
      subLine: contentParts.length > 0 ? (
        <span>{contentParts.join(" · ")}</span>
      ) : null,
    },
  ];

  const rates = [
    {
      label: "Response Rate",
      value: responseRate,
      descriptor: "of contacted replied",
    },
    {
      label: "Acceptance Rate",
      value: acceptanceRate,
      descriptor: "of responded approved",
    },
    {
      label: "Post Rate",
      value: postRate,
      descriptor: "of delivered posted",
    },
  ];

  return (
    <div className="mt-4 bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header: campaign name, count, tier pills */}
      <div className="px-5 py-3 flex items-center gap-3">
        <span className="text-sm font-medium text-gray-900">{campaignName}</span>
        <span className="text-sm text-gray-500">{total} influencers</span>
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
            {seeding} Seeding
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
            {recurring} Recurring
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
            {paid} Paid
          </span>
        </div>
      </div>

      {/* Funnel row */}
      <div className="px-5 py-3 flex items-stretch gap-0">
        {funnelSteps.map((step, i) => (
          <div key={step.label} className="flex items-stretch">
            {i > 0 && (
              <div className="flex items-center px-2">
                <ChevronRight className="h-4 w-4 text-gray-300" />
              </div>
            )}
            <div className="bg-gray-50 rounded-md px-4 py-2.5 min-w-[120px]">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                {step.label}
              </div>
              <div className="text-xl font-bold text-gray-900 mt-0.5">{step.value}</div>
              <div className="text-xs text-gray-500 mt-0.5 min-h-[16px]">
                {step.subLine}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="border-t border-gray-100 mx-5" />

      {/* Rates row */}
      <div className="px-5 py-3 flex items-stretch gap-3">
        {rates.map((rate) => (
          <div
            key={rate.label}
            className="bg-white border border-gray-200 rounded-md px-4 py-2.5 min-w-[140px]"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              {rate.label}
            </div>
            <div className="text-xl font-bold text-gray-900 mt-0.5">
              {rate.value.toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{rate.descriptor}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

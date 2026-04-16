"use client";

import {
  CampaignInfluencer,
  ShopifyOrderStatus,
} from "@/types/database";

interface CampaignStatsPanelProps {
  campaignLabel: string;
  periodLabel?: string;
  campaignInfluencers: CampaignInfluencer[];
}

export function CampaignStatsPanel({
  campaignLabel,
  periodLabel,
  campaignInfluencers,
}: CampaignStatsPanelProps) {
  const total = campaignInfluencers.length;

  // Tier counts
  const seeding = campaignInfluencers.filter((ci) =>
    ["gifted_no_ask", "gifted_soft_ask", "gifted_deliverable_ask"].includes(ci.partnership_type)
  ).length;
  const recurring = campaignInfluencers.filter((ci) => ci.partnership_type === "gifted_recurring").length;
  const paid = campaignInfluencers.filter((ci) => ci.partnership_type === "paid").length;

  // Funnel counts — scoped to approved influencers only (null = no approval required = approved)
  const approved = campaignInfluencers.filter((ci) => ci.approval_status === "approved" || ci.approval_status === null);
  const approvedCount = approved.length;

  const contactedCount = approved.filter((ci) => ci.status !== "prospect").length;
  const prospectCount = approvedCount - contactedCount;

  const orderStatuses: ShopifyOrderStatus[] = ["draft", "fulfilled", "shipped", "delivered"];
  const ordersPlacedCount = approved.filter(
    (ci) => ci.shopify_order_status && orderStatuses.includes(ci.shopify_order_status)
  ).length;
  const shippedCount = approved.filter((ci) => ci.shopify_order_status === "shipped").length;
  const deliveredCount = approved.filter((ci) => ci.shopify_order_status === "delivered").length;

  const postedCount = approved.filter((ci) => ci.content_posted !== "none").length;

  // Rates — also scoped to approved
  const repliedCount = approved.filter(
    (ci) => ci.status !== "prospect" && ci.status !== "followed_up"
  ).length;
  const responseRate = contactedCount > 0 ? Math.round((repliedCount / contactedCount) * 100) : 0;
  const acceptanceRate = repliedCount > 0 ? Math.round((ordersPlacedCount / repliedCount) * 100) : 0;
  const postRate = deliveredCount > 0 ? Math.round((postedCount / deliveredCount) * 100) : 0;

  // Progress bar percentages
  const contactedPct = approvedCount > 0 ? Math.round((contactedCount / approvedCount) * 100) : 0;
  const approvedPct = contactedCount > 0 ? Math.round((ordersPlacedCount / contactedCount) * 100) : 0;

  // Orders subline
  const orderParts: string[] = [];
  if (shippedCount > 0) orderParts.push(`${shippedCount} shipped`);
  if (deliveredCount > 0) orderParts.push(`${deliveredCount} delivered`);

  return (
    <div
      className="mt-4 rounded-lg overflow-hidden"
      style={{
        background: "hsl(var(--background))",
        border: "0.5px solid hsl(var(--color-border-tertiary))",
        padding: "16px 20px",
        maxWidth: 760,
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: "3px 8px",
              borderRadius: "calc(var(--radius) - 2px)",
              background: "hsl(var(--color-background-secondary))",
              color: "hsl(var(--color-text-secondary))",
            }}
          >
            {campaignLabel}
          </span>
          {periodLabel && (
            <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--color-text-primary))" }}>
              {periodLabel}
            </span>
          )}
          <span style={{ fontSize: 13, color: "hsl(var(--color-text-secondary))" }}>
            {total} influencers
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: "calc(var(--radius) - 2px)",
              background: "#E6F1FB",
              color: "#0C447C",
            }}
          >
            {seeding} seeding
          </span>
          <span
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: "calc(var(--radius) - 2px)",
              background: "#E1F5EE",
              color: "#085041",
            }}
          >
            {recurring} recurring
          </span>
          <span
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: "calc(var(--radius) - 2px)",
              background: "#EEEDFE",
              color: "#3C3489",
            }}
          >
            {paid} paid
          </span>
        </div>
      </div>

      {/* Funnel grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 1,
          background: "hsl(var(--color-border-tertiary))",
          border: "0.5px solid hsl(var(--color-border-tertiary))",
          borderRadius: "calc(var(--radius) - 2px)",
          overflow: "hidden",
        }}
      >
        {/* Approved out of total roster */}
        <FunnelCell label="Approved" value={approvedCount} denominator={total}>
          <ProgressBar pct={total > 0 ? Math.round((approvedCount / total) * 100) : 0} color="hsl(var(--color-text-primary))" />
        </FunnelCell>

        {/* Contacted */}
        <FunnelCell label="Contacted" value={contactedCount} denominator={approvedCount}>
          <ProgressBar pct={contactedPct} color="hsl(var(--color-text-danger))" />
        </FunnelCell>

        {/* Orders placed (from contacted) */}
        <FunnelCell label="Orders placed" value={ordersPlacedCount} denominator={contactedCount}>
          <ProgressBar pct={approvedPct} color="hsl(var(--color-text-primary))" />
        </FunnelCell>

        {/* Shipped/Delivered */}
        <FunnelCell label="Delivered" value={deliveredCount} denominator={ordersPlacedCount}>
          {orderParts.length > 0 && (
            <div style={{ fontSize: 11, color: "hsl(var(--color-text-tertiary))", marginTop: 2 }}>
              {orderParts.join(" \u00b7 ")}
            </div>
          )}
        </FunnelCell>

      </div>

      {/* Bottom row */}
      <div
        style={{
          display: "flex",
          gap: 24,
          paddingTop: 8,
          marginTop: 12,
          borderTop: "0.5px solid hsl(var(--color-border-tertiary))",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 11, color: "hsl(var(--color-text-secondary))" }}>
            Response rate
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--color-text-primary))" }}>
            {responseRate}%
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 11, color: "hsl(var(--color-text-secondary))" }}>
            Acceptance rate
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--color-text-primary))" }}>
            {acceptanceRate}%
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontSize: 11, color: "hsl(var(--color-text-secondary))" }}>
            Post rate
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: "hsl(var(--color-text-primary))" }}>
            {postRate}%
          </span>
        </div>
      </div>
    </div>
  );
}

function FunnelCell({
  label,
  value,
  denominator,
  children,
}: {
  label: string;
  value: number;
  denominator?: number;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ background: "hsl(var(--background))", padding: "10px 12px" }}>
      <div style={{ fontSize: 11, color: "hsl(var(--color-text-secondary))", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 500, color: "hsl(var(--color-text-primary))" }}>
        {value}
        {denominator !== undefined && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "hsl(var(--color-text-tertiary))",
            }}
          >
            {" "}/ {denominator}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div
      style={{
        height: 3,
        background: "hsl(var(--color-background-secondary))",
        borderRadius: 2,
        marginTop: 8,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${pct}%`,
          background: color,
          borderRadius: 2,
        }}
      />
    </div>
  );
}

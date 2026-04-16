"use client";

import { useState } from "react";
import {
  CampaignInfluencer,
  ShopifyOrderStatus,
  ProductSelection,
} from "@/types/database";
import { ChevronDown } from "lucide-react";

interface CampaignStatsPanelProps {
  campaignLabel: string;
  periodLabel?: string;
  campaignInfluencers: CampaignInfluencer[];
}

const COLORWAY_DOTS: Record<string, string> = {
  ivory: "#F5E6D3",
  cream: "#F5E6D3",
  white: "#E8E8E8",
  blue: "#B5D4F4",
  navy: "#2C3E6B",
  black: "#2C2C2A",
  red: "#E07070",
  pink: "#F4B5C8",
  green: "#A8D5BA",
  brown: "#A0785A",
  beige: "#D4C5A9",
  grey: "#B0B0B0",
  gray: "#B0B0B0",
};

function getColorDot(colorway: string): string {
  const lower = colorway.toLowerCase().trim();
  for (const [key, hex] of Object.entries(COLORWAY_DOTS)) {
    if (lower.includes(key)) return hex;
  }
  return "#C4C4C4";
}

interface StyleGroup {
  style: string;
  total: number;
  colorways: { name: string; count: number }[];
}

function parseProductBreakdown(campaignInfluencers: CampaignInfluencer[]): StyleGroup[] {
  // Only include rows with an order
  const withOrders = campaignInfluencers.filter(
    (ci) => ci.shopify_order_status !== null
  );

  const colorwayMap = new Map<string, Map<string, number>>();

  for (const ci of withOrders) {
    if (!ci.product_selections) continue;
    for (const ps of ci.product_selections) {
      if (!ps.title && !ps.sku) continue;

      // Style name from title: strip brand prefix
      let styleName: string;
      if (ps.title) {
        const dashParts = ps.title.split(" - ");
        const rawStyle = dashParts[0].trim();
        const words = rawStyle.split(/\s+/);
        styleName = words.length > 2 ? words.slice(1).join(" ") : rawStyle;
      } else {
        styleName = "Unknown";
      }

      // Colorway from SKU: format is Fabric-StyleName-Color-Size e.g. BS-PLUNGE-IVORY-S
      let colorway = "Default";
      if (ps.sku) {
        const skuParts = ps.sku.split("-");
        if (skuParts.length >= 3) {
          // Third-to-last segment is the colorway
          const raw = skuParts[skuParts.length - 2];
          colorway = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
        }
      }

      if (!colorwayMap.has(styleName)) {
        colorwayMap.set(styleName, new Map());
      }
      const cwMap = colorwayMap.get(styleName)!;
      cwMap.set(colorway, (cwMap.get(colorway) || 0) + (ps.quantity || 1));
    }
  }

  const groups: StyleGroup[] = [];
  for (const [style, cwMap] of colorwayMap) {
    const colorways = Array.from(cwMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    const total = colorways.reduce((sum, cw) => sum + cw.count, 0);
    groups.push({ style, total, colorways });
  }

  groups.sort((a, b) => b.total - a.total);
  return groups;
}

export function CampaignStatsPanel({
  campaignLabel,
  periodLabel,
  campaignInfluencers,
}: CampaignStatsPanelProps) {
  const [productsOpen, setProductsOpen] = useState(false);
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

  const orderStatuses: ShopifyOrderStatus[] = ["draft", "fulfilled", "shipped", "delivered"];
  const ordersPlacedCount = approved.filter(
    (ci) => ci.shopify_order_status && orderStatuses.includes(ci.shopify_order_status)
  ).length;
  const shippedCount = approved.filter((ci) => ci.shopify_order_status === "shipped").length;
  const deliveredCount = approved.filter((ci) => ci.shopify_order_status === "delivered").length;

  const postedCount = approved.filter((ci) => ci.content_posted !== "none").length;

  // Rates — also scoped to approved
  const repliedCount = approved.filter(
    (ci) => ci.status !== "prospect" && ci.status !== "followed_up" && ci.status !== "order_follow_up_two_sent"
  ).length;
  const responseRate = contactedCount > 0 ? Math.round((repliedCount / contactedCount) * 100) : 0;
  const acceptanceRate = contactedCount > 0 ? Math.round((ordersPlacedCount / contactedCount) * 100) : 0;
  const postRate = deliveredCount > 0 ? Math.round((postedCount / deliveredCount) * 100) : 0;

  // Progress bar percentages
  const contactedPct = approvedCount > 0 ? Math.round((contactedCount / approvedCount) * 100) : 0;
  const approvedPct = contactedCount > 0 ? Math.round((ordersPlacedCount / contactedCount) * 100) : 0;

  // Orders subline
  const orderParts: string[] = [];
  if (shippedCount > 0) orderParts.push(`${shippedCount} shipped`);
  if (deliveredCount > 0) orderParts.push(`${deliveredCount} delivered`);

  // Products gifted breakdown
  const productGroups = parseProductBreakdown(campaignInfluencers);
  const hasProducts = productGroups.length > 0;

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
        <FunnelCell label="Approved" value={approvedCount} denominator={total}>
          <ProgressBar pct={total > 0 ? Math.round((approvedCount / total) * 100) : 0} color="hsl(var(--color-text-primary))" />
        </FunnelCell>

        <FunnelCell label="Contacted" value={contactedCount} denominator={approvedCount}>
          <ProgressBar pct={contactedPct} color="hsl(var(--color-text-danger))" />
        </FunnelCell>

        <FunnelCell label="Orders placed" value={ordersPlacedCount} denominator={contactedCount}>
          <ProgressBar pct={approvedPct} color="hsl(var(--color-text-primary))" />
        </FunnelCell>

        <FunnelCell label="Delivered" value={deliveredCount} denominator={ordersPlacedCount}>
          {orderParts.length > 0 && (
            <div style={{ fontSize: 11, color: "hsl(var(--color-text-tertiary))", marginTop: 2 }}>
              {orderParts.join(" \u00b7 ")}
            </div>
          )}
        </FunnelCell>
      </div>

      {/* Bottom row — rates */}
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

      {/* Products gifted — collapsible */}
      {hasProducts && (
        <div style={{ marginTop: 12, borderTop: "0.5px solid hsl(var(--color-border-tertiary))", paddingTop: 8 }}>
          <button
            onClick={() => setProductsOpen(!productsOpen)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "hsl(var(--color-text-secondary))",
            }}
          >
            Products gifted
            <ChevronDown
              style={{
                width: 14,
                height: 14,
                transition: "transform 0.15s",
                transform: productsOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>

          {productsOpen && (
            <div style={{ marginTop: 10 }}>
              {productGroups.map((group, gi) => {
                const maxCount = group.colorways[0]?.count || 1;
                return (
                  <div key={group.style}>
                    {gi > 0 && (
                      <div style={{ borderTop: "0.5px solid hsl(var(--color-border-tertiary))", margin: "8px 0" }} />
                    )}
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--color-text-primary))" }}>
                        {group.style}
                      </span>
                      <span style={{ fontSize: 12, color: "hsl(var(--color-text-tertiary))" }}>
                        {group.total} total
                      </span>
                    </div>
                    {group.colorways.map((cw) => (
                      <div
                        key={cw.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 4,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: getColorDot(cw.name),
                            flexShrink: 0,
                            border: "0.5px solid hsl(var(--color-border-tertiary))",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            color: "hsl(var(--color-text-secondary))",
                            width: 60,
                            flexShrink: 0,
                          }}
                        >
                          {cw.name}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: 4,
                            background: "hsl(var(--color-background-secondary))",
                            borderRadius: 2,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.round((cw.count / maxCount) * 100)}%`,
                              background: "hsl(var(--color-text-tertiary))",
                              borderRadius: 2,
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 500,
                            color: "hsl(var(--color-text-primary))",
                            minWidth: 20,
                            textAlign: "right",
                          }}
                        >
                          {cw.count}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
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

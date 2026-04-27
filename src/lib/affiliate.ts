import { getShopifyAccessToken, getShopifyStoreUrl } from "./shopify";

export interface RefundAdjustment {
  order_id: number;
  order_number: number | string;
  previous_refund: number;
  current_refund: number;
  delta: number; // positive = additional refund amount
  commission_delta: number; // negative = amount to deduct
}

export interface RefundAdjustmentResult {
  adjustments: RefundAdjustment[];
  total_commission_delta: number; // negative number
}

/**
 * Check for new refunds on orders from a past month by comparing stored order
 * snapshots with current Shopify refund data. Returns the commission delta.
 *
 * Uses a single orders.json call with financial_status filter instead of
 * fetching refunds for every stored order (1 call instead of N).
 */
export async function checkRefundAdjustments(
  storedOrders: AffiliateOrder[],
  discountCode: string,
  month: string,
  commissionRate: number
): Promise<RefundAdjustmentResult> {
  if (!storedOrders || storedOrders.length === 0) {
    return { adjustments: [], total_commission_delta: 0 };
  }

  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();
  if (!storeUrl || !accessToken) {
    return { adjustments: [], total_commission_delta: 0 };
  }

  // Build lookup of non-excluded stored orders by ID
  const storedOrderMap = new Map<number, AffiliateOrder>();
  for (const order of storedOrders) {
    if (!order.excluded) {
      storedOrderMap.set(order.order_id, order);
    }
  }

  // Single API call: fetch refunded/partially_refunded orders in the month
  const [year, mon] = month.split("-").map(Number);
  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();
  const codeUpper = discountCode.toUpperCase();

  const refundedOrders: any[] = [];
  let pageUrl: string | null =
    `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&financial_status=refunded,partially_refunded&limit=250&created_at_min=${startDate}&created_at_max=${endDate}`;

  while (pageUrl) {
    try {
      const res: Response = await fetch(pageUrl, {
        headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
      });
      if (!res.ok) break;

      const data = await res.json();
      for (const order of data.orders || []) {
        const codes = (order.discount_codes || []).map((dc: any) => dc.code?.toUpperCase());
        if (codes.includes(codeUpper) && storedOrderMap.has(order.id)) {
          refundedOrders.push(order);
        }
      }

      const linkHeader = res.headers.get("Link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        pageUrl = match ? match[1] : null;
      } else {
        pageUrl = null;
      }
    } catch {
      break;
    }
  }

  // Only fetch detailed refund amounts for the matching refunded orders
  const adjustments: RefundAdjustment[] = [];

  for (const order of refundedOrders) {
    const storedOrder = storedOrderMap.get(order.id)!;

    try {
      const refundRes = await fetch(
        `https://${storeUrl}/admin/api/2024-01/orders/${order.id}/refunds.json`,
        { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
      );
      if (!refundRes.ok) continue;

      const refundData = await refundRes.json();
      let currentRefund = 0;
      for (const refund of refundData.refunds || []) {
        for (const lineItem of refund.refund_line_items || []) {
          currentRefund += parseFloat(lineItem.subtotal || "0");
        }
      }
      currentRefund = Math.round(currentRefund * 100) / 100;

      const previousRefund = storedOrder.refund_amount || 0;
      const delta = Math.round((currentRefund - previousRefund) * 100) / 100;

      if (delta > 0.01) {
        const commissionDelta = Math.round(delta * commissionRate * -100) / 100;
        adjustments.push({
          order_id: storedOrder.order_id,
          order_number: storedOrder.order_number,
          previous_refund: previousRefund,
          current_refund: currentRefund,
          delta,
          commission_delta: commissionDelta,
        });
      }
    } catch {
      // Skip orders we can't check
    }
  }

  const total_commission_delta = adjustments.reduce((sum, a) => sum + a.commission_delta, 0);

  return {
    adjustments,
    total_commission_delta: Math.round(total_commission_delta * 100) / 100,
  };
}

export interface AffiliateOrder {
  order_id: number;
  order_number: number | string;
  created_at: string;
  gross_amount: number;
  refund_amount: number;
  net_amount: number;
  customer_name: string | null;
  customer_email: string | null;
  referring_site: string | null;
  landing_site: string | null;
  source_name: string | null;
  excluded?: boolean;
}

export interface AffiliateResult {
  orders: AffiliateOrder[];
  summary: {
    order_count: number;
    total_gross: number;
    total_refunds: number;
    total_net: number;
    commission_rate: number;
    commission_owed: number;
  };
}

export async function calculateAffiliateCommission(
  discountCode: string,
  month: string | null,
  commissionRate: number, // as decimal, e.g. 0.1 for 10%
  excludedOrderIds: number[] = []
): Promise<AffiliateResult> {
  const excludedSet = new Set(excludedOrderIds);
  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();

  if (!storeUrl || !accessToken) {
    return { orders: [], summary: { order_count: 0, total_gross: 0, total_refunds: 0, total_net: 0, commission_rate: commissionRate, commission_owed: 0 } };
  }

  let allOrders: any[] = [];
  let pageUrl: string | null = `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250`;

  if (month) {
    const [year, mon] = month.split("-").map(Number);
    const startDate = new Date(year, mon - 1, 1).toISOString();
    const endDate = new Date(year, mon, 1).toISOString();
    pageUrl = `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${startDate}&created_at_max=${endDate}`;
  }

  while (pageUrl) {
    const res: Response = await fetch(pageUrl, {
      headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
    });

    if (!res.ok) break;

    const data = await res.json();
    const codeUpper = discountCode.toUpperCase();
    for (const order of data.orders || []) {
      const codes = (order.discount_codes || []).map((dc: any) => dc.code?.toUpperCase());
      if (codes.includes(codeUpper)) {
        allOrders.push(order);
      }
    }

    const linkHeader = res.headers.get("Link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      pageUrl = match ? match[1] : null;
    } else {
      pageUrl = null;
    }
  }

  // Fetch refund details for all matching orders in parallel (batches of 10)
  const orderDetails: AffiliateResult["orders"] = [];
  let totalGross = 0;
  let totalRefunds = 0;

  const BATCH_SIZE = 10;
  for (let i = 0; i < allOrders.length; i += BATCH_SIZE) {
    const batch = allOrders.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (order) => {
      const grossAmount = parseFloat(order.subtotal_price || "0");
      let refundAmount = 0;
      try {
        const refundRes = await fetch(
          `https://${storeUrl}/admin/api/2024-01/orders/${order.id}/refunds.json`,
          { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
        );
        if (refundRes.ok) {
          const refundData = await refundRes.json();
          for (const refund of refundData.refunds || []) {
            for (const lineItem of refund.refund_line_items || []) {
              refundAmount += parseFloat(lineItem.subtotal || "0");
            }
          }
        }
      } catch {}
      return { order, grossAmount, refundAmount: Math.round(refundAmount * 100) / 100 };
    }));

    for (const { order, grossAmount, refundAmount } of results) {
      const netAmount = Math.round((grossAmount - refundAmount) * 100) / 100;
      orderDetails.push({
        order_id: order.id,
        order_number: order.order_number || order.name,
        created_at: order.created_at,
        gross_amount: grossAmount,
        refund_amount: refundAmount,
        net_amount: netAmount,
        customer_name: order.customer ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim() : null,
        customer_email: order.customer?.email || order.email || null,
        referring_site: order.referring_site || null,
        landing_site: order.landing_site || null,
        source_name: order.source_name || null,
        excluded: excludedSet.has(order.id),
      });
      if (!excludedSet.has(order.id)) {
        totalGross += grossAmount;
        totalRefunds += refundAmount;
      }
    }
  }

  orderDetails.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalNet = Math.round((totalGross - totalRefunds) * 100) / 100;
  const commissionOwed = Math.round(totalNet * commissionRate * 100) / 100;

  return {
    orders: orderDetails,
    summary: {
      order_count: orderDetails.length,
      total_gross: Math.round(totalGross * 100) / 100,
      total_refunds: Math.round(totalRefunds * 100) / 100,
      total_net: totalNet,
      commission_rate: commissionRate,
      commission_owed: commissionOwed,
    },
  };
}

/**
 * Lightweight: list gross-amount orders for a discount code in a month.
 * Skips the per-order refund detail call (saves N HTTP calls), so it's
 * appropriate for surfaces that only need a chart-level revenue number.
 */
export async function listAffiliateOrdersGross(
  discountCode: string,
  month: string,
): Promise<Array<{ order_id: number; created_at: string; gross_amount: number }>> {
  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();
  if (!storeUrl || !accessToken) return [];

  const [year, mon] = month.split("-").map(Number);
  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();
  let pageUrl: string | null = `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${startDate}&created_at_max=${endDate}&fields=id,name,order_number,created_at,subtotal_price,discount_codes`;

  const codeUpper = discountCode.toUpperCase();
  const out: Array<{ order_id: number; created_at: string; gross_amount: number }> = [];

  while (pageUrl) {
    const res: Response = await fetch(pageUrl, {
      headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
    });
    if (!res.ok) break;
    const data = await res.json();
    for (const order of data.orders || []) {
      const codes = (order.discount_codes || []).map((dc: any) => dc.code?.toUpperCase());
      if (codes.includes(codeUpper)) {
        out.push({
          order_id: order.id,
          created_at: order.created_at,
          gross_amount: parseFloat(order.subtotal_price || "0"),
        });
      }
    }
    const linkHeader = res.headers.get("Link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      pageUrl = match ? match[1] : null;
    } else {
      pageUrl = null;
    }
  }
  return out;
}

/**
 * Calculate affiliate commissions for multiple discount codes in a single pass.
 * Pages through all orders for the month once, matching against all codes simultaneously.
 */
export async function calculateBulkAffiliateCommissions(
  codes: { code: string; commissionRate: number; excludedOrderIds?: number[] }[],
  month: string
): Promise<Map<string, AffiliateResult>> {
  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();
  const results = new Map<string, AffiliateResult>();

  // Initialize empty results for all codes
  for (const c of codes) {
    results.set(c.code.toUpperCase(), {
      orders: [],
      summary: { order_count: 0, total_gross: 0, total_refunds: 0, total_net: 0, commission_rate: c.commissionRate, commission_owed: 0 },
    });
  }

  if (!storeUrl || !accessToken || codes.length === 0) return results;

  const codeSet = new Map(codes.map((c) => [c.code.toUpperCase(), c]));
  const excludedSets = new Map(codes.map((c) => [c.code.toUpperCase(), new Set(c.excludedOrderIds || [])]));

  // Single pass: page through all orders for the month
  const [year, mon] = month.split("-").map(Number);
  const startDate = new Date(year, mon - 1, 1).toISOString();
  const endDate = new Date(year, mon, 1).toISOString();

  const matchedOrders: { order: any; codeUpper: string }[] = [];
  let pageUrl: string | null = `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${startDate}&created_at_max=${endDate}`;

  while (pageUrl) {
    const res: Response = await fetch(pageUrl, {
      headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
    });
    if (!res.ok) break;

    const data = await res.json();
    for (const order of data.orders || []) {
      const orderCodes = (order.discount_codes || []).map((dc: any) => dc.code?.toUpperCase());
      for (const oc of orderCodes) {
        if (codeSet.has(oc)) {
          matchedOrders.push({ order, codeUpper: oc });
        }
      }
    }

    const linkHeader = res.headers.get("Link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      pageUrl = match ? match[1] : null;
    } else {
      pageUrl = null;
    }
  }

  // Fetch refunds in parallel batches
  const BATCH_SIZE = 10;
  const processedOrders: { codeUpper: string; order: any; grossAmount: number; refundAmount: number }[] = [];

  for (let i = 0; i < matchedOrders.length; i += BATCH_SIZE) {
    const batch = matchedOrders.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(async ({ order, codeUpper }) => {
      const grossAmount = parseFloat(order.subtotal_price || "0");
      let refundAmount = 0;
      try {
        const refundRes = await fetch(
          `https://${storeUrl}/admin/api/2024-01/orders/${order.id}/refunds.json`,
          { headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" } }
        );
        if (refundRes.ok) {
          const refundData = await refundRes.json();
          for (const refund of refundData.refunds || []) {
            for (const lineItem of refund.refund_line_items || []) {
              refundAmount += parseFloat(lineItem.subtotal || "0");
            }
          }
        }
      } catch {}
      return { codeUpper, order, grossAmount, refundAmount: Math.round(refundAmount * 100) / 100 };
    }));
    processedOrders.push(...batchResults);
  }

  // Group results by code
  for (const { codeUpper, order, grossAmount, refundAmount } of processedOrders) {
    const result = results.get(codeUpper)!;
    const config = codeSet.get(codeUpper)!;
    const excluded = excludedSets.get(codeUpper)!;
    const netAmount = Math.round((grossAmount - refundAmount) * 100) / 100;

    result.orders.push({
      order_id: order.id,
      order_number: order.order_number || order.name,
      created_at: order.created_at,
      gross_amount: grossAmount,
      refund_amount: refundAmount,
      net_amount: netAmount,
      customer_name: order.customer ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim() : null,
      customer_email: order.customer?.email || order.email || null,
      referring_site: order.referring_site || null,
      landing_site: order.landing_site || null,
      source_name: order.source_name || null,
      excluded: excluded.has(order.id),
    });

    if (!excluded.has(order.id)) {
      result.summary.total_gross += grossAmount;
      result.summary.total_refunds += refundAmount;
    }
  }

  // Finalize summaries
  for (const [codeUpper, result] of results) {
    result.orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    result.summary.order_count = result.orders.length;
    result.summary.total_gross = Math.round(result.summary.total_gross * 100) / 100;
    result.summary.total_refunds = Math.round(result.summary.total_refunds * 100) / 100;
    result.summary.total_net = Math.round((result.summary.total_gross - result.summary.total_refunds) * 100) / 100;
    result.summary.commission_owed = Math.round(result.summary.total_net * result.summary.commission_rate * 100) / 100;
  }

  return results;
}

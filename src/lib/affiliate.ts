import { getShopifyAccessToken, getShopifyStoreUrl } from "./shopify";

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

  const orderDetails: AffiliateResult["orders"] = [];
  let totalGross = 0;
  let totalRefunds = 0;

  for (const order of allOrders) {
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

    const netAmount = Math.round((grossAmount - refundAmount) * 100) / 100;
    orderDetails.push({
      order_id: order.id,
      order_number: order.order_number || order.name,
      created_at: order.created_at,
      gross_amount: grossAmount,
      refund_amount: Math.round(refundAmount * 100) / 100,
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

import { NextRequest, NextResponse } from "next/server";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

export async function GET(request: NextRequest) {
  const discountCode = request.nextUrl.searchParams.get("discount_code");
  const month = request.nextUrl.searchParams.get("month");
  const commissionRateParam = request.nextUrl.searchParams.get("commission_rate");

  if (!discountCode) {
    return NextResponse.json({ error: "discount_code required" }, { status: 400 });
  }

  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();

  if (!storeUrl || !accessToken) {
    return NextResponse.json({ error: "Shopify credentials not configured" }, { status: 500 });
  }

  const commissionRate = commissionRateParam ? parseFloat(commissionRateParam) / 100 : 0.1;

  try {
    // Fetch all orders with this discount code
    let allOrders: any[] = [];
    let pageUrl: string | null =
      `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250`;

    // Shopify doesn't support discount_code as a direct filter param on REST,
    // so we fetch and filter client-side, or use the discount_codes param if available
    // Actually Shopify REST does not have a discount_code filter. We need to fetch
    // orders and check discount_codes array. For efficiency, let's use a reasonable window.
    // If month is specified, build date range for created_at filter.
    if (month) {
      const [year, mon] = month.split("-").map(Number);
      const startDate = new Date(year, mon - 1, 1).toISOString();
      const endDate = new Date(year, mon, 1).toISOString();
      pageUrl = `https://${storeUrl}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=${startDate}&created_at_max=${endDate}`;
    }

    // Paginate through orders
    while (pageUrl) {
      const res: Response = await fetch(pageUrl, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("Shopify orders fetch failed:", errText);
        return NextResponse.json({ error: "Failed to fetch orders from Shopify" }, { status: 500 });
      }

      const data = await res.json();
      const orders = data.orders || [];

      // Filter orders that used this discount code
      const codeUpper = discountCode.toUpperCase();
      for (const order of orders) {
        const codes = (order.discount_codes || []).map((dc: any) => dc.code?.toUpperCase());
        if (codes.includes(codeUpper)) {
          allOrders.push(order);
        }
      }

      // Check for next page via Link header
      const linkHeader = res.headers.get("Link");
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        pageUrl = match ? match[1] : null;
      } else {
        pageUrl = null;
      }
    }

    // For each matching order, fetch refunds and calculate net
    const orderDetails: any[] = [];
    let totalGross = 0;
    let totalRefunds = 0;

    for (const order of allOrders) {
      const grossAmount = parseFloat(order.subtotal_price || "0");

      // Fetch refunds
      let refundAmount = 0;
      try {
        const refundRes = await fetch(
          `https://${storeUrl}/admin/api/2024-01/orders/${order.id}/refunds.json`,
          {
            headers: {
              "X-Shopify-Access-Token": accessToken,
              "Content-Type": "application/json",
            },
          }
        );
        if (refundRes.ok) {
          const refundData = await refundRes.json();
          for (const refund of refundData.refunds || []) {
            // Sum line item refunds only (not shipping)
            for (const lineItem of refund.refund_line_items || []) {
              refundAmount += parseFloat(lineItem.subtotal || "0");
            }
          }
        }
      } catch (err) {
        console.error(`Failed to fetch refunds for order ${order.id}:`, err);
      }

      const netAmount = Math.round((grossAmount - refundAmount) * 100) / 100;

      orderDetails.push({
        order_id: order.id,
        order_number: order.order_number || order.name,
        created_at: order.created_at,
        gross_amount: grossAmount,
        refund_amount: Math.round(refundAmount * 100) / 100,
        net_amount: netAmount,
      });

      totalGross += grossAmount;
      totalRefunds += refundAmount;
    }

    // Sort by date descending
    orderDetails.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const totalNet = Math.round((totalGross - totalRefunds) * 100) / 100;
    const commissionOwed = Math.round(totalNet * commissionRate * 100) / 100;

    return NextResponse.json({
      orders: orderDetails,
      summary: {
        order_count: orderDetails.length,
        total_gross: Math.round(totalGross * 100) / 100,
        total_refunds: Math.round(totalRefunds * 100) / 100,
        total_net: totalNet,
        commission_rate: commissionRate,
        commission_owed: commissionOwed,
      },
    });
  } catch (err: any) {
    console.error("Affiliate orders error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}

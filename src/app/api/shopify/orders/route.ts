import { NextRequest, NextResponse } from "next/server";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

interface LineItem {
  variant_id: string | number;
  quantity: number;
}

interface ShopifyDraftOrder {
  id: number;
  name: string;
  status: string;
  invoice_url: string;
  admin_graphql_api_id: string;
  line_items: {
    id: number;
    variant_id: number;
    product_id: number;
    title: string;
    quantity: number;
    price: string;
  }[];
  customer: {
    id: number;
    email: string;
  } | null;
}

interface ShopifyDraftOrderResponse {
  draft_order: ShopifyDraftOrder;
}

// POST - Create a draft order
export async function POST(request: NextRequest) {
  const SHOPIFY_STORE_URL = getShopifyStoreUrl();
  const SHOPIFY_ACCESS_TOKEN = await getShopifyAccessToken();

  if (!SHOPIFY_STORE_URL) {
    return NextResponse.json(
      { error: "Shopify store URL not configured" },
      { status: 500 }
    );
  }

  if (!SHOPIFY_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "Shopify not connected. Please connect your Shopify store first.", needsAuth: true },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { customer_id, line_items, note, tags } = body as {
      customer_id?: string | number;
      line_items: LineItem[];
      note?: string;
      tags?: string;
    };

    if (!line_items || line_items.length === 0) {
      return NextResponse.json(
        { error: "At least one line item is required" },
        { status: 400 }
      );
    }

    // Build draft order payload
    const draftOrderData: {
      draft_order: {
        line_items: { variant_id: number; quantity: number; applied_discount: { value_type: string; value: string } }[];
        customer?: { id: number };
        note?: string;
        tags?: string;
        use_customer_default_address?: boolean;
      };
    } = {
      draft_order: {
        line_items: line_items.map((item) => ({
          variant_id: Number(item.variant_id),
          quantity: item.quantity,
          // Apply 100% discount for gifting ($0 orders)
          applied_discount: {
            value_type: "percentage",
            value: "100.0",
          },
        })),
        use_customer_default_address: true,
      },
    };

    if (customer_id) {
      draftOrderData.draft_order.customer = { id: Number(customer_id) };
    }

    if (note) {
      draftOrderData.draft_order.note = note;
    }

    if (tags) {
      draftOrderData.draft_order.tags = tags;
    }

    const response = await fetch(
      `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/draft_orders.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftOrderData),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Shopify API error:", errorData);
      return NextResponse.json(
        { error: errorData.errors || "Failed to create draft order in Shopify" },
        { status: response.status }
      );
    }

    const data: ShopifyDraftOrderResponse = await response.json();

    // Build admin URL for the draft order
    const adminUrl = `https://${SHOPIFY_STORE_URL}/admin/draft_orders/${data.draft_order.id}`;

    return NextResponse.json({
      order: {
        id: data.draft_order.id,
        name: data.draft_order.name,
        status: "draft",
        admin_url: adminUrl,
        invoice_url: data.draft_order.invoice_url,
        line_items: data.draft_order.line_items,
        customer: data.draft_order.customer,
      },
    });
  } catch (error) {
    console.error("Shopify draft order create error:", error);
    return NextResponse.json(
      { error: "Failed to create draft order" },
      { status: 500 }
    );
  }
}

// GET - Get draft order status
export async function GET(request: NextRequest) {
  const SHOPIFY_STORE_URL = getShopifyStoreUrl();
  const SHOPIFY_ACCESS_TOKEN = await getShopifyAccessToken();

  if (!SHOPIFY_STORE_URL) {
    return NextResponse.json(
      { error: "Shopify store URL not configured" },
      { status: 500 }
    );
  }

  if (!SHOPIFY_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "Shopify not connected. Please connect your Shopify store first.", needsAuth: true },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const orderId = searchParams.get("id");

  if (!orderId) {
    return NextResponse.json({ error: "Order ID is required" }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/draft_orders/${orderId}.json`,
      {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: "Draft order not found" },
          { status: 404 }
        );
      }
      const errorText = await response.text();
      console.error("Shopify API error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch draft order from Shopify" },
        { status: response.status }
      );
    }

    const data: ShopifyDraftOrderResponse = await response.json();
    const adminUrl = `https://${SHOPIFY_STORE_URL}/admin/draft_orders/${data.draft_order.id}`;

    // Determine order status — completed draft stays "draft" until webhook/cron picks up fulfillment
    let status = "draft";
    if (data.draft_order.status === "completed") {
      status = "draft";
    } else if (data.draft_order.status === "invoice_sent") {
      status = "draft";
    }

    return NextResponse.json({
      order: {
        id: data.draft_order.id,
        name: data.draft_order.name,
        status,
        admin_url: adminUrl,
        invoice_url: data.draft_order.invoice_url,
        line_items: data.draft_order.line_items,
        customer: data.draft_order.customer,
      },
    });
  } catch (error) {
    console.error("Shopify draft order fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch draft order" },
      { status: 500 }
    );
  }
}

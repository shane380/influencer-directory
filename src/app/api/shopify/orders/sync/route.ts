import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";
import { OrderLineItem } from "@/types/database";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  total_price: string;
  financial_status: string;
  fulfillment_status: string | null;
  fulfillments: {
    status: string;
    tracking_url: string | null;
    shipment_status: string | null;
  }[];
  line_items: {
    title: string;
    variant_title: string | null;
    sku: string;
    quantity: number;
    image?: { src: string } | null;
    product_id?: number;
  }[];
}

interface ShopifyOrdersResponse {
  orders: ShopifyOrder[];
}

// POST - Sync orders for a Shopify customer
// Fetches all orders since Jan 2024 (Shopify defaults to ~60 days without created_at_min)
export async function POST(request: NextRequest) {
  console.log("=== ORDER SYNC STARTED ===");

  const SHOPIFY_STORE_URL = getShopifyStoreUrl();
  const SHOPIFY_ACCESS_TOKEN = await getShopifyAccessToken();

  console.log("Shopify Store URL:", SHOPIFY_STORE_URL);
  console.log("Has Access Token:", !!SHOPIFY_ACCESS_TOKEN);

  if (!SHOPIFY_STORE_URL) {
    console.log("ERROR: Shopify store URL not configured");
    return NextResponse.json(
      { error: "Shopify store URL not configured" },
      { status: 500 }
    );
  }

  if (!SHOPIFY_ACCESS_TOKEN) {
    console.log("ERROR: Shopify not connected");
    return NextResponse.json(
      { error: "Shopify not connected" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { influencer_id, shopify_customer_id, influencer_name } = body as {
      influencer_id: string;
      shopify_customer_id: string;
      influencer_name?: string;
    };

    console.log("Request body:", { influencer_id, shopify_customer_id, influencer_name });

    if (!influencer_id || !shopify_customer_id) {
      console.log("ERROR: Missing required fields");
      return NextResponse.json(
        { error: "influencer_id and shopify_customer_id are required" },
        { status: 400 }
      );
    }

    // Support multiple comma-separated customer IDs
    const customerIds = shopify_customer_id.split(",").map(id => id.trim()).filter(Boolean);
    const customerIdSet = new Set(customerIds);

    // Fetch orders for ALL linked customer IDs
    const allOrders: ShopifyOrder[] = [];
    const seenOrderIds = new Set<number>();
    // Track which customer ID each order belongs to
    const orderCustomerMap = new Map<number, string>();

    console.log("\n=== FETCHING ORDERS ===");
    console.log("Fetching orders for customer IDs:", customerIds);

    for (const customerId of customerIds) {
      // Fetch customer email for fallback
      let customerEmail: string | null = null;
      try {
        const customerUrl = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${customerId}.json`;
        const customerResponse = await fetch(customerUrl, {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        });
        if (customerResponse.ok) {
          const customerData = await customerResponse.json();
          customerEmail = customerData.customer?.email;
        }
      } catch {}

      // Fetch orders by customer ID
      const ordersUrl = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/orders.json?customer_id=${customerId}&status=any&limit=250&created_at_min=2024-01-01T00:00:00Z`;
      let nextPageUrl: string | null = ordersUrl;
      let foundOrders = false;

      while (nextPageUrl) {
        const fetchResponse: Response = await fetch(nextPageUrl, {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        });

        if (!fetchResponse.ok) break;

        const data: ShopifyOrdersResponse = await fetchResponse.json();
        for (const order of data.orders || []) {
          if (!seenOrderIds.has(order.id)) {
            seenOrderIds.add(order.id);
            allOrders.push(order);
            orderCustomerMap.set(order.id, customerId);
            foundOrders = true;
          }
        }

        const linkHeader: string | null = fetchResponse.headers.get("Link");
        if (linkHeader) {
          const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          nextPageUrl = nextMatch ? nextMatch[1] : null;
        } else {
          nextPageUrl = null;
        }
      }

      // Email fallback if no orders found for this customer
      if (!foundOrders && customerEmail) {
        const emailUrl = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/orders.json?email=${encodeURIComponent(customerEmail)}&status=any&limit=250&created_at_min=2024-01-01T00:00:00Z`;
        let emailPageUrl: string | null = emailUrl;

        while (emailPageUrl) {
          const emailFetchResponse: Response = await fetch(emailPageUrl, {
            method: "GET",
            headers: {
              "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
              "Content-Type": "application/json",
            },
          });

          if (!emailFetchResponse.ok) break;

          const emailData: ShopifyOrdersResponse = await emailFetchResponse.json();
          for (const order of emailData.orders || []) {
            if (!seenOrderIds.has(order.id)) {
              seenOrderIds.add(order.id);
              allOrders.push(order);
              orderCustomerMap.set(order.id, customerId);
            }
          }

          const linkHeader: string | null = emailFetchResponse.headers.get("Link");
          if (linkHeader) {
            const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
            emailPageUrl = nextMatch ? nextMatch[1] : null;
          } else {
            emailPageUrl = null;
          }
        }
      }
    }

    console.log("\n=== SYNC SUMMARY ===");
    console.log("Total orders fetched from Shopify:", allOrders.length);
    console.log("Customer IDs searched:", customerIds);

    if (allOrders.length === 0) {
      console.log("WARNING: No orders found! This could mean:");
      console.log("  1. No orders in the last ~60 days (Shopify API limitation)");
      console.log("  2. Customer ID doesn't match any orders");
      console.log("  3. API permissions issue");
    }

    // Fetch product images for line items that don't have them
    const productIds = new Set<number>();
    for (const order of allOrders) {
      for (const li of order.line_items) {
        if (!li.image?.src && li.product_id) {
          productIds.add(li.product_id);
        }
      }
    }

    const productImageMap: Record<number, string> = {};
    if (productIds.size > 0) {
      console.log("Fetching images for", productIds.size, "products...");
      const ids = Array.from(productIds).join(",");
      try {
        const imgRes = await fetch(
          `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products.json?ids=${ids}&fields=id,image`,
          { headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json" } }
        );
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          for (const p of imgData.products || []) {
            if (p.image?.src) {
              productImageMap[p.id] = p.image.src;
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch product images:", err);
      }
    }

    // Transform orders for database
    const ordersToUpsert = allOrders.map((order) => {
      const totalAmount = parseFloat(order.total_price);
      const lineItems = order.line_items.map((li) => ({
        product_name: li.title,
        variant_title: li.variant_title,
        sku: li.sku || "",
        quantity: li.quantity,
        image_url: li.image?.src || (li.product_id ? productImageMap[li.product_id] : null) || null,
      }));

      const fulfillment = order.fulfillments?.[0];

      return {
        influencer_id,
        shopify_order_id: String(order.id),
        shopify_customer_id: orderCustomerMap.get(order.id) || customerIds[0],
        order_number: order.name,
        order_date: order.created_at,
        total_amount: totalAmount,
        is_gift: totalAmount === 0,
        line_items: lineItems,
        fulfillment_status: order.fulfillment_status || 'unfulfilled',
        tracking_url: fulfillment?.tracking_url || null,
        delivery_status: fulfillment?.shipment_status || null,
        synced_at: new Date().toISOString(),
      };
    });

    // Database operations
    console.log("\n=== DATABASE OPERATIONS ===");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // First, check what orders exist for this influencer
    const { data: existingOrders } = await supabase
      .from("influencer_orders")
      .select("id, shopify_customer_id, order_number")
      .eq("influencer_id", influencer_id);

    console.log("Existing orders in database:", existingOrders?.length || 0);

    const wrongOrders = existingOrders?.filter(o => !customerIdSet.has(o.shopify_customer_id)) || [];
    console.log("Orders from unlinked customers:", wrongOrders.length);

    // Delete orders from unlinked customers
    if (wrongOrders.length > 0) {
      console.log("Deleting", wrongOrders.length, "orders from unlinked customers...");
      const wrongOrderIds = wrongOrders.map(o => o.id);

      const { error: cleanupError } = await supabase
        .from("influencer_orders")
        .delete()
        .in("id", wrongOrderIds);

      if (cleanupError) {
        console.error("Cleanup error:", cleanupError);
      } else {
        console.log("Successfully deleted wrong orders");
      }
    }

    // Upsert new orders
    if (ordersToUpsert.length > 0) {
      console.log("Upserting", ordersToUpsert.length, "orders to database...");
      const { error: upsertError } = await supabase
        .from("influencer_orders")
        .upsert(ordersToUpsert as never[], {
          onConflict: "shopify_order_id",
        });

      if (upsertError) {
        console.error("Supabase upsert error:", upsertError);
        return NextResponse.json(
          { error: "Failed to save orders to database" },
          { status: 500 }
        );
      }
      console.log("Upsert successful!");
    } else {
      console.log("No orders to upsert");
    }

    // Fetch and return the synced orders
    console.log("Fetching orders from database for influencer:", influencer_id);
    const { data: syncedOrders, error: fetchError } = await supabase
      .from("influencer_orders")
      .select("*")
      .eq("influencer_id", influencer_id)
      .order("order_date", { ascending: false });

    if (fetchError) {
      console.error("Supabase fetch error:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch synced orders" },
        { status: 500 }
      );
    }

    console.log("Database returned", syncedOrders?.length || 0, "orders");
    console.log("=== ORDER SYNC COMPLETE ===\n");

    return NextResponse.json({
      synced_count: ordersToUpsert.length,
      orders: syncedOrders || [],
    });
  } catch (error) {
    console.error("Order sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync orders" },
      { status: 500 }
    );
  }
}

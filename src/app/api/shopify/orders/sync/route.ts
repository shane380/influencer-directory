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
  line_items: {
    title: string;
    variant_title: string | null;
    sku: string;
    quantity: number;
  }[];
}

interface ShopifyOrdersResponse {
  orders: ShopifyOrder[];
}

// POST - Sync orders for a Shopify customer
// Note: Shopify API only returns orders from last ~60 days (older orders are archived)
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

    // First, get the customer's email and name from Shopify
    let customerEmail: string | null = null;
    let customerName: string | null = null;
    let customerOrdersCount: number | null = null;

    console.log("Fetching customer details from Shopify...");
    const customerUrl = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/customers/${shopify_customer_id}.json`;
    console.log("Customer URL:", customerUrl);

    try {
      const customerResponse = await fetch(customerUrl, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      });

      console.log("Customer API response status:", customerResponse.status);

      if (customerResponse.ok) {
        const customerData = await customerResponse.json();
        customerEmail = customerData.customer?.email;
        customerName = `${customerData.customer?.first_name || ""} ${customerData.customer?.last_name || ""}`.trim();
        customerOrdersCount = customerData.customer?.orders_count;
        console.log("Customer found:");
        console.log("  - Email:", customerEmail);
        console.log("  - Name:", customerName);
        console.log("  - Orders count (per Shopify):", customerOrdersCount);
      } else {
        const errorText = await customerResponse.text();
        console.log("Customer API error:", errorText);
      }
    } catch (err) {
      console.error("Failed to fetch customer details:", err);
    }

    // Fetch orders ONLY for the exact linked customer ID
    const allOrders: ShopifyOrder[] = [];
    const seenOrderIds = new Set<number>();

    console.log("\n=== FETCHING ORDERS ===");
    console.log("Fetching orders for exact customer ID:", shopify_customer_id);

    {
      const customerId = shopify_customer_id;
      // Note: Shopify API automatically limits to ~60 days of orders
      const ordersUrl = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/orders.json?customer_id=${customerId}&status=any&limit=250`;
      console.log("\nFetching orders for customer ID:", customerId);
      console.log("Orders URL:", ordersUrl);

      let nextPageUrl: string | null = ordersUrl;

      while (nextPageUrl) {
        const fetchResponse: Response = await fetch(nextPageUrl, {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        });

        console.log("Orders API response status:", fetchResponse.status);

        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          console.error("Shopify API error for customer", customerId, ":", fetchResponse.status, errorText);
          break;
        }

        const data: ShopifyOrdersResponse = await fetchResponse.json();
        console.log("Orders returned:", data.orders?.length || 0);

        if (data.orders?.length > 0) {
          console.log("Sample order:", {
            id: data.orders[0].id,
            name: data.orders[0].name,
            created_at: data.orders[0].created_at,
          });
        }

        // Add orders, avoiding duplicates
        for (const order of data.orders || []) {
          if (!seenOrderIds.has(order.id)) {
            seenOrderIds.add(order.id);
            allOrders.push(order);
          }
        }

        // Check for pagination
        const linkHeader: string | null = fetchResponse.headers.get("Link");
        if (linkHeader) {
          const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          nextPageUrl = nextMatch ? nextMatch[1] : null;
          if (nextPageUrl) {
            console.log("Has more pages, fetching next...");
          }
        } else {
          nextPageUrl = null;
        }
      }
    }

    // Also try searching by email if we have one and no orders found yet
    if (customerEmail && allOrders.length === 0) {
      console.log("\n=== EMAIL FALLBACK SEARCH ===");
      console.log("No orders found by customer ID, trying email search:", customerEmail);
      const emailUrl = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/orders.json?email=${encodeURIComponent(customerEmail)}&status=any&limit=250`;
      console.log("Email search URL:", emailUrl);
      let emailPageUrl: string | null = emailUrl;

      while (emailPageUrl) {
        const emailFetchResponse: Response = await fetch(emailPageUrl, {
          method: "GET",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        });

        console.log("Email search response status:", emailFetchResponse.status);

        if (!emailFetchResponse.ok) {
          const errorText = await emailFetchResponse.text();
          console.error("Shopify email search error:", emailFetchResponse.status, errorText);
          break;
        }

        const emailData: ShopifyOrdersResponse = await emailFetchResponse.json();
        console.log("Email search returned", emailData.orders?.length || 0, "orders");

        if (emailData.orders?.length > 0) {
          console.log("Sample order from email search:", {
            id: emailData.orders[0].id,
            name: emailData.orders[0].name,
            created_at: emailData.orders[0].created_at,
          });
        }

        for (const order of emailData.orders || []) {
          if (!seenOrderIds.has(order.id)) {
            seenOrderIds.add(order.id);
            allOrders.push(order);
          }
        }

        // Check for pagination
        const linkHeader: string | null = emailFetchResponse.headers.get("Link");
        if (linkHeader) {
          const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
          emailPageUrl = nextMatch ? nextMatch[1] : null;
        } else {
          emailPageUrl = null;
        }
      }
    }

    console.log("\n=== SYNC SUMMARY ===");
    console.log("Total orders fetched from Shopify:", allOrders.length);
    console.log("Customer ID searched:", shopify_customer_id);
    console.log("Customer email (for fallback):", customerEmail || "none");

    if (allOrders.length === 0) {
      console.log("WARNING: No orders found! This could mean:");
      console.log("  1. No orders in the last ~60 days (Shopify API limitation)");
      console.log("  2. Customer ID doesn't match any orders");
      console.log("  3. API permissions issue");
    }

    // Transform orders for database
    const ordersToUpsert = allOrders.map((order) => {
      const totalAmount = parseFloat(order.total_price);
      const lineItems: OrderLineItem[] = order.line_items.map((li) => ({
        product_name: li.title,
        variant_title: li.variant_title,
        sku: li.sku || "",
        quantity: li.quantity,
      }));

      return {
        influencer_id,
        shopify_order_id: String(order.id),
        shopify_customer_id,
        order_number: order.name,
        order_date: order.created_at,
        total_amount: totalAmount,
        is_gift: totalAmount === 0,
        line_items: lineItems,
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

    const wrongOrders = existingOrders?.filter(o => o.shopify_customer_id !== shopify_customer_id) || [];
    console.log("Orders from WRONG customers:", wrongOrders.length);
    if (wrongOrders.length > 0) {
      console.log("Wrong order IDs:", wrongOrders.map(o => o.id));
      console.log("Wrong order customer IDs:", [...new Set(wrongOrders.map(o => o.shopify_customer_id))]);
    }

    // Delete orders from wrong customers
    if (wrongOrders.length > 0) {
      console.log("Deleting", wrongOrders.length, "orders from wrong customers...");
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

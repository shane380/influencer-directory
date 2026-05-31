import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyShopifyWebhook } from "@/lib/shopify-webhook";

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface ShopifyFulfillment {
  id: number;
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
  tracking_numbers: string[];
  tracking_urls: string[];
  shipment_status: string | null;
}

interface ShopifyLineItem {
  title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
}

interface ShopifyOrder {
  id: number;
  name: string;
  created_at?: string;
  cancelled_at: string | null;
  financial_status: string;
  fulfillment_status: string | null;
  fulfillments: ShopifyFulfillment[];
  tags: string;
  note: string | null;
  note_attributes: { name: string; value: string }[];
  total_price?: string;
  customer?: { id: number } | null;
  line_items?: ShopifyLineItem[];
}

function determineStatus(order: ShopifyOrder): {
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
} {
  // Check fulfillments for shipping/delivery info
  if (order.fulfillments && order.fulfillments.length > 0) {
    const latestFulfillment = order.fulfillments[order.fulfillments.length - 1];

    if (latestFulfillment.shipment_status === "delivered") {
      return {
        status: "delivered",
        tracking_number: latestFulfillment.tracking_number || latestFulfillment.tracking_numbers?.[0] || null,
        tracking_url: latestFulfillment.tracking_url || latestFulfillment.tracking_urls?.[0] || null,
      };
    }

    if (latestFulfillment.tracking_number || latestFulfillment.tracking_numbers?.length > 0) {
      return {
        status: "shipped",
        tracking_number: latestFulfillment.tracking_number || latestFulfillment.tracking_numbers?.[0] || null,
        tracking_url: latestFulfillment.tracking_url || latestFulfillment.tracking_urls?.[0] || null,
      };
    }

    // Fulfilled but no tracking yet
    return {
      status: "fulfilled",
      tracking_number: null,
      tracking_url: null,
    };
  }

  // No fulfillments — still in draft/pre-fulfillment state
  return { status: "draft", tracking_number: null, tracking_url: null };
}

async function updateOrderStatus(
  realOrderId: string,
  status: string | null,
  trackingNumber: string | null,
  trackingUrl: string | null,
  clear: boolean = false
) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const updatePayload = clear
    ? {
        shopify_order_status: null,
        shopify_order_id: null,
        shopify_real_order_id: null,
        tracking_number: null,
        tracking_url: null,
        order_status_updated_at: now,
      }
    : {
        shopify_order_status: status,
        tracking_number: trackingNumber,
        tracking_url: trackingUrl,
        order_status_updated_at: now,
      };

  // Update campaign_influencers matching this real order ID
  await (supabase.from("campaign_influencers") as any)
    .update(updatePayload)
    .eq("shopify_real_order_id", realOrderId);

  // Update influencers matching this real order ID
  await (supabase.from("influencers") as any)
    .update(updatePayload)
    .eq("shopify_real_order_id", realOrderId);
}

// Fulfillment status for the gift_orders cache: placed | shipped | delivered.
function giftOrderStatus(order: ShopifyOrder): string {
  const ff = order.fulfillments || [];
  if (ff.some((f) => f.shipment_status === "delivered")) return "delivered";
  if (order.fulfillment_status === "fulfilled" || ff.length > 0) return "shipped";
  return "placed";
}

// Upsert an order into gift_orders if its customer is one of our influencers.
// Webhooks capture orders at creation, so they're recorded regardless of the
// Shopify Orders API's 60-day read window (the app lacks read_all_orders).
async function upsertGiftOrderFromWebhook(order: ShopifyOrder) {
  const customerId = order.customer?.id ? String(order.customer.id) : null;
  if (!customerId) return;

  const supabase = getSupabase();

  // Match the customer to an influencer (shopify_customer_id may be comma-listed).
  const { data: matches } = await (supabase.from("influencers") as any)
    .select("id, shopify_customer_id")
    .or(`shopify_customer_id.eq.${customerId},shopify_customer_id.ilike.%${customerId}%`);
  const inf = ((matches as any[]) || []).find((m) =>
    String(m.shopify_customer_id || "")
      .split(",")
      .map((s) => s.trim())
      .includes(customerId),
  );
  if (!inf) return; // not an influencer order — ignore

  const total = parseFloat(order.total_price || "0");
  const lineItems = (order.line_items || []).map((li) => ({
    product_name: li.title,
    variant_title: li.variant_title || null,
    sku: li.sku || "",
    quantity: li.quantity,
  }));

  await (supabase.from("gift_orders") as any).upsert(
    {
      shopify_order_id: String(order.id),
      shopify_customer_id: customerId,
      influencer_id: inf.id,
      order_number: order.name || "",
      order_date: order.created_at || new Date().toISOString(),
      total_amount: total,
      is_gift: total === 0,
      line_items: lineItems,
      tags: order.tags || "",
      order_status: giftOrderStatus(order),
      fulfillment_status: order.fulfillment_status || null,
      delivery_status: order.fulfillments?.[0]?.shipment_status || null,
      tracking_url: order.fulfillments?.[0]?.tracking_url || null,
      tracking_number: order.fulfillments?.[0]?.tracking_number || null,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "shopify_order_id" },
  );
}

async function deleteGiftOrderFromWebhook(orderId: string) {
  const supabase = getSupabase();
  await (supabase.from("gift_orders") as any).delete().eq("shopify_order_id", orderId);
}

async function handleOrderCreate(order: ShopifyOrder) {
  // Record the gift in gift_orders (independent of the draft-order linking below).
  await upsertGiftOrderFromWebhook(order);

  const supabase = getSupabase();
  const realOrderId = String(order.id);
  const now = new Date().toISOString();

  // Try to find the draft order ID from tags or note_attributes
  let draftOrderId: string | null = null;

  // Check note_attributes for draft_order_id
  if (order.note_attributes) {
    const attr = order.note_attributes.find(
      (a) => a.name === "draft_order_id"
    );
    if (attr) draftOrderId = attr.value;
  }

  // Check tags for draft order reference
  if (!draftOrderId && order.tags) {
    const match = order.tags.match(/draft_order_(\d+)/);
    if (match) draftOrderId = match[1];
  }

  if (!draftOrderId) {
    // Can't match without a draft order reference — skip
    console.log(`Webhook: orders/create for ${realOrderId} — no draft order reference found, skipping`);
    return;
  }

  // Store the real order ID alongside the draft order ID
  const updatePayload = {
    shopify_real_order_id: realOrderId,
    order_status_updated_at: now,
  };

  await (supabase.from("campaign_influencers") as any)
    .update(updatePayload)
    .eq("shopify_order_id", draftOrderId);

  await (supabase.from("influencers") as any)
    .update(updatePayload)
    .eq("shopify_order_id", draftOrderId);

  console.log(`Webhook: orders/create — linked real order ${realOrderId} to draft ${draftOrderId}`);
}

async function handleOrderFulfilled(order: ShopifyOrder) {
  const realOrderId = String(order.id);
  const { status, tracking_number, tracking_url } = determineStatus(order);
  await updateOrderStatus(realOrderId, status, tracking_number, tracking_url);
  await upsertGiftOrderFromWebhook(order);
  console.log(`Webhook: orders/fulfilled — order ${realOrderId} → ${status}`);
}

async function handleFulfillmentUpdate(order: ShopifyOrder) {
  const realOrderId = String(order.id);
  const { status, tracking_number, tracking_url } = determineStatus(order);
  await updateOrderStatus(realOrderId, status, tracking_number, tracking_url);
  await upsertGiftOrderFromWebhook(order);
  console.log(`Webhook: fulfillments/update — order ${realOrderId} → ${status}`);
}

async function handleOrderCancelled(order: ShopifyOrder) {
  const realOrderId = String(order.id);
  await updateOrderStatus(realOrderId, null, null, null, true);
  await deleteGiftOrderFromWebhook(realOrderId);
  console.log(`Webhook: orders/cancelled — order ${realOrderId} → cleared`);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  if (!hmacHeader || !verifyShopifyWebhook(rawBody, hmacHeader)) {
    console.error("Webhook HMAC verification failed");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const topic = request.headers.get("x-shopify-topic");
  const order: ShopifyOrder = JSON.parse(rawBody);

  try {
    switch (topic) {
      case "orders/create":
        await handleOrderCreate(order);
        break;
      case "orders/fulfilled":
        await handleOrderFulfilled(order);
        break;
      case "fulfillments/update":
        await handleFulfillmentUpdate(order);
        break;
      case "orders/cancelled":
        await handleOrderCancelled(order);
        break;
      default:
        console.log(`Webhook: unhandled topic ${topic}`);
    }
  } catch (error) {
    console.error(`Webhook error for topic ${topic}:`, error);
    // Still return 200 to prevent Shopify retries for processing errors
  }

  return NextResponse.json({ received: true });
}

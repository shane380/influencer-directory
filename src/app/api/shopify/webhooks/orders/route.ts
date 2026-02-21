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

interface ShopifyOrder {
  id: number;
  name: string;
  cancelled_at: string | null;
  financial_status: string;
  fulfillment_status: string | null;
  fulfillments: ShopifyFulfillment[];
  tags: string;
  note: string | null;
  note_attributes: { name: string; value: string }[];
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

async function handleOrderCreate(order: ShopifyOrder) {
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
  console.log(`Webhook: orders/fulfilled — order ${realOrderId} → ${status}`);
}

async function handleFulfillmentUpdate(order: ShopifyOrder) {
  const realOrderId = String(order.id);
  const { status, tracking_number, tracking_url } = determineStatus(order);
  await updateOrderStatus(realOrderId, status, tracking_number, tracking_url);
  console.log(`Webhook: fulfillments/update — order ${realOrderId} → ${status}`);
}

async function handleOrderCancelled(order: ShopifyOrder) {
  const realOrderId = String(order.id);
  await updateOrderStatus(realOrderId, null, null, null, true);
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

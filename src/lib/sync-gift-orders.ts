import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

// Recipient-based gift sync: for every influencer with a Shopify customer ID,
// pull that customer's orders and record the $0 ones as gifts. This is
// tag-independent — it catches warehouse/WMS-fulfilled gifts (tagged
// "sent-to-wms") and app-created ones (tagged "influencer") alike, because the
// signal is "this order went to one of our influencers and was free."

const API_VERSION = "2024-01";
const ORDER_FIELDS =
  "id,name,created_at,cancelled_at,total_price,tags,customer,line_items,fulfillment_status,fulfillments";

type LineItem = {
  product_name: string;
  variant_title: string | null;
  sku: string;
  quantity: number;
};

type GiftOrderRow = {
  shopify_order_id: string;
  shopify_customer_id: string | null;
  influencer_id: string | null;
  order_number: string;
  order_date: string;
  total_amount: number;
  is_gift: boolean;
  line_items: LineItem[];
  tags: string;
  order_status: string;
  synced_at: string;
};

// Derive a simple fulfillment status from a Shopify order.
//   delivered: a fulfillment reports delivered
//   shipped:   the order is fulfilled / has a fulfillment in transit
//   placed:    a real order exists but isn't fulfilled yet
function deriveOrderStatus(order: any): string {
  const fulfillments: any[] = order.fulfillments || [];
  if (fulfillments.some((f) => f.shipment_status === "delivered")) return "delivered";
  if (order.fulfillment_status === "fulfilled" || fulfillments.length > 0) return "shipped";
  return "placed";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

// Fetch with basic 429 backoff (Shopify rate limiting).
async function shopFetch(url: string, token: string, attempt = 0): Promise<Response> {
  const res: Response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
  });
  if (res.status === 429 && attempt < 6) {
    const retryAfter = Number(res.headers.get("Retry-After") || "2");
    await sleep(Math.max(1, retryAfter) * 1000);
    return shopFetch(url, token, attempt + 1);
  }
  return res;
}

// Walk all pages of an orders.json query.
async function fetchAllOrders(initialUrl: string, token: string): Promise<any[]> {
  const out: any[] = [];
  let url: string | null = initialUrl;
  while (url) {
    const res = await shopFetch(url, token);
    if (!res.ok) break;
    const data = await res.json();
    out.push(...(data.orders || []));
    url = nextPageUrl(res.headers.get("Link"));
  }
  return out;
}

function toRow(order: any, influencerId: string, nowISO: string): GiftOrderRow {
  const total = parseFloat(order.total_price);
  const lineItems: LineItem[] = (order.line_items || []).map((li: any) => ({
    product_name: li.title,
    variant_title: li.variant_title || null,
    sku: li.sku || "",
    quantity: li.quantity,
  }));
  return {
    shopify_order_id: String(order.id),
    shopify_customer_id: order.customer?.id ? String(order.customer.id) : null,
    influencer_id: influencerId,
    order_number: order.name || "",
    order_date: order.created_at,
    total_amount: total,
    is_gift: total === 0,
    line_items: lineItems,
    tags: order.tags || "",
    order_status: deriveOrderStatus(order),
    synced_at: nowISO,
  };
}

/**
 * Sync orders for every influencer (by Shopify customer ID, with email fallback)
 * into the gift_orders table. $0 orders are flagged is_gift.
 * @param db a Supabase client created with the service-role key.
 * @param opts.sinceISO only sync orders created on/after this ISO date (default 2024-01-01).
 */
export async function syncGiftOrders(
  db: any,
  opts: { sinceISO?: string } = {},
): Promise<{ influencers: number; fetched: number; gifts: number; upserted: number }> {
  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();
  if (!storeUrl || !accessToken) {
    throw new Error("Shopify not configured");
  }

  const sinceISO = opts.sinceISO || "2024-01-01T00:00:00Z";
  const base = `https://${storeUrl}/admin/api/${API_VERSION}/orders.json`;
  const common = `status=any&limit=250&fields=${ORDER_FIELDS}&created_at_min=${encodeURIComponent(sinceISO)}`;

  const { data: influencers } = await db
    .from("influencers")
    .select("id, shopify_customer_id, email")
    .not("shopify_customer_id", "is", null);

  const list = (influencers as any[]) || [];
  const rowsById = new Map<string, GiftOrderRow>(); // dedupe by shopify_order_id
  const nowISO = new Date().toISOString();
  let processed = 0;

  for (const inf of list) {
    processed++;
    const customerIds = String(inf.shopify_customer_id || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const collected: any[] = [];
    for (const cid of customerIds) {
      const orders = await fetchAllOrders(`${base}?customer_id=${cid}&${common}`, accessToken);
      collected.push(...orders);
      await sleep(120); // gentle throttle under Shopify's rate limit
    }

    // Email fallback only when the customer ID(s) returned nothing.
    if (collected.length === 0 && inf.email) {
      const orders = await fetchAllOrders(
        `${base}?email=${encodeURIComponent(inf.email)}&${common}`,
        accessToken,
      );
      collected.push(...orders);
      await sleep(120);
    }

    for (const order of collected) {
      if (order.cancelled_at) continue; // not actually sent
      const row = toRow(order, inf.id, nowISO);
      rowsById.set(row.shopify_order_id, row);
    }
  }

  const rows = Array.from(rowsById.values());
  const gifts = rows.filter((r) => r.is_gift).length;

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db.from("gift_orders").upsert(chunk, { onConflict: "shopify_order_id" });
    if (error) throw new Error(`gift_orders upsert failed: ${error.message}`);
    upserted += chunk.length;
  }

  return { influencers: processed, fetched: rows.length, gifts, upserted };
}

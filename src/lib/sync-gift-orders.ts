import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

// Pulls real Shopify orders tagged "influencer" and upserts them into the
// gift_orders cache. Uses the GraphQL Admin API so we filter by tag server-side
// and only walk the orders that matter. Draft orders are NOT included — the
// `orders` connection returns placed orders only, so gifts that were created as
// a draft but never completed don't count.

const API_VERSION = "2024-01";
const PAGE_SIZE = 50;

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
  synced_at: string;
};

function numericId(gid: string | null | undefined): string | null {
  if (!gid) return null;
  const parts = String(gid).split("/");
  return parts[parts.length - 1] || null;
}

const ORDERS_QUERY = `
  query GiftOrders($cursor: String, $query: String!) {
    orders(first: ${PAGE_SIZE}, after: $cursor, query: $query, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          name
          createdAt
          cancelledAt
          tags
          totalPriceSet { shopMoney { amount } }
          customer { id }
          lineItems(first: 50) {
            edges { node { title quantity sku variantTitle } }
          }
        }
      }
    }
  }
`;

/**
 * Sync orders tagged "influencer" into the gift_orders table.
 * @param db a Supabase client created with the service-role key.
 * @param opts.sinceISO only sync orders created on/after this ISO date (default: 2024-01-01).
 * @returns counts for logging.
 */
export async function syncGiftOrders(
  db: any,
  opts: { sinceISO?: string } = {},
): Promise<{ fetched: number; upserted: number; matched: number; unmatched: number }> {
  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();
  if (!storeUrl || !accessToken) {
    throw new Error("Shopify not configured");
  }

  const sinceISO = opts.sinceISO || "2024-01-01T00:00:00Z";
  const sinceDay = sinceISO.slice(0, 10);
  const searchQuery = `tag:influencer created_at:>=${sinceDay}`;

  // Build a customer_id -> influencer_id map. influencers.shopify_customer_id can
  // hold multiple comma-separated ids, so index each one.
  const { data: influencers } = await db
    .from("influencers")
    .select("id, shopify_customer_id")
    .not("shopify_customer_id", "is", null);
  const customerToInfluencer = new Map<string, string>();
  for (const inf of (influencers as any[]) || []) {
    for (const cid of String(inf.shopify_customer_id || "").split(",")) {
      const trimmed = cid.trim();
      if (trimmed) customerToInfluencer.set(trimmed, inf.id);
    }
  }

  const endpoint = `https://${storeUrl}/admin/api/${API_VERSION}/graphql.json`;
  const rows: GiftOrderRow[] = [];
  let matched = 0;
  let unmatched = 0;
  let cursor: string | null = null;
  let hasNext = true;
  const nowISO = new Date().toISOString();

  while (hasNext) {
    const res: Response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: ORDERS_QUERY,
        variables: { cursor, query: searchQuery },
      }),
    });
    if (!res.ok) {
      throw new Error(`Shopify GraphQL error: ${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    if (json.errors) {
      throw new Error(`Shopify GraphQL errors: ${JSON.stringify(json.errors)}`);
    }

    const conn = json.data?.orders;
    for (const edge of conn?.edges || []) {
      const node = edge.node;
      // Skip cancelled orders — they were not actually sent.
      if (node.cancelledAt) continue;

      const customerId = numericId(node.customer?.id);
      const influencerId = customerId ? customerToInfluencer.get(customerId) || null : null;
      if (influencerId) matched++;
      else unmatched++;

      const total = parseFloat(node.totalPriceSet?.shopMoney?.amount || "0");
      const lineItems: LineItem[] = (node.lineItems?.edges || []).map((li: any) => ({
        product_name: li.node.title,
        variant_title: li.node.variantTitle || null,
        sku: li.node.sku || "",
        quantity: li.node.quantity,
      }));

      rows.push({
        shopify_order_id: numericId(node.id) as string,
        shopify_customer_id: customerId,
        influencer_id: influencerId,
        order_number: node.name || "",
        order_date: node.createdAt,
        total_amount: total,
        is_gift: total === 0,
        line_items: lineItems,
        tags: Array.isArray(node.tags) ? node.tags.join(", ") : String(node.tags || ""),
        synced_at: nowISO,
      });
    }

    hasNext = !!conn?.pageInfo?.hasNextPage;
    cursor = conn?.pageInfo?.endCursor || null;
  }

  // Upsert in chunks to stay within payload limits.
  let upserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await db
      .from("gift_orders")
      .upsert(chunk, { onConflict: "shopify_order_id" });
    if (error) throw new Error(`gift_orders upsert failed: ${error.message}`);
    upserted += chunk.length;
  }

  return { fetched: rows.length, upserted, matched, unmatched };
}

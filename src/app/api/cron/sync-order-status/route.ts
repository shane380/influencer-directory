import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

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
  cancelled_at: string | null;
  financial_status: string;
  fulfillment_status: string | null;
  fulfillments: ShopifyFulfillment[];
}

interface ShopifyDraftOrder {
  id: number;
  status: string;
  order_id: number | null;
}

interface SyncRow {
  id: string;
  shopify_order_id: string | null;
  shopify_real_order_id: string | null;
  shopify_order_status: string | null;
  order_status_updated_at: string | null;
  _table: "campaign_influencers" | "influencers";
}

function determineStatusFromOrder(order: ShopifyOrder): {
  status: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  cancelled: boolean;
} {
  if (order.cancelled_at || order.financial_status === "refunded") {
    return { status: null, tracking_number: null, tracking_url: null, cancelled: true };
  }

  if (order.fulfillments && order.fulfillments.length > 0) {
    const latest = order.fulfillments[order.fulfillments.length - 1];

    if (latest.shipment_status === "delivered") {
      return {
        status: "delivered",
        tracking_number: latest.tracking_number || latest.tracking_numbers?.[0] || null,
        tracking_url: latest.tracking_url || latest.tracking_urls?.[0] || null,
        cancelled: false,
      };
    }

    if (latest.tracking_number || latest.tracking_numbers?.length > 0) {
      return {
        status: "shipped",
        tracking_number: latest.tracking_number || latest.tracking_numbers?.[0] || null,
        tracking_url: latest.tracking_url || latest.tracking_urls?.[0] || null,
        cancelled: false,
      };
    }

    return { status: "fulfilled", tracking_number: null, tracking_url: null, cancelled: false };
  }

  return { status: "draft", tracking_number: null, tracking_url: null, cancelled: false };
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();

  if (!storeUrl || !accessToken) {
    return NextResponse.json(
      { error: "Shopify not configured" },
      { status: 500 }
    );
  }

  const supabase = getSupabase();
  const now = new Date();
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString();

  // Fetch rows that need syncing: status is in-progress and not recently updated by webhook
  const { data: ciRows } = await (supabase.from("campaign_influencers") as any)
    .select("id, shopify_order_id, shopify_real_order_id, shopify_order_status, order_status_updated_at")
    .in("shopify_order_status", ["draft", "fulfilled", "shipped"])
    .or(`order_status_updated_at.is.null,order_status_updated_at.lt.${fourHoursAgo}`);

  const { data: infRows } = await (supabase.from("influencers") as any)
    .select("id, shopify_order_id, shopify_real_order_id, shopify_order_status, order_status_updated_at")
    .in("shopify_order_status", ["draft", "fulfilled", "shipped"])
    .or(`order_status_updated_at.is.null,order_status_updated_at.lt.${fourHoursAgo}`);

  // Tag each row with its source table
  const allRows: SyncRow[] = [
    ...(ciRows || []).map((r: any) => ({ ...r, _table: "campaign_influencers" as const })),
    ...(infRows || []).map((r: any) => ({ ...r, _table: "influencers" as const })),
  ];

  if (allRows.length === 0) {
    return NextResponse.json({ message: "No rows to sync", updated: 0 });
  }

  // Separate rows by whether they have a real order ID
  const rowsWithRealOrder: SyncRow[] = [];
  const rowsWithDraftOnly: SyncRow[] = [];

  for (const row of allRows) {
    if (row.shopify_real_order_id) {
      rowsWithRealOrder.push(row);
    } else if (row.shopify_order_id) {
      rowsWithDraftOnly.push(row);
    }
  }

  let updated = 0;
  const updateTime = new Date().toISOString();

  // 1. Fetch real orders in batch
  const realOrderIds = [...new Set(rowsWithRealOrder.map((r) => r.shopify_real_order_id))];
  if (realOrderIds.length > 0) {
    for (let i = 0; i < realOrderIds.length; i += 250) {
      const batch = realOrderIds.slice(i, i + 250);
      try {
        const res = await fetch(
          `https://${storeUrl}/admin/api/2024-01/orders.json?ids=${batch.join(",")}&status=any`,
          {
            headers: {
              "X-Shopify-Access-Token": accessToken,
              "Content-Type": "application/json",
            },
          }
        );
        if (res.ok) {
          const data = await res.json();
          const orders: ShopifyOrder[] = data.orders || [];
          const orderMap = new Map(orders.map((o) => [String(o.id), o]));

          for (const row of rowsWithRealOrder.filter((r) => batch.includes(r.shopify_real_order_id))) {
            const order = orderMap.get(row.shopify_real_order_id!);
            if (!order) continue;

            const result = determineStatusFromOrder(order);

            if (result.cancelled) {
              await (supabase.from(row._table) as any)
                .update({
                  shopify_order_status: null,
                  shopify_order_id: null,
                  shopify_real_order_id: null,
                  tracking_number: null,
                  tracking_url: null,
                  order_status_updated_at: updateTime,
                })
                .eq("id", row.id);
            } else if (result.status !== row.shopify_order_status) {
              await (supabase.from(row._table) as any)
                .update({
                  shopify_order_status: result.status,
                  tracking_number: result.tracking_number,
                  tracking_url: result.tracking_url,
                  order_status_updated_at: updateTime,
                })
                .eq("id", row.id);
            } else {
              await (supabase.from(row._table) as any)
                .update({ order_status_updated_at: updateTime })
                .eq("id", row.id);
            }
            updated++;
          }
        }
      } catch (error) {
        console.error("Cron: Error fetching real orders batch:", error);
      }
    }
  }

  // 2. Check draft orders that don't have a real order ID yet
  for (const row of rowsWithDraftOnly) {
    try {
      const res = await fetch(
        `https://${storeUrl}/admin/api/2024-01/draft_orders/${row.shopify_order_id}.json`,
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) continue;

      const data = await res.json();
      const draft: ShopifyDraftOrder = data.draft_order;

      if (draft.status === "completed" && draft.order_id) {
        // Draft was completed — store real order ID and fetch real order status
        const realOrderId = String(draft.order_id);
        const orderRes = await fetch(
          `https://${storeUrl}/admin/api/2024-01/orders/${realOrderId}.json`,
          {
            headers: {
              "X-Shopify-Access-Token": accessToken,
              "Content-Type": "application/json",
            },
          }
        );

        if (orderRes.ok) {
          const orderData = await orderRes.json();
          const result = determineStatusFromOrder(orderData.order);

          if (result.cancelled) {
            await (supabase.from(row._table) as any)
              .update({
                shopify_order_status: null,
                shopify_order_id: null,
                shopify_real_order_id: null,
                tracking_number: null,
                tracking_url: null,
                order_status_updated_at: updateTime,
              })
              .eq("id", row.id);
          } else {
            await (supabase.from(row._table) as any)
              .update({
                shopify_real_order_id: realOrderId,
                shopify_order_status: result.status,
                tracking_number: result.tracking_number,
                tracking_url: result.tracking_url,
                order_status_updated_at: updateTime,
              })
              .eq("id", row.id);
          }
        } else {
          await (supabase.from(row._table) as any)
            .update({
              shopify_real_order_id: realOrderId,
              order_status_updated_at: updateTime,
            })
            .eq("id", row.id);
        }
      } else {
        // Draft still pending — just update sync timestamp
        await (supabase.from(row._table) as any)
          .update({ order_status_updated_at: updateTime })
          .eq("id", row.id);
      }
      updated++;
    } catch (error) {
      console.error(`Cron: Error checking draft order ${row.shopify_order_id}:`, error);
    }
  }

  console.log(`Cron sync-order-status: processed ${updated} rows`);
  return NextResponse.json({ message: "Sync complete", updated });
}

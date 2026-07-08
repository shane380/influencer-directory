import { getLocations, getInventoryLevels } from "@/lib/shopify-inventory";

// Exact shipping names — these map character-for-character to the 3PL's
// USA-warehouse routing. Any spelling/casing change breaks order routing.
export const SHIPPING_INTERNATIONAL_DDP = "International shipping DDP";
export const SHIPPING_PRIORITY_NA = "Priority 2-3 business days";
export const SHIPPING_FREE_CANADA = "Free Canada Shipping";
export const SHIPPING_PRICE = "0.00";

export interface CustomShippingLine {
  custom: true;
  title: string;
  price: string;
}

export interface WarehouseStock {
  usCanFulfillAll: boolean;
  caCanFulfillAll: boolean;
}

export type FallbackReason = "no_customer" | "no_country" | "stock_check_failed" | "error";

export interface ShippingResolution {
  shippingLine: CustomShippingLine | null;
  shippingName: string | null;
  warehousePrediction: "US" | "CA" | "unknown" | null;
  requiresDdpFollowup: boolean;
  fallback: boolean;
  fallbackReason?: FallbackReason;
}

export function fallbackResolution(reason: FallbackReason): ShippingResolution {
  return {
    shippingLine: null,
    shippingName: null,
    warehousePrediction: null,
    requiresDdpFollowup: false,
    fallback: true,
    fallbackReason: reason,
  };
}

function shippingLine(title: string): CustomShippingLine {
  return { custom: true, title, price: SHIPPING_PRICE };
}

// Rules (destination country → shipping name, all $0.00):
//  US                                → "Priority 2-3 business days" (stock irrelevant)
//  CA, Canada warehouse covers all   → "Priority 2-3 business days" (ships domestically)
//  CA, any item needs US warehouse   → "Free Canada Shipping"
//  Other                             → "International shipping DDP"; if the US warehouse
//    can't cover all items Shopify will allocate to Canada, and staff must ask the
//    warehouse manager to ship DDP → requiresDdpFollowup.
// `stock === null` means the stock check was unavailable: Canada falls back to no
// shipping line; international still gets DDP but conservatively flags the followup.
export function resolveShippingLine(
  destCountryCode: string | null,
  stock: WarehouseStock | null
): ShippingResolution {
  if (!destCountryCode) {
    return fallbackResolution("no_country");
  }

  if (destCountryCode === "US") {
    return {
      shippingLine: shippingLine(SHIPPING_PRIORITY_NA),
      shippingName: SHIPPING_PRIORITY_NA,
      warehousePrediction: "US",
      requiresDdpFollowup: false,
      fallback: false,
    };
  }

  if (destCountryCode === "CA") {
    if (!stock) {
      return fallbackResolution("stock_check_failed");
    }
    const title = stock.caCanFulfillAll ? SHIPPING_PRIORITY_NA : SHIPPING_FREE_CANADA;
    return {
      shippingLine: shippingLine(title),
      shippingName: title,
      warehousePrediction: stock.caCanFulfillAll ? "CA" : "US",
      requiresDdpFollowup: false,
      fallback: false,
    };
  }

  // International destination
  if (!stock) {
    return {
      shippingLine: shippingLine(SHIPPING_INTERNATIONAL_DDP),
      shippingName: SHIPPING_INTERNATIONAL_DDP,
      warehousePrediction: "unknown",
      requiresDdpFollowup: true,
      fallback: false,
    };
  }
  return {
    shippingLine: shippingLine(SHIPPING_INTERNATIONAL_DDP),
    shippingName: SHIPPING_INTERNATIONAL_DDP,
    warehousePrediction: stock.usCanFulfillAll ? "US" : "CA",
    requiresDdpFollowup: !stock.usCanFulfillAll,
    fallback: false,
  };
}

// Checks whether the US and Canada warehouses can each fulfill every line item.
// Returns null on any failure — callers degrade gracefully, order placement is
// never blocked by this check.
export async function checkWarehouseStock(
  storeUrl: string,
  accessToken: string,
  lineItems: { variant_id: string | number; quantity: number }[]
): Promise<WarehouseStock | null> {
  try {
    // Aggregate required quantity per variant (same variant may appear on multiple lines)
    const requiredByVariant = new Map<number, number>();
    for (const item of lineItems) {
      if (item.quantity <= 0) continue;
      const variantId = Number(item.variant_id);
      requiredByVariant.set(variantId, (requiredByVariant.get(variantId) || 0) + item.quantity);
    }

    if (requiredByVariant.size === 0) {
      return { usCanFulfillAll: true, caCanFulfillAll: true };
    }

    const variants = await Promise.all(
      Array.from(requiredByVariant.keys()).map(async (variantId) => {
        const res = await fetch(
          `https://${storeUrl}/admin/api/2024-01/variants/${variantId}.json`,
          {
            headers: {
              "X-Shopify-Access-Token": accessToken,
              "Content-Type": "application/json",
            },
          }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return {
          variantId,
          inventoryItemId: data.variant?.inventory_item_id as number | undefined,
          tracked: data.variant?.inventory_management === "shopify",
        };
      })
    );

    if (variants.some((v) => !v)) {
      return null;
    }

    // Untracked variants are fulfillable from either warehouse
    const tracked = variants.filter(
      (v): v is { variantId: number; inventoryItemId: number; tracked: boolean } =>
        !!v && v.tracked && typeof v.inventoryItemId === "number"
    );

    if (tracked.length === 0) {
      return { usCanFulfillAll: true, caCanFulfillAll: true };
    }

    const locations = await getLocations(storeUrl, accessToken);
    if (locations.length === 0) {
      return null;
    }
    const usLocationIds = locations.filter((l) => l.country_code === "US").map((l) => l.id);
    const caLocationIds = locations.filter((l) => l.country_code === "CA").map((l) => l.id);

    const inventoryMap = await getInventoryLevels(
      storeUrl,
      accessToken,
      tracked.map((v) => v.inventoryItemId),
      [...usLocationIds, ...caLocationIds]
    );

    const canFulfillAll = (locationIds: number[]) => {
      if (locationIds.length === 0) return false;
      return tracked.every((v) => {
        const required = requiredByVariant.get(v.variantId) || 0;
        const available = locationIds.reduce(
          (sum, locId) => sum + (inventoryMap.get(`${v.inventoryItemId}-${locId}`) || 0),
          0
        );
        return available >= required;
      });
    };

    return {
      usCanFulfillAll: canFulfillAll(usLocationIds),
      caCanFulfillAll: canFulfillAll(caLocationIds),
    };
  } catch (err) {
    console.error("Warehouse stock check failed:", err);
    return null;
  }
}

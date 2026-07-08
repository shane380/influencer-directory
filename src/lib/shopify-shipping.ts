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

// Reverse map of English country name -> ISO-2 code, built once from
// Intl.DisplayNames so it stays current without a hand-maintained list.
let countryNameMap: Map<string, string> | null = null;
function getCountryNameMap(): Map<string, string> {
  if (countryNameMap) return countryNameMap;
  const map = new Map<string, string>();
  try {
    const display = new Intl.DisplayNames(["en"], { type: "region" });
    for (let a = 65; a <= 90; a++) {
      for (let b = 65; b <= 90; b++) {
        const code = String.fromCharCode(a) + String.fromCharCode(b);
        const name = display.of(code);
        if (name && name !== code) map.set(name.toLowerCase(), code);
      }
    }
  } catch {
    // Intl.DisplayNames unavailable — map stays whatever we built.
  }
  // Common aliases not covered by the canonical display names.
  map.set("usa", "US");
  map.set("u.s.a", "US");
  map.set("u.s.a.", "US");
  map.set("united states of america", "US");
  map.set("uk", "GB");
  map.set("england", "GB");
  map.set("scotland", "GB");
  map.set("wales", "GB");
  countryNameMap = map;
  return map;
}

// Turn an ISO-2 country code into the bucket the rules care about.
function bucketFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const up = iso.toUpperCase();
  if (up === "US") return "US";
  if (up === "CA") return "CA";
  return "XX";
}

// Determine the destination bucket ("US" | "CA" | "XX" | null) from a Shopify
// address. Prefers structured fields; falls back to scanning the free-text
// address for an explicit country NAME in its trailing segments (staff often
// enter the whole address as one line with no structured country). US/CA are
// only inferred from an explicit country word — never guessed from state/zip —
// because a wrong 3PL shipping name breaks routing, and a safe manual fallback
// is better than a confident wrong answer.
export function resolveDestCountry(address: {
  country_code?: string | null;
  country?: string | null;
  country_name?: string | null;
  address1?: string | null;
  address2?: string | null;
} | null | undefined): string | null {
  if (!address) return null;

  // 1. Structured code / name
  const fromCode = bucketFromIso(address.country_code);
  if (fromCode) return fromCode;
  const nameMap = getCountryNameMap();
  const structuredName = (address.country || address.country_name || "").trim().toLowerCase();
  if (structuredName && nameMap.has(structuredName)) return bucketFromIso(nameMap.get(structuredName)!);

  // 2. Free-text: look for a country name in the trailing comma-separated
  //    segments of the address line (addresses conventionally end with country).
  const freeText = [address.address1, address.address2].filter(Boolean).join(", ");
  if (!freeText) return null;
  const segments = freeText
    .split(",")
    .map((s) => s.replace(/[.\s]+$/g, "").trim().toLowerCase())
    .filter(Boolean);
  // Check the last two segments only. Skip names that collide with US state
  // names (Georgia the country vs the state, Jersey vs New Jersey) so a
  // domestic address never gets mis-tagged international — those fall through
  // to the safe manual fallback instead.
  const ambiguous = new Set(["georgia", "jersey"]);
  for (const seg of segments.slice(-2).reverse()) {
    if (ambiguous.has(seg)) continue;
    if (nameMap.has(seg)) return bucketFromIso(nameMap.get(seg)!);
  }
  return null;
}

// Determine the destination bucket for a whole Shopify customer. Tries the
// default address first (structured, then free-text); if that yields nothing,
// falls back to the structured country_code on the customer's OTHER addresses —
// Shopify often auto-creates a normalized structured copy of a free-text
// default, so the country lives there. Only used when every structured address
// agrees, so a customer with genuinely different-country addresses stays on the
// safe manual fallback rather than getting a guessed (possibly wrong) name.
export function resolveDestCountryForCustomer(
  customer:
    | {
        default_address?: Parameters<typeof resolveDestCountry>[0];
        addresses?: { country_code?: string | null }[] | null;
      }
    | null
    | undefined
): string | null {
  if (!customer) return null;
  const primary = resolveDestCountry(customer.default_address);
  if (primary) return primary;

  const buckets = new Set<string>();
  for (const addr of customer.addresses || []) {
    const bucket = bucketFromIso(addr.country_code);
    if (bucket) buckets.add(bucket);
  }
  return buckets.size === 1 ? [...buckets][0] : null;
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

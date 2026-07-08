export interface ShopifyLocation {
  id: number;
  name: string;
  country_code: string;
  active: boolean;
}

// Cache locations for 5 minutes
let locationsCache: { locations: ShopifyLocation[]; timestamp: number } | null = null;
const LOCATIONS_CACHE_TTL = 5 * 60 * 1000;

export async function getLocations(storeUrl: string, accessToken: string): Promise<ShopifyLocation[]> {
  if (locationsCache && Date.now() - locationsCache.timestamp < LOCATIONS_CACHE_TTL) {
    return locationsCache.locations;
  }

  const response = await fetch(`https://${storeUrl}/admin/api/2024-01/locations.json`, {
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to fetch locations:", response.status, errorText);
    return [];
  }

  const data = await response.json();
  const locations = (data.locations || []).filter((loc: ShopifyLocation) => loc.active);

  locationsCache = { locations, timestamp: Date.now() };
  return locations;
}

export async function getInventoryLevels(
  storeUrl: string,
  accessToken: string,
  inventoryItemIds: number[],
  locationIds: number[]
): Promise<Map<string, number>> {
  // Map key: `${inventory_item_id}-${location_id}`, value: available quantity
  const inventoryMap = new Map<string, number>();

  if (inventoryItemIds.length === 0 || locationIds.length === 0) {
    return inventoryMap;
  }

  // Shopify returns max 250 results per request. Each item × location = 1 result,
  // so chunk size must account for number of locations to avoid truncated responses.
  const chunkSize = Math.min(50, Math.floor(250 / Math.max(locationIds.length, 1)));
  const chunks = [];
  for (let i = 0; i < inventoryItemIds.length; i += chunkSize) {
    chunks.push(inventoryItemIds.slice(i, i + chunkSize));
  }

  for (const chunk of chunks) {
    const url = `https://${storeUrl}/admin/api/2024-01/inventory_levels.json?inventory_item_ids=${chunk.join(",")}&location_ids=${locationIds.join(",")}&limit=250`;

    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      const levels = data.inventory_levels || [];
      console.log(`Inventory levels response: ${levels.length} levels for ${chunk.length} items at ${locationIds.length} locations`);
      if (levels.length === 0) {
        console.log(`No inventory levels returned. Item IDs: ${chunk.slice(0, 5).join(",")}, Location IDs: ${locationIds.join(",")}`);
      }
      for (const level of levels) {
        inventoryMap.set(`${level.inventory_item_id}-${level.location_id}`, level.available || 0);
      }
    } else {
      const errorText = await response.text().catch(() => "unknown");
      console.error(`Inventory levels API failed (${response.status}): ${errorText}`);
      console.error(`Request URL: ${url}`);
    }
  }

  return inventoryMap;
}

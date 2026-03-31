import { NextRequest, NextResponse } from "next/server";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  inventory_quantity: number;
  inventory_item_id: number;
}

interface ShopifyProduct {
  id: number;
  title: string;
  status: string;
  images: { id: number; src: string }[];
  variants: ShopifyVariant[];
}

interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

interface ShopifyLocation {
  id: number;
  name: string;
  country_code: string;
  active: boolean;
}

interface InventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number;
}

// Cache locations for 5 minutes
let locationsCache: { locations: ShopifyLocation[]; timestamp: number } | null = null;
const LOCATIONS_CACHE_TTL = 5 * 60 * 1000;

async function getLocations(storeUrl: string, accessToken: string): Promise<ShopifyLocation[]> {
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

async function getInventoryLevels(
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

export async function GET(request: NextRequest) {
  const SHOPIFY_STORE_URL = getShopifyStoreUrl();
  const SHOPIFY_ACCESS_TOKEN = await getShopifyAccessToken();

  if (!SHOPIFY_STORE_URL) {
    return NextResponse.json(
      { error: "Shopify store URL not configured" },
      { status: 500 }
    );
  }

  if (!SHOPIFY_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "Shopify not connected. Please connect your Shopify store first.", needsAuth: true },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const sku = searchParams.get("sku");
  const query = searchParams.get("query"); // Search by name or SKU
  const browse = searchParams.get("browse"); // Browse mode: return all active products
  const category = searchParams.get("category"); // Filter: tops, bottoms, sets, accessories
  const searchTerm = query || sku;

  // If no search term and not browse mode, return all SKUs for debugging
  if (!searchTerm && !browse) {
    try {
      const debugUrl = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products.json?limit=250`;

      const resp: Response = await fetch(debugUrl, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      });

      const responseText = await resp.text();

      if (!resp.ok) {
        return NextResponse.json({
          error: "Shopify API error",
          status: resp.status,
          statusText: resp.statusText,
          response: responseText,
          url: debugUrl,
          store: SHOPIFY_STORE_URL,
        });
      }

      const debugData = JSON.parse(responseText);

      const allSkus = (debugData.products || []).flatMap((p: ShopifyProduct) =>
        p.variants.map((v) => ({
          sku: v.sku,
          title: p.title,
          variant: v.title,
        }))
      ).filter((item: { sku: string }) => item.sku);

      // Also check shop info and product count to verify permissions
      let shopInfo = null;
      let productCount = null;

      try {
        const shopResp = await fetch(`https://${SHOPIFY_STORE_URL}/admin/api/2024-01/shop.json`, {
          headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json" },
        });
        if (shopResp.ok) {
          const shopData = await shopResp.json();
          shopInfo = shopData.shop?.name;
        } else {
          shopInfo = `Error: ${shopResp.status} ${shopResp.statusText}`;
        }
      } catch (e) {
        shopInfo = `Error: ${String(e)}`;
      }

      try {
        const countResp = await fetch(`https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products/count.json`, {
          headers: { "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN, "Content-Type": "application/json" },
        });
        if (countResp.ok) {
          const countData = await countResp.json();
          productCount = countData.count;
        } else {
          const countErr = await countResp.text();
          productCount = `Error: ${countResp.status} - ${countErr}`;
        }
      } catch (e) {
        productCount = `Error: ${String(e)}`;
      }

      return NextResponse.json({
        message: "Debug mode - showing all SKUs",
        total_products: (debugData.products || []).length,
        skus: allSkus,
        store: SHOPIFY_STORE_URL,
        token_preview: SHOPIFY_ACCESS_TOKEN ? `${SHOPIFY_ACCESS_TOKEN.substring(0, 10)}...` : "NO TOKEN",
        shop_name: shopInfo,
        product_count_from_api: productCount,
      });
    } catch (error) {
      return NextResponse.json({
        error: "Failed to fetch SKUs",
        details: String(error),
        store: SHOPIFY_STORE_URL,
      }, { status: 500 });
    }
  }

  try {
    // Get locations first
    const locations = await getLocations(SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN);
    console.log("Fetched locations:", locations.length, locations.map(l => l.name));

    // Search products with pagination, stop early once we have enough matches
    const matchingProducts: {
      product_id: number;
      variant_id: number;
      inventory_item_id: number;
      title: string;
      variant_title: string | null;
      sku: string;
      price: string;
      inventory: number;
      inventory_by_location: { location_id: number; location_name: string; available: number }[];
      image: string | null;
      status: string;
    }[] = [];

    // Use Shopify GraphQL for fast server-side substring search
    const graphqlUrl = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/graphql.json`;

    // Build query filter
    let gqlFilter = "status:active";
    if (searchTerm) {
      // Search across title words
      const words = searchTerm.replace(/"/g, '\\"').split(/\s+/);
      gqlFilter = `${words.map((w: string) => `title:*${w}*`).join(' ')} status:active OR status:draft`;
    }

    const graphqlQuery = `
      {
        products(first: ${browse ? 250 : 100}, query: "${gqlFilter}") {
          edges {
            node {
              id
              title
              status
              productType
              tags
              featuredImage { url }
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                    inventoryQuantity
                    inventoryItem { id }
                    selectedOptions { name value }
                  }
                }
              }
            }
          }
        }
      }
    `;

    const gqlResponse = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: graphqlQuery }),
    });

    if (!gqlResponse.ok) {
      const errorText = await gqlResponse.text();
      console.error("Shopify GraphQL error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch products from Shopify" },
        { status: gqlResponse.status }
      );
    }

    const gqlData = await gqlResponse.json();
    const gqlProducts = gqlData?.data?.products?.edges || [];

    // Parse numeric ID from Shopify GID format (gid://shopify/Product/123)
    const parseGid = (gid: string) => parseInt(gid.split('/').pop() || '0', 10);

    const searchWords = searchTerm ? searchTerm.toLowerCase().split(/\s+/).filter((word: string) => word.length > 0) : [];
    const seenProductIds = new Set<number>();

    // Category keyword mapping
    const categoryKeywords: Record<string, RegExp> = {
      tops: /bra|top|crop|tank|tee|shirt|cardigan|sweater|shrug|hoodie|vest|jacket/i,
      bottoms: /pant|short|legging|skirt|bottom|jogger|trouser/i,
      sets: /set|bundle|duo|combo/i,
      accessories: /hat|bag|socks|scrunchie|headband|belt|accessory|towel/i,
    };

    for (const { node: product } of gqlProducts) {
      if (product.status === 'ARCHIVED') continue;
      const titleLower = product.title.toLowerCase();
      const productId = parseGid(product.id);
      const productType = (product.productType || "").toLowerCase();
      const tags = (product.tags || []).join(" ").toLowerCase();

      // Category filter
      if (category && category !== "all") {
        const regex = categoryKeywords[category];
        if (regex && !regex.test(product.title) && !regex.test(productType) && !regex.test(tags)) {
          continue;
        }
      }

      // Build full searchable text including tags, product type, and variant options
      const optionValues = product.variants.edges
        .flatMap(({ node: v }: any) => (v.selectedOptions || []).map((o: any) => o.value))
        .join(" ").toLowerCase();

      // Check if product title alone matches (most common case)
      const titleMatches = searchWords.length === 0 || searchWords.every((word: string) => titleLower.includes(word));

      for (const { node: variant } of product.variants.edges) {
        const skuLower = variant.sku?.toLowerCase() || "";
        const variantTitleLower = variant.title?.toLowerCase() || "";
        const skuNormalized = skuLower.replace(/-/g, ' ');
        const searchableText = `${titleLower} ${variantTitleLower} ${skuLower} ${skuNormalized} ${productType} ${tags} ${optionValues}`;

        const allWordsMatch = searchWords.length === 0 || titleMatches || searchWords.every((word: string) => searchableText.includes(word));

        if (allWordsMatch) {
          matchingProducts.push({
            product_id: productId,
            variant_id: parseGid(variant.id),
            inventory_item_id: parseGid(variant.inventoryItem.id),
            title: product.title,
            variant_title: variant.title !== "Default Title" ? variant.title : null,
            sku: variant.sku,
            price: variant.price,
            inventory: variant.inventoryQuantity,
            inventory_by_location: [],
            image: product.featuredImage?.url || null,
            status: product.status.toLowerCase(),
          });

          // Track unique products — stop once we have enough distinct products
          seenProductIds.add(productId);
          if (seenProductIds.size >= 50) break;
        }
      }
      if (seenProductIds.size >= 50) break;
    }

    // Fetch inventory levels per location for all matching products
    if (matchingProducts.length > 0 && locations.length > 0) {
      const inventoryItemIds = matchingProducts.map(p => p.inventory_item_id);
      const locationIds = locations.map(l => l.id);
      console.log(`Fetching inventory for ${inventoryItemIds.length} items at ${locations.length} locations: ${locations.map(l => `${l.name}(${l.id})`).join(", ")}`);
      const inventoryMap = await getInventoryLevels(SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN, inventoryItemIds, locationIds);
      console.log(`Inventory map has ${inventoryMap.size} entries`);

      // Populate inventory_by_location for each product
      for (const product of matchingProducts) {
        product.inventory_by_location = locations.map(loc => ({
          location_id: loc.id,
          location_name: loc.name,
          available: inventoryMap.get(`${product.inventory_item_id}-${loc.id}`) || 0,
        }));
        // Log first few products for debugging
        if (matchingProducts.indexOf(product) < 3) {
          console.log(`Product "${product.title}" (inv_item: ${product.inventory_item_id}): GraphQL qty=${product.inventory}, by_location=${JSON.stringify(product.inventory_by_location)}`);
        }
      }
    }

    return NextResponse.json({
      products: matchingProducts,
      locations: locations.map(l => ({ id: l.id, name: l.name })),
    });
  } catch (error) {
    console.error("Shopify product search error:", error);
    return NextResponse.json(
      { error: "Failed to search products" },
      { status: 500 }
    );
  }
}

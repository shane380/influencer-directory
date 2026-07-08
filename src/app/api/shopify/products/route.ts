import { NextRequest, NextResponse } from "next/server";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";
import { getLocations, getInventoryLevels } from "@/lib/shopify-inventory";

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
      created_at: string | null;
    }[] = [];

    // Use Shopify GraphQL for fast server-side substring search
    const graphqlUrl = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/graphql.json`;

    // Build query filter
    // Use OR for title words so variant-level terms (like color) don't exclude the product.
    // The client-side filter (searchableText) handles exact multi-word matching across title + variant + SKU.
    let gqlFilter = "status:active";
    if (searchTerm) {
      const words = searchTerm.replace(/"/g, '\\"').split(/\s+/);
      gqlFilter = `(${words.map((w: string) => `title:*${w}*`).join(' OR ')}) (status:active OR status:draft)`;
    }

    const graphqlQuery = `
      {
        products(first: ${browse ? 250 : 100}, query: "${gqlFilter}", sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              title
              status
              productType
              tags
              createdAt
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

    // Product types and keywords to exclude from browse results (non-clothing items)
    const excludedTypes = new Set(["gift card", "gift_card", "giftcard"]);
    const excludedKeywords = /polybag|poly bag|packaging|gift.?card|sticker|label|insert|mailer|box|carton|tissue/i;

    for (const { node: product } of gqlProducts) {
      if (product.status === 'ARCHIVED') continue;
      // In browse mode, only show active products (skip drafts)
      if (browse && product.status !== 'ACTIVE') continue;
      const titleLower = product.title.toLowerCase();
      const productId = parseGid(product.id);
      const productType = (product.productType || "").toLowerCase();
      const tags = (product.tags || []).join(" ").toLowerCase();

      // Exclude non-clothing items in browse mode
      if (browse) {
        if (excludedTypes.has(productType) || excludedKeywords.test(product.title) || excludedKeywords.test(productType)) {
          continue;
        }
      }

      // Category filter
      if (category === "new_arrivals") {
        const createdAt = product.createdAt ? new Date(product.createdAt) : null;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (!createdAt || createdAt < thirtyDaysAgo) continue;
      } else if (category && category !== "all") {
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
            created_at: product.createdAt || null,
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

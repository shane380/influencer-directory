import { NextRequest, NextResponse } from "next/server";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
  inventory_quantity: number;
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
  const searchTerm = query || sku;

  // If no search term provided, return all SKUs for debugging
  if (!searchTerm) {
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
    // Search products with pagination, stop early once we have enough matches
    const matchingProducts: {
      product_id: number;
      variant_id: number;
      title: string;
      variant_title: string | null;
      sku: string;
      price: string;
      inventory: number;
      image: string | null;
      status: string;
    }[] = [];

    // Split search into words for multi-term matching
    const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    let nextPageUrl: string | null = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products.json?limit=250`;
    let pagesSearched = 0;

    while (nextPageUrl && matchingProducts.length < 20 && pagesSearched < 10) {
      pagesSearched++;

      const response: Response = await fetch(nextPageUrl, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Shopify API error:", errorText);
        return NextResponse.json(
          { error: "Failed to fetch products from Shopify" },
          { status: response.status }
        );
      }

      const data: ShopifyProductsResponse = await response.json();

      // Filter as we go - ALL search words must match somewhere (title, variant title, or SKU)
      for (const product of data.products) {
        const titleLower = product.title.toLowerCase();

        for (const variant of product.variants) {
          const skuLower = variant.sku?.toLowerCase() || "";
          const variantTitleLower = variant.title?.toLowerCase() || "";

          // Combine all searchable text
          const searchableText = `${titleLower} ${variantTitleLower} ${skuLower}`;

          // Check if ALL search words are found somewhere in the combined text
          const allWordsMatch = searchWords.every(word => searchableText.includes(word));

          if (allWordsMatch) {
            matchingProducts.push({
              product_id: product.id,
              variant_id: variant.id,
              title: product.title,
              variant_title: variant.title !== "Default Title" ? variant.title : null,
              sku: variant.sku,
              price: variant.price,
              inventory: variant.inventory_quantity,
              image: product.images[0]?.src || null,
              status: product.status,
            });

            // Stop if we have enough matches
            if (matchingProducts.length >= 20) break;
          }
        }
        if (matchingProducts.length >= 20) break;
      }

      // Check for next page in Link header
      const linkHeader: string | null = response.headers.get("Link");
      if (linkHeader) {
        const nextMatch: RegExpMatchArray | null = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        nextPageUrl = nextMatch ? nextMatch[1] : null;
      } else {
        nextPageUrl = null;
      }
    }

    return NextResponse.json({ products: matchingProducts });
  } catch (error) {
    console.error("Shopify product search error:", error);
    return NextResponse.json(
      { error: "Failed to search products" },
      { status: 500 }
    );
  }
}

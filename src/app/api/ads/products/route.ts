import { NextResponse } from "next/server";
import { getAdsUser } from "@/lib/ads-guard";
import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";
import { productColor } from "@/lib/shopify-color";
import type { AdCatalogProduct } from "@/types/meta-ads";

/**
 * The whole Shopify catalogue, trimmed to what the ad launcher's product
 * picker needs (one row per product; colourways are separate products in this
 * store). The picker loads it once and filters in the browser, so typing never
 * waits on Shopify. ~600 products (active + draft) is ~60 KB.
 *
 * Drafts are included because new colourways are usually still draft when
 * their launch ads are built. Archived products are left out.
 */

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { at: number; products: AdCatalogProduct[] } | null = null;
let inflight: Promise<AdCatalogProduct[]> | null = null;

interface GqlProduct {
  id: string;
  title: string;
  status: string;
  productType: string | null;
  tags: string[];
  featuredImage: { url: string } | null;
  variants: { edges: { node: { sku: string | null; selectedOptions: { name: string; value: string }[] } }[] };
}

async function loadCatalog(storeUrl: string, token: string): Promise<AdCatalogProduct[]> {
  const url = `https://${storeUrl}/admin/api/2024-01/graphql.json`;
  const products: AdCatalogProduct[] = [];
  let cursor: string | null = null;
  do {
    const after: string = cursor ? `, after: "${cursor}"` : "";
    const query = `{
      products(first: 250, query: "status:active OR status:draft", sortKey: TITLE${after}) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id title status productType tags
          featuredImage { url(transform: { maxWidth: 80, maxHeight: 80 }) }
          variants(first: 1) { edges { node { sku selectedOptions { name value } } } }
        } }
      }
    }`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "X-Shopify-Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`Shopify ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(JSON.stringify(json.errors).slice(0, 200));
    const page = json.data.products;
    for (const { node } of page.edges as { node: GqlProduct }[]) {
      const status = node.status.toLowerCase();
      if (status !== "active" && status !== "draft") continue;
      const variant = node.variants.edges[0]?.node;
      products.push({
        id: node.id.split("/").pop() || node.id,
        title: node.title,
        color: productColor({ sku: variant?.sku, selectedOptions: variant?.selectedOptions, tags: node.tags }),
        status,
        type: node.productType || null,
        image: node.featuredImage?.url || null,
      });
    }
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  // Active first so live products rank above drafts of the same name.
  products.sort((a, b) =>
    a.status === b.status ? a.title.localeCompare(b.title) : a.status === "active" ? -1 : 1
  );
  return products;
}

export async function GET(request: Request) {
  const user = await getAdsUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const storeUrl = getShopifyStoreUrl();
  const token = await getShopifyAccessToken();
  if (!storeUrl || !token) {
    return NextResponse.json({ error: "Shopify not connected" }, { status: 500 });
  }

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  if (!refresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return NextResponse.json(
      { products: cache.products, cachedAt: cache.at },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  }

  try {
    if (!inflight) {
      inflight = loadCatalog(storeUrl, token).finally(() => {
        inflight = null;
      });
    }
    const products = await inflight;
    cache = { at: Date.now(), products };
    return NextResponse.json(
      { products, cachedAt: cache.at },
      { headers: { "Cache-Control": "private, max-age=300" } }
    );
  } catch (err) {
    console.error("[ads/products] catalogue load failed:", err instanceof Error ? err.message : err);
    // Serve a stale copy over an error if we have one.
    if (cache) {
      return NextResponse.json({ products: cache.products, cachedAt: cache.at, stale: true });
    }
    return NextResponse.json({ error: "Could not load products from Shopify" }, { status: 502 });
  }
}

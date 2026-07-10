import { getShopifyAccessToken, getShopifyStoreUrl } from "@/lib/shopify";

// Server-only: fetch full renderable product data for an explicit list of
// product IDs via the Admin GraphQL API. Unlike the storefront, the Admin API
// returns DRAFT products — which is what makes pre-launch gift campaigns work.

export interface GiftRenderVariant {
  variant_id: string;
  sku: string;
  title: string | null;
  selected_options: { name: string; value: string }[];
  available: boolean;
  // Kept server-side for building product_selections; STRIP before any
  // public payload.
  price: string;
}

export interface GiftRenderProduct {
  product_id: string;
  title: string;
  status: "active" | "draft";
  image: string | null;
  images: string[];
  options: { name: string; values: string[] }[];
  variants: GiftRenderVariant[];
}

function parseGid(gid: string): string {
  return gid.split("/").pop() || gid;
}

export async function fetchProductsByIds(productIds: string[]): Promise<GiftRenderProduct[]> {
  if (productIds.length === 0) return [];
  const storeUrl = getShopifyStoreUrl();
  const accessToken = await getShopifyAccessToken();
  if (!storeUrl || !accessToken) {
    throw new Error("Shopify not configured");
  }

  const ids = productIds.map((id) => `gid://shopify/Product/${id}`);
  const query = `
    query GiftProducts($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          title
          status
          featuredImage { url }
          images(first: 5) { edges { node { url } } }
          options { name values }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
                inventoryQuantity
                selectedOptions { name value }
              }
            }
          }
        }
      }
    }`;

  const res = await fetch(`https://${storeUrl}/admin/api/2024-01/graphql.json`, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { ids } }),
  });
  if (!res.ok) {
    throw new Error(`Shopify GraphQL ${res.status}`);
  }
  const data = await res.json();
  if (data.errors) {
    throw new Error(`Shopify GraphQL error: ${JSON.stringify(data.errors).slice(0, 300)}`);
  }

  const out: GiftRenderProduct[] = [];
  for (const node of data.data?.nodes || []) {
    if (!node?.id) continue; // deleted product → null node
    const status = String(node.status || "").toLowerCase();
    if (status === "archived") continue;
    const images: string[] = (node.images?.edges || [])
      .map((e: any) => e?.node?.url)
      .filter(Boolean);
    out.push({
      product_id: parseGid(node.id),
      title: node.title,
      status: status === "draft" ? "draft" : "active",
      image: node.featuredImage?.url || images[0] || null,
      images,
      options: (node.options || []).map((o: any) => ({ name: o.name, values: o.values || [] })),
      variants: (node.variants?.edges || []).map((e: any) => ({
        variant_id: parseGid(e.node.id),
        sku: e.node.sku || "",
        title: e.node.title === "Default Title" ? null : e.node.title,
        selected_options: (e.node.selectedOptions || []).map((s: any) => ({ name: s.name, value: s.value })),
        available: (e.node.inventoryQuantity ?? 0) > 0,
        price: String(e.node.price ?? "0"),
      })),
    });
  }
  return out;
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, X } from "lucide-react";
import type { GiftPoolProduct } from "@/types/database";

// Shared Shopify product picker for the gift pool (campaign settings) and
// per-influencer overrides. Search includes DRAFT products — that's the
// pre-launch use case. Stores product_id (not variant_id): the gift page
// resolves full variants live from Shopify.

interface SearchProduct {
  product_id: number;
  title: string;
  image?: string | null;
  status?: string;
}

export function GiftProductPicker({
  products,
  onChange,
}: {
  products: GiftPoolProduct[];
  onChange: (next: GiftPoolProduct[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [searching, setSearching] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/shopify/products?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      const grouped = new Map<number, SearchProduct>();
      for (const p of data.products || []) {
        if (!grouped.has(p.product_id)) grouped.set(p.product_id, p);
      }
      setResults(Array.from(grouped.values()).sort((a, b) => b.product_id - a.product_id));
    } catch {
      setResults([]);
    }
    setSearching(false);
  }

  function add(p: SearchProduct) {
    const id = String(p.product_id);
    if (products.some((x) => String(x.product_id) === id)) return;
    onChange([...products, { product_id: id, product_title: p.title, image_url: p.image || null }]);
  }

  function remove(id: string) {
    onChange(products.filter((x) => String(x.product_id) !== String(id)));
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search products (drafts included)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={search} disabled={searching}>
          {searching ? "Searching…" : "Search"}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="max-h-48 overflow-y-auto border rounded-md divide-y">
          {results.map((p) => {
            const added = products.some((x) => String(x.product_id) === String(p.product_id));
            return (
              <button
                key={p.product_id}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50"
                onClick={() => add(p)}
                disabled={added}
              >
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="w-8 h-10 object-cover rounded flex-shrink-0" />
                ) : (
                  <div className="w-8 h-10 bg-gray-100 rounded flex-shrink-0" />
                )}
                <span className="text-sm flex-1 truncate">{p.title}</span>
                {p.status === "draft" && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Draft</span>
                )}
                <span className="text-xs text-gray-400">{added ? "Added" : "+ Add"}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-1.5">
        {products.length === 0 && (
          <div className="text-sm text-gray-400 border border-dashed rounded-md px-3 py-4 text-center">
            No products yet — search above to build the pool.
          </div>
        )}
        {products.map((p) => (
          <div key={p.product_id} className="flex items-center gap-3 border rounded-md px-3 py-2">
            {p.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image_url} alt="" className="w-8 h-10 object-cover rounded flex-shrink-0" />
            ) : (
              <div className="w-8 h-10 bg-gray-100 rounded flex-shrink-0" />
            )}
            <span className="text-sm flex-1 truncate">{p.product_title}</span>
            <button className="text-gray-400 hover:text-red-600" onClick={() => remove(String(p.product_id))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

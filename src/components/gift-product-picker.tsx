"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { GripVertical, Search, X } from "lucide-react";
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
  color?: string | null;
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
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const searchSeq = useRef(0);

  // Auto-search: fires 350ms after typing pauses; stale responses are dropped.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shopify/products?query=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (seq !== searchSeq.current) return; // a newer search superseded this one
        const grouped = new Map<number, SearchProduct>();
        for (const p of data.products || []) {
          if (!grouped.has(p.product_id)) grouped.set(p.product_id, p);
        }
        setResults(Array.from(grouped.values()).sort((a, b) => b.product_id - a.product_id));
      } catch {
        if (seq === searchSeq.current) setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  function add(p: SearchProduct) {
    const id = String(p.product_id);
    if (products.some((x) => String(x.product_id) === id)) return;
    onChange([...products, { product_id: id, product_title: p.title, image_url: p.image || null, color: p.color || null }]);
  }

  function remove(id: string) {
    onChange(products.filter((x) => String(x.product_id) !== String(id)));
  }

  // Pool order = display order on the gift page, so coordinators can merch
  // products next to each other by dragging rows.
  function moveTo(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= products.length || to >= products.length) return;
    const next = [...products];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name or colour (drafts included)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9 pr-24"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Searching…</span>
        )}
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
                <span className="flex-1 min-w-0">
                  <span className="block text-sm truncate">{p.title}</span>
                  {p.color && <span className="block text-xs text-gray-500 truncate">{p.color}</span>}
                </span>
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
        {products.map((p, i) => (
          <div
            key={p.product_id}
            className={`flex items-center gap-3 border rounded-md px-3 py-2 bg-white ${dragIdx === i ? "opacity-50 border-gray-400" : ""}`}
            draggable
            onDragStart={(e) => {
              setDragIdx(i);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIdx === null || dragIdx === i) return;
              moveTo(dragIdx, i);
              setDragIdx(i);
            }}
            onDragEnd={() => setDragIdx(null)}
            onDrop={(e) => e.preventDefault()}
          >
            <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0 cursor-grab" />
            {p.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image_url} alt="" className="w-8 h-10 object-cover rounded flex-shrink-0" />
            ) : (
              <div className="w-8 h-10 bg-gray-100 rounded flex-shrink-0" />
            )}
            <span className="flex-1 min-w-0">
              <span className="block text-sm truncate">{p.product_title}</span>
              {p.color && <span className="block text-xs text-gray-500 truncate">{p.color}</span>}
            </span>
            <div className="flex flex-col -my-1">
              <button
                className="text-gray-300 hover:text-gray-700 disabled:opacity-30 leading-none px-1"
                disabled={i === 0}
                title="Move up"
                onClick={() => moveTo(i, i - 1)}
              >
                ▲
              </button>
              <button
                className="text-gray-300 hover:text-gray-700 disabled:opacity-30 leading-none px-1"
                disabled={i === products.length - 1}
                title="Move down"
                onClick={() => moveTo(i, i + 1)}
              >
                ▼
              </button>
            </div>
            <button className="text-gray-400 hover:text-red-600" onClick={() => remove(String(p.product_id))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

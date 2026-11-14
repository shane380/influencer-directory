"use client";

// "Products in this ad": pick the Shopify colourways an ad promotes. The
// titles go into the ad's automatic name ("@handle // Body Butter™ Twist
// Halter Bra Taupe, … // video // file"), which is how the inventory app ties
// ad spend to products (its nightly Meta sync reads ad names; nothing else
// about the ad changes). Same hand-rolled look as PartnerPicker.

import { useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import type { AdProductRef } from "@/types/meta-ads";

interface SearchRow {
  product_id: number;
  title: string;
  color?: string | null;
  status?: string;
  image?: string | null;
}

/** One pick per colourway: the same key the inventory app uses for a product. */
export function productRefKey(p: { id: string; color?: string | null }): string {
  return `${p.id}:${(p.color || "").toLowerCase()}`;
}

/** The text that goes into the ad name: title plus colour, ™ kept (the mapper ignores it). */
export function productRefLabel(p: AdProductRef): string {
  const title = p.title.trim();
  const color = (p.color || "").trim();
  return color && !title.toLowerCase().includes(color.toLowerCase()) ? `${title} ${color}` : title;
}

export function ProductPicker({
  value,
  onChange,
  disabled,
}: {
  value: AdProductRef[];
  onChange: (next: AdProductRef[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Search 350ms after typing pauses; drop stale responses (as the gift picker does).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shopify/products?query=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (mine !== seq.current) return;
        // One row per variant comes back; keep one per product + colour.
        const seen = new Map<string, SearchRow>();
        for (const row of (data.products || []) as SearchRow[]) {
          const key = productRefKey({ id: String(row.product_id), color: row.color });
          if (!seen.has(key)) seen.set(key, row);
        }
        setResults(Array.from(seen.values()).slice(0, 30));
        setOpen(true);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const add = (row: SearchRow) => {
    const ref: AdProductRef = { id: String(row.product_id), title: row.title, color: row.color || null };
    if (value.some((v) => productRefKey(v) === productRefKey(ref))) return;
    onChange([...value, ref]);
    setQuery("");
    setResults([]);
    setOpen(false);
  };
  const remove = (key: string) => onChange(value.filter((v) => productRefKey(v) !== key));

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((p) => {
          const key = productRefKey(p);
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 pl-2.5 pr-1 py-0.5 text-[12px] text-gray-800"
              title={productRefLabel(p)}
            >
              {productRefLabel(p).replace(/[™®]/g, "")}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(key)}
                  className="rounded-full p-0.5 text-gray-400 hover:text-gray-700"
                  aria-label={`Remove ${p.title}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => results.length && setOpen(true)}
            placeholder={value.length ? "Add another…" : "Search a product: twist halter taupe"}
            className="border border-gray-300 rounded-md pl-7 pr-7 py-1.5 text-[12.5px] w-64"
          />
          {searching && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />}
        </div>
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-64 w-80 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {results.map((row) => {
            const ref = { id: String(row.product_id), title: row.title, color: row.color || null };
            const picked = value.some((v) => productRefKey(v) === productRefKey(ref));
            return (
              <button
                key={productRefKey(ref)}
                type="button"
                disabled={picked}
                onClick={() => add(row)}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] hover:bg-gray-50 ${picked ? "opacity-40" : ""}`}
              >
                {row.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.image} alt="" className="h-7 w-7 rounded object-cover" />
                ) : (
                  <span className="h-7 w-7 rounded bg-gray-100" />
                )}
                <span className="flex-1 truncate">
                  {row.title.replace(/[™®]/g, "")}
                  {row.color ? <span className="text-gray-500"> · {row.color}</span> : null}
                </span>
                {row.status && row.status !== "active" ? <span className="text-[10px] uppercase text-gray-400">{row.status}</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

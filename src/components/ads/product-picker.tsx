"use client";

// "Products in this ad": pick the Shopify colourways an ad promotes. The
// titles go into the ad's automatic name ("@handle // Body Butter™ Twist
// Halter Bra Taupe, … // video // file"), which is how the inventory app ties
// ad spend to products (its nightly Meta sync reads ad names; nothing else
// about the ad changes). Same hand-rolled look as PartnerPicker.
//
// Speed: the whole catalogue (~600 active + draft products, one row each) is
// fetched once per page load from /api/ads/products and filtered here, so
// typing never waits on Shopify. The list stays open after a pick so a search
// like "ivory" lets you add the tank and the pant with two clicks, and Enter
// adds the highlighted row so a whole ad can be tagged from the keyboard.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import type { AdCatalogProduct, AdProductRef } from "@/types/meta-ads";

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

// ---- Catalogue, shared by every picker on the page --------------------------

interface CatalogRow extends AdCatalogProduct {
  /** Lower-cased "title colour type" with ™/® dropped, matched word by word. */
  search: string;
  titleLower: string;
}

const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache: { at: number; rows: CatalogRow[] } | null = null;
let catalogPromise: Promise<CatalogRow[]> | null = null;

function clean(s: string | null | undefined): string {
  return (s || "").replace(/[™®]/g, "").toLowerCase();
}

async function loadCatalog(force = false): Promise<CatalogRow[]> {
  if (!force && catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.rows;
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const res = await fetch(`/api/ads/products${force ? "?refresh=1" : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load products");
      const rows: CatalogRow[] = (data.products as AdCatalogProduct[]).map((p) => ({
        ...p,
        titleLower: clean(p.title),
        search: `${clean(p.title)} ${clean(p.color)} ${clean(p.type)}`,
      }));
      catalogCache = { at: Date.now(), rows };
      return rows;
    })().finally(() => {
      catalogPromise = null;
    });
  }
  return catalogPromise;
}

const MAX_RESULTS = 40;

/** Rows whose searchable text contains every typed word; best matches first. */
function filterCatalog(rows: CatalogRow[], query: string): CatalogRow[] {
  const words = clean(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: { row: CatalogRow; score: number }[] = [];
  for (const row of rows) {
    if (!words.every((w) => row.search.includes(w))) continue;
    // Live products first (a "Socks Ivory" draft must not beat the ivory
    // colourways on sale), then title hits over colour/type hits.
    let score = 0;
    if (row.status === "active") score += 4;
    if (row.titleLower.startsWith(words[0])) score += 2;
    if (words.every((w) => row.titleLower.includes(w))) score += 1;
    scored.push({ row, score });
  }
  scored.sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title));
  return scored.slice(0, MAX_RESULTS).map((s) => s.row);
}

// ---- Component ---------------------------------------------------------------

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
  const [rows, setRows] = useState<CatalogRow[]>(() => catalogCache?.rows || []);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Warm the catalogue on mount so the first keystroke already has data.
  const load = (force = false) => {
    setLoading(true);
    setLoadError(null);
    loadCatalog(force)
      .then((r) => setRows(r))
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load products"))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (!catalogCache || Date.now() - catalogCache.at >= CATALOG_TTL_MS) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(() => filterCatalog(rows, query), [rows, query]);

  // Reset the keyboard highlight whenever the result set changes.
  useEffect(() => {
    setHighlight(0);
  }, [query, rows]);

  // Keep the highlighted row in view while arrowing through the list.
  useEffect(() => {
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const picked = useMemo(() => new Set(value.map(productRefKey)), [value]);

  /** Add the row, or remove it if it is already picked. The list stays open. */
  const toggle = (row: CatalogRow) => {
    const ref: AdProductRef = { id: row.id, title: row.title, color: row.color || null };
    const key = productRefKey(ref);
    if (picked.has(key)) onChange(value.filter((v) => productRefKey(v) !== key));
    else onChange([...value, ref]);
    inputRef.current?.focus();
  };
  const remove = (key: string) => onChange(value.filter((v) => productRefKey(v) !== key));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && results[highlight]) {
        e.preventDefault();
        toggle(results[highlight]);
        // Step to the next row so Enter, Enter adds two products rather than
        // adding and removing the same one.
        setHighlight((h) => Math.min(h + 1, results.length - 1));
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      } else if (query) {
        setQuery("");
      }
    } else if (e.key === "Backspace" && !query && value.length) {
      // Backspace in an empty box drops the last chip, like a tag input.
      remove(productRefKey(value[value.length - 1]));
    }
  };

  const showList = open && query.trim().length > 0;

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
            ref={inputRef}
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={value.length ? "Add another…" : "Search a product: twist halter taupe"}
            className="border border-gray-300 rounded-md pl-7 pr-7 py-1.5 text-[12.5px] w-64"
            autoComplete="off"
          />
          {loading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />}
        </div>
        {loadError && (
          <span className="text-[11px] text-red-600">
            {loadError}.{" "}
            <button type="button" onClick={() => load(true)} className="underline">
              Retry
            </button>
          </span>
        )}
      </div>
      {showList && (
        <div className="absolute z-20 mt-1 w-80 rounded-md border border-gray-200 bg-white shadow-lg">
          {results.length > 0 ? (
            <div ref={listRef} className="max-h-64 overflow-auto">
              {results.map((row, i) => {
                const key = productRefKey(row);
                const isPicked = picked.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => toggle(row)}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] ${
                      i === highlight ? "bg-gray-100" : ""
                    } ${isPicked ? "text-gray-500" : ""}`}
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
                    {row.status !== "active" ? (
                      <span className="text-[10px] uppercase text-gray-400">{row.status}</span>
                    ) : null}
                    {isPicked ? <Check className="h-3.5 w-3.5 text-gray-700" /> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="px-2.5 py-2 text-[12px] text-gray-500">
              {loading ? "Loading products…" : rows.length ? "No products match" : "Products not loaded"}
            </div>
          )}
          <div className="border-t border-gray-100 px-2.5 py-1 text-[10.5px] text-gray-400">
            ↑↓ move · Enter adds · Esc closes
          </div>
        </div>
      )}
    </div>
  );
}

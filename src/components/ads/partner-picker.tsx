"use client";

// Searchable picker for the partnership (whitelisting) creator. Replaces the
// native <select>, which became unusable once the partner list grew past a
// screen: type a few letters of the handle, arrow to it, Enter to pick.

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { PartnerIdentity } from "@/types/meta-ads";

const norm = (s: string) => s.trim().replace(/^@/, "").toLowerCase();

export function PartnerPicker({
  partners,
  value,
  onPick,
}: {
  partners: PartnerIdentity[];
  /** Selected sponsor id ("" for none). */
  value: string;
  /** null clears the selection. */
  onPick: (partner: PartnerIdentity | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...partners].sort((a, b) => norm(a.label).localeCompare(norm(b.label))),
    [partners]
  );
  const matches = useMemo(() => {
    const q = norm(query);
    if (!q) return sorted;
    return sorted.filter(
      (p) => norm(p.label).includes(q) || p.sponsorId.includes(q)
    );
  }, [sorted, query]);

  const selected = partners.find((p) => p.sponsorId === value) || null;

  // Reset the search each time the list opens; keep the highlight in range.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(Math.max(0, sorted.findIndex((p) => p.sponsorId === value)));
    }
  }, [open, sorted, value]);
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, matches.length - 1)));
  }, [matches.length]);
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // Close on outside mousedown or Escape.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (partner: PartnerIdentity | null) => {
    onPick(partner);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[active]) pick(matches[active]);
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 border border-gray-300 rounded-md pl-2 pr-1.5 py-1.5 text-[12.5px] bg-white hover:bg-gray-50 min-w-[150px] ${
          selected ? "text-gray-900" : "text-gray-400"
        }`}
      >
        <span className="flex-1 text-left truncate max-w-[180px]">
          {selected ? selected.label : value ? value : "Pick partner…"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-100">
            <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search handles…"
              aria-label="Search partners"
              className="flex-1 min-w-0 text-[12.5px] outline-none placeholder:text-gray-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="p-0.5 text-gray-400 hover:text-gray-700"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto py-1">
            {matches.length === 0 ? (
              <p className="px-3 py-2 text-[12px] text-gray-400">No handle matches “{query}”</p>
            ) : (
              matches.map((p, i) => (
                <div
                  key={p.sponsorId}
                  role="option"
                  aria-selected={p.sponsorId === value}
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[12.5px] cursor-pointer ${
                    i === active ? "bg-gray-100 text-gray-900" : "text-gray-700"
                  }`}
                >
                  <span className="flex-1 truncate">{p.label}</span>
                  {p.sponsorId === value && <Check className="h-3.5 w-3.5 text-gray-700 shrink-0" />}
                </div>
              ))
            )}
          </div>
          {selected && (
            <div className="border-t border-gray-100">
              <button
                type="button"
                onClick={() => pick(null)}
                className="w-full text-left px-3 py-1.5 text-[12px] text-gray-500 hover:text-gray-800 hover:bg-gray-50"
              >
                Clear partner
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

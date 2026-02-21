"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

interface FilterChipOption {
  value: string;
  label: string;
}

interface FilterChipProps {
  label: string;
  value: string | null;
  options: FilterChipOption[];
  onChange: (value: string | null) => void;
  allLabel?: string;
  /** Optional highlight styling when chip is inactive (e.g., for pending approvals) */
  highlightInactive?: boolean;
}

export function FilterChip({
  label,
  value,
  options,
  onChange,
  allLabel = "All",
  highlightInactive,
}: FilterChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isActive = value !== null;
  const displayLabel = isActive
    ? options.find((o) => o.value === value)?.label ?? value
    : label;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close when another chip opens — use a shared event
  useEffect(() => {
    if (!open) return;
    const handleOtherOpen = (e: Event) => {
      if ((e as CustomEvent).detail !== ref.current) {
        setOpen(false);
      }
    };
    window.addEventListener("filter-chip-open", handleOtherOpen);
    return () => window.removeEventListener("filter-chip-open", handleOtherOpen);
  }, [open]);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      window.dispatchEvent(
        new CustomEvent("filter-chip-open", { detail: ref.current })
      );
    }
  };

  const handleSelect = (optionValue: string | null) => {
    onChange(optionValue);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleToggle}
        className={`
          inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs
          transition-all duration-150 cursor-pointer select-none
          ${
            isActive
              ? "border border-gray-300 bg-gray-100 text-gray-900 font-medium"
              : highlightInactive
              ? "border border-amber-300 bg-amber-50 text-amber-700"
              : "border border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700"
          }
        `}
      >
        <span>{displayLabel}</span>
        {isActive ? (
          <span
            role="button"
            onClick={handleClear}
            className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 hover:text-gray-700 transition-colors"
          >
            <X className="h-3 w-3" />
          </span>
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[160px] max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          <button
            type="button"
            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
              !isActive ? "bg-gray-50 text-gray-900 font-medium" : "text-gray-600"
            }`}
            onClick={() => handleSelect(null)}
          >
            {allLabel}
          </button>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors ${
                value === opt.value ? "bg-gray-50 text-gray-900 font-medium" : "text-gray-600"
              }`}
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

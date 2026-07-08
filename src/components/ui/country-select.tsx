"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { getCountries, countryName } from "@/lib/countries";
import { ChevronDown } from "lucide-react";

interface CountrySelectProps {
  value: string | null;
  onChange: (code: string) => void;
  id?: string;
  placeholder?: string;
}

// Searchable country picker. Value is an ISO-2 code. The dropdown filters as
// you type; selecting sets the code and shows the country name.
export function CountrySelect({ value, onChange, id, placeholder }: CountrySelectProps) {
  const countries = React.useMemo(() => getCountries(), []);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selectedName = countryName(value);
  const filtered = query
    ? countries.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : countries;

  return (
    <div className="relative">
      <Input
        id={id}
        value={open ? query : selectedName ?? ""}
        placeholder={placeholder ?? "Select country"}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="pr-8"
        autoComplete="off"
      />
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto border rounded-lg bg-white shadow-lg">
          {filtered.map((c) => (
            <button
              key={c.code}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(c.code);
                setOpen(false);
              }}
            >
              {c.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500">No matching country</div>
          )}
        </div>
      )}
    </div>
  );
}

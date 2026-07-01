"use client";

// Shared date-range control for the partnerships overview. Presets resolve to
// concrete start/end days so the same {start,end} drives every top-section API
// (affiliate revenue, whitelisting spend, top movers). Editing either date input
// flips the preset to "custom".

export type RangePreset = "7d" | "30d" | "90d" | "ytd" | "custom";
export type ResolvedRange = { start: string; end: string; preset: RangePreset };

const PRESETS: { value: Exclude<RangePreset, "custom">; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "ytd", label: "YTD" },
];

function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dayOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Map a preset to a concrete inclusive [start, end] window ending today (UTC).
export function resolveRange(preset: Exclude<RangePreset, "custom">): ResolvedRange {
  const end = todayUTC();
  const start = new Date(end);
  if (preset === "7d") start.setUTCDate(end.getUTCDate() - 6);
  else if (preset === "30d") start.setUTCDate(end.getUTCDate() - 29);
  else if (preset === "90d") start.setUTCDate(end.getUTCDate() - 89);
  else if (preset === "ytd") start.setUTCMonth(0, 1); // Jan 1 of current year
  return { start: dayOnly(start), end: dayOnly(end), preset };
}

export function DateRangePicker({
  value,
  onChange,
}: {
  value: ResolvedRange;
  onChange: (next: ResolvedRange) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      <div className="inline-flex bg-gray-100 rounded-md p-0.5">
        {PRESETS.map((p) => {
          const active = value.preset === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(resolveRange(p.value))}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                active
                  ? "bg-white text-gray-900 font-medium shadow-sm"
                  : "bg-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="inline-flex items-center gap-1">
        <input
          type="date"
          value={value.start}
          max={value.end}
          onChange={(e) =>
            e.target.value && onChange({ start: e.target.value, end: value.end, preset: "custom" })
          }
          className="border border-gray-200 rounded px-1.5 py-1 text-xs text-gray-700"
        />
        <span className="text-gray-400 text-xs">→</span>
        <input
          type="date"
          value={value.end}
          min={value.start}
          onChange={(e) =>
            e.target.value && onChange({ start: value.start, end: e.target.value, preset: "custom" })
          }
          className="border border-gray-200 rounded px-1.5 py-1 text-xs text-gray-700"
        />
      </div>
    </div>
  );
}

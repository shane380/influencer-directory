export type RangeOption<V extends string = string> = {
  value: V;
  label: string;
};

export const DEFAULT_RANGE_OPTIONS: RangeOption<"30d" | "90d" | "6m" | "12m">[] = [
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "6m", label: "6M" },
  { value: "12m", label: "12M" },
];

export function RangePicker<V extends string>({
  value,
  onChange,
  options = DEFAULT_RANGE_OPTIONS as unknown as RangeOption<V>[],
}: {
  value: V;
  onChange: (next: V) => void;
  options?: RangeOption<V>[];
}) {
  return (
    <div className="inline-flex bg-gray-100 rounded-md p-0.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              active
                ? "bg-white text-gray-900 font-medium shadow-sm"
                : "bg-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

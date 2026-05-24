type SubtitleTone = "default" | "success" | "danger";

const toneClass: Record<SubtitleTone, string> = {
  default: "text-gray-500",
  success: "text-green-600",
  danger: "text-red-600",
};

export function KpiCard({
  label,
  value,
  subtitle,
  subtitleTone = "default",
}: {
  label: string;
  value: string;
  subtitle?: string;
  subtitleTone?: SubtitleTone;
}) {
  return (
    <div className="bg-gray-50 rounded-md px-3.5 py-3">
      <div className="text-[11px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-[20px] font-medium mt-1 text-gray-900">{value}</div>
      {subtitle ? (
        <div className={`text-xs mt-0.5 ${toneClass[subtitleTone]}`}>{subtitle}</div>
      ) : null}
    </div>
  );
}

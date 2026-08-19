"use client";

import { CampaignDeal } from "@/types/database";
import { summarize } from "@/lib/retainers";
import { formatCurrencyDetailed } from "@/lib/constants";
import { AlertCircle } from "lucide-react";

interface RetainerSummaryBarProps {
  deals: Array<CampaignDeal & { influencer?: { name: string } }>;
}

// The check-in strip: what is running, what it is worth, and what is owed right
// now. Sits in the same slot as the month-budget bar, which is meaningless when
// the table is filtered to retainers.
export function RetainerSummaryBar({ deals }: RetainerSummaryBarProps) {
  const s = summarize(deals);

  return (
    <div className="mb-4 p-3 bg-white rounded-lg border shadow-sm">
      <div className="flex flex-wrap items-stretch gap-x-8 gap-y-3">
        <Stat label="Active retainers" value={String(s.active)} />
        <Stat label="Contract value" value={formatCurrencyDetailed(s.contract)} />
        <Stat label="Earned to date" value={formatCurrencyDetailed(s.earned)} />
        <Stat label="Paid to date" value={formatCurrencyDetailed(s.paid)} />
        <Stat
          label="Outstanding"
          value={formatCurrencyDetailed(s.outstanding)}
          hint="earned but not yet paid"
          tone={s.outstanding > 0 ? "warn" : "default"}
        />
        <Stat
          label="Ending in 30 days"
          value={String(s.endingSoon)}
          tone={s.endingSoon > 0 ? "warn" : "default"}
        />
      </div>

      {s.undated > 0 && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            {s.undated} active {s.undated === 1 ? "retainer has" : "retainers have"} no start date, so
            nothing can accrue against {s.undated === 1 ? "it" : "them"} yet. Set the start date and
            mark each installment&apos;s content delivered to bring {s.undated === 1 ? "it" : "them"} into
            the totals above.
          </span>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="min-w-[110px]">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-semibold ${tone === "warn" ? "text-amber-600" : "text-gray-900"}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-gray-400 leading-tight">{hint}</div>}
    </div>
  );
}

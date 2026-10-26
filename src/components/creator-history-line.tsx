"use client";

import type { HistorySummary } from "@/lib/creator-history";
import { RECENT_GIFT_DAYS } from "@/lib/gift";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Third line under a creator's handle on a campaign roster: "New" for a first
// campaign, otherwise their most recent other campaign and how it went. Amber
// when that campaign gifted them inside the recent window. Hover lists all.
export function CreatorHistoryLine({ summary }: { summary: HistorySummary | undefined }) {
  if (!summary) return null;

  if (summary.isNew) {
    return (
      <span
        className="mt-0.5 inline-flex w-fit items-center rounded-full bg-sky-50 px-1.5 py-0.5 text-[10.5px] font-medium text-sky-700"
        title="First campaign with us"
      >
        New
      </span>
    );
  }

  const last = summary.last!;
  const full = summary.all
    .map((e) => `${e.campaignName} · ${shortDate(e.date)} · ${e.outcome}`)
    .join("\n");
  const title = last.recentGift
    ? `Gifted within the last ${RECENT_GIFT_DAYS} days\n\n${full}`
    : full;

  return (
    <span
      className={`text-[12px] truncate max-w-full ${last.recentGift ? "text-amber-600" : "text-gray-400"}`}
      title={title}
    >
      {last.later ? "Also" : "Last"}: {last.campaignName} · {shortDate(last.date)} · {last.outcome}
      {summary.all.length > 1 ? ` · +${summary.all.length - 1}` : ""}
    </span>
  );
}

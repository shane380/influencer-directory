"use client";

import { CampaignDeal } from "@/types/database";
import {
  daysRemaining,
  termExpiry,
  termProgress,
  termState,
  primaryTermDeal,
  termEndFromPosts,
} from "@/lib/whitelisting";

// The term at a glance, for the list view. Daisy works in the list rather than
// the cards, and the list had no way at all to see a usage window running out.
export function WhitelistingTermCell({ deals }: { deals: CampaignDeal[] }) {
  const deal = primaryTermDeal(deals);
  if (!deal) return <span className="text-gray-300 text-xs">—</span>;

  const state = termState(deal);
  const left = daysRemaining(deal) ?? 0;
  const expiry = termExpiry(deal);
  const progress = termProgress(deal) ?? 0;
  const expiryLabel = expiry ? expiry.toISOString().slice(0, 10) : "—";
  // Combination deals end a tail after the final post, so while posts are
  // outstanding the date on file is a placeholder that will move.
  const fromPosts = termEndFromPosts(deal);
  const provisional = fromPosts?.provisional ?? false;

  const tone =
    state === "expired" ? { text: "text-red-600", bar: "bg-red-500" }
    : state === "expiring" ? { text: "text-amber-600", bar: "bg-amber-500" }
    : state === "ended" ? { text: "text-gray-400", bar: "bg-gray-300" }
    : { text: "text-gray-600", bar: "bg-green-500" };

  const label =
    state === "ended" ? "Ended"
    : left === 0 ? "Ends today"
    : state === "expired" ? `Expired ${Math.abs(left)}d ago`
    : left === 1 ? "1 day left"
    : `${left} days left`;

  return (
    <div className="min-w-[130px]" title={`Usage term ends ${expiryLabel}`}>
      <div className={`text-xs font-medium ${tone.text}`}>{label}</div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden my-1">
        <div className={`h-full ${tone.bar}`} style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      <div className="text-[11px] text-gray-400">
        ends {expiryLabel}
        {provisional && (
          <span className="text-amber-500" title="Posts are still outstanding. The term ends 30 days after the final post, so this date will move."> · moves with final post</span>
        )}
      </div>
    </div>
  );
}

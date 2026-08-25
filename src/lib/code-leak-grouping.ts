/**
 * Grouping for the affiliate-code leak page.
 *
 * Pure logic, kept out of the page component so it can be run directly against
 * real rows rather than only through the UI.
 */

export type LeakSeverity = "confirmed" | "high" | "medium";
export type LeakStatus = "open" | "acknowledged" | "resolved" | "ignored";

export type LeakSignalRow = {
  id: string;
  affiliate_code: string;
  owner_name: string | null;
  signal_type: "coupon_referrer" | "referrer_mix" | "usage_spike";
  severity: LeakSeverity;
  evidence: any;
  window_start: string;
  window_end: string;
  status: LeakStatus;
  first_detected_at: string;
  last_detected_at: string;
};

const SEVERITY_RANK: Record<LeakSeverity, number> = {
  confirmed: 0,
  high: 1,
  medium: 2,
};

export type CodeGroup = {
  code: string;
  ownerName: string | null;
  signals: LeakSignalRow[];
  severity: LeakSeverity;
  status: LeakStatus;
  firstDetected: string;
  lastDetected: string;
};

/**
 * One card per affiliate code, not per finding.
 *
 * A code that trips two detectors is still one problem with one fix — rotating
 * it closes both — so showing it twice both misreads the situation and invites
 * you to resolve half of it. Grouped by code rather than by creator because
 * the code is the unit you actually rotate, and a creator can hold two (a
 * partner code plus a legacy one) that would need separate fixes.
 */
export function groupByCode(signals: LeakSignalRow[]): CodeGroup[] {
  const map = new Map<string, LeakSignalRow[]>();
  for (const s of signals) {
    const key = (s.affiliate_code || "").toUpperCase();
    map.set(key, [...(map.get(key) || []), s]);
  }

  const groups: CodeGroup[] = [];
  for (const [code, rows] of map) {
    const sorted = [...rows].sort(
      (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
    );
    const dates = rows.map((r) => r.first_detected_at).filter(Boolean).sort();
    const seen = rows.map((r) => r.last_detected_at).filter(Boolean).sort();
    groups.push({
      code,
      ownerName: rows.find((r) => r.owner_name)?.owner_name || null,
      signals: sorted,
      // The card carries the worst finding's severity: a code with a confirmed
      // coupon-site referral shouldn't read as merely "likely" because a
      // second, softer finding sorted first.
      severity: sorted[0].severity,
      // Only fully-open when nothing in the group has been touched.
      status: rows.every((r) => r.status === "open") ? "open" : sorted[0].status,
      firstDetected: dates[0] || "",
      lastDetected: seen[seen.length - 1] || "",
    });
  }

  return groups.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.code.localeCompare(b.code),
  );
}


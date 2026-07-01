// Shared date-window math for the partnerships overview APIs (affiliate revenue,
// whitelisting spend, top movers). Keeps the "current vs previous equal-length
// window" and series-bucketing logic identical across every endpoint.

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function parseDay(s: string): Date {
  const [y, m, d] = s.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

// Resolve the requested inclusive [start, end] window. Falls back to the last 30
// days when params are missing/invalid; guarantees start <= end.
export function resolveWindow(
  startParam: string | null,
  endParam: string | null,
): { start: string; end: string } {
  const today = todayUTC();
  let end = endParam && DAY_RE.test(endParam) ? parseDay(endParam) : today;
  let start: Date;
  if (startParam && DAY_RE.test(startParam)) {
    start = parseDay(startParam);
  } else {
    start = new Date(end);
    start.setUTCDate(end.getUTCDate() - 29);
  }
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  return { start: dayOnly(start), end: dayOnly(end) };
}

// The equal-length window immediately preceding [start, end].
export function previousWindow(
  start: string,
  end: string,
): { prevStart: string; prevEnd: string } {
  const s = parseDay(start);
  const e = parseDay(end);
  const lengthDays = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const prevEnd = new Date(s);
  prevEnd.setUTCDate(s.getUTCDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setUTCDate(prevEnd.getUTCDate() - (lengthDays - 1));
  return { prevStart: dayOnly(prevStart), prevEnd: dayOnly(prevEnd) };
}

// Daily series for short windows, monthly for long ones.
export function granularityFor(start: string, end: string): "daily" | "monthly" {
  const s = parseDay(start);
  const e = parseDay(end);
  const lengthDays = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  return lengthDays <= 92 ? "daily" : "monthly";
}

export function buildDayList(start: string, end: string): string[] {
  const out: string[] = [];
  const cur = parseDay(start);
  const e = parseDay(end);
  while (cur <= e) {
    out.push(dayOnly(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function buildMonthList(start: string, end: string): string[] {
  const out: string[] = [];
  const s = parseDay(start);
  const e = parseDay(end);
  let y = s.getUTCFullYear();
  let m = s.getUTCMonth();
  while (y < e.getUTCFullYear() || (y === e.getUTCFullYear() && m <= e.getUTCMonth())) {
    out.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m > 11) { m = 0; y += 1; }
  }
  return out;
}

import ExcelJS from "exceljs";
import type { AccrualLine, AccrualSummary } from "./accrual";

// The bookkeeper's workbook. Three tabs: the totals he posts (Summary), the
// per-creator grid mirroring the payments page (By Creator), and every
// underlying event (Transactions) so any figure can be traced without a second
// download. CSV stays available for software imports; this is the file a human
// reads.

const MONEY = '"$"#,##0.00';
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
const TOP_BORDER: Partial<ExcelJS.Borders> = { top: { style: "thin", color: { argb: "FF9CA3AF" } } };

function monthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

const bucketOf = (category: string): "affiliate" | "whitelisting" | "retainer" | "paid_collab" | "payout" => {
  if (category === "refund") return "affiliate";
  if (category === "whitelisting" || category === "retainer" || category === "paid_collab" || category === "payout") return category;
  return "affiliate";
};

export async function buildAccrualWorkbook(
  lines: AccrualLine[],
  summary: AccrualSummary,
  methodByHandle: Record<string, string> = {}
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const label = monthLabel(summary.period);

  // ---- aggregate ----
  type Row = { name: string; handle: string; affiliate: number; whitelisting: number; retainer: number; paidCollab: number; paid: number };
  const byCreator = new Map<string, Row>();
  const totals = { affiliate: 0, whitelisting: 0, retainer: 0, paidCollab: 0, paid: 0 };
  for (const l of lines) {
    const key = l.handle || l.creator_name;
    let r = byCreator.get(key);
    if (!r) { r = { name: l.creator_name, handle: l.handle, affiliate: 0, whitelisting: 0, retainer: 0, paidCollab: 0, paid: 0 }; byCreator.set(key, r); }
    const b = bucketOf(l.category);
    if (b === "affiliate") { r.affiliate += l.accrued; totals.affiliate += l.accrued; }
    else if (b === "whitelisting") { r.whitelisting += l.accrued; totals.whitelisting += l.accrued; }
    else if (b === "retainer") { r.retainer += l.accrued; totals.retainer += l.accrued; }
    else if (b === "paid_collab") { r.paidCollab += l.accrued; totals.paidCollab += l.accrued; }
    r.paid += l.paid; totals.paid += l.paid;
  }

  // ---- Summary tab ----
  const s = wb.addWorksheet("Summary");
  s.columns = [{ width: 46 }, { width: 18 }];

  const title = s.addRow([`Accrual report — ${label}`]);
  title.font = { bold: true, size: 15 };
  s.addRow([`All amounts in ${summary.currency}. Expenses are recorded in the month earned, not the month paid.`]).font = { size: 10, color: { argb: "FF6B7280" } };
  s.addRow([]);

  const sec1 = s.addRow(["EARNED THIS PERIOD, BY PARTNERSHIP TYPE"]);
  sec1.font = { bold: true, size: 11 };
  sec1.getCell(1).fill = HEADER_FILL;
  sec1.getCell(2).fill = HEADER_FILL;
  const money = (label_: string, value: number, bold = false) => {
    const r = s.addRow([label_, value]);
    r.getCell(2).numFmt = MONEY;
    if (bold) { r.font = { bold: true }; r.getCell(1).border = TOP_BORDER; r.getCell(2).border = TOP_BORDER; }
    return r;
  };
  money("Affiliate commission (net of refunds)", totals.affiliate);
  money("Whitelisting (ad-spend share + usage fees)", totals.whitelisting);
  money("Paid collabs (one-offs + retainers)", totals.paidCollab + totals.retainer);
  money("TOTAL EARNED", summary.accrued, true);
  s.addRow([]);

  const sec2 = s.addRow(["LIABILITY RECONCILIATION"]);
  sec2.font = { bold: true, size: 11 };
  sec2.getCell(1).fill = HEADER_FILL;
  sec2.getCell(2).fill = HEADER_FILL;
  money("Opening accrued liability", summary.opening_liability);
  money("Earned this period", summary.accrued);
  money("Paid this period", summary.paid);
  money("Closing accrued liability (still owed)", summary.closing_liability, true);

  if (summary.unplaced_count > 0) {
    s.addRow([]);
    const note = s.addRow([
      `Note: ${summary.unplaced_count} payment(s) totalling $${summary.unplaced_paid.toFixed(2)} are recorded as paid with no date and appear in no period. Closing liability is overstated by that amount until dates are added.`,
    ]);
    note.font = { italic: true, size: 10, color: { argb: "FF92400E" } };
    s.mergeCells(note.number, 1, note.number, 2);
    note.getCell(1).alignment = { wrapText: true };
    note.height = 40;
  }

  // ---- By Creator tab ----
  const c = wb.addWorksheet("By Creator");
  c.columns = [
    { header: "Creator", width: 24 },
    { header: "Handle", width: 22 },
    { header: "Payment method", width: 16 },
    { header: "Affiliate", width: 13 },
    { header: "Whitelisting", width: 13 },
    { header: "Retainer", width: 13 },
    { header: "One-off", width: 13 },
    { header: "Earned", width: 13 },
    { header: "Paid this period", width: 15 },
  ];
  c.getRow(1).font = { bold: true };
  c.getRow(1).eachCell((cell) => { cell.fill = HEADER_FILL; });
  c.views = [{ state: "frozen", ySplit: 1 }];

  const rows = [...byCreator.values()].sort(
    (a, b) => (b.affiliate + b.whitelisting + b.retainer + b.paidCollab) - (a.affiliate + a.whitelisting + a.retainer + a.paidCollab)
  );
  const cell = (n: number) => (Math.abs(n) < 0.005 ? null : n);
  for (const r of rows) {
    const earned = r.affiliate + r.whitelisting + r.retainer + r.paidCollab;
    c.addRow([r.name, r.handle, methodByHandle[r.handle] || methodByHandle[r.name] || "",
      cell(r.affiliate), cell(r.whitelisting), cell(r.retainer), cell(r.paidCollab), earned, cell(r.paid)]);
  }
  const totalRow = c.addRow(["TOTAL", "", "", totals.affiliate, totals.whitelisting, totals.retainer, totals.paidCollab, summary.accrued, totals.paid]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cellRef) => { cellRef.border = TOP_BORDER; });
  for (let col = 4; col <= 9; col++) c.getColumn(col).numFmt = MONEY;

  // ---- Transactions tab ----
  const t = wb.addWorksheet("Transactions");
  t.columns = [
    { header: "Period", width: 10 },
    { header: "Creator", width: 24 },
    { header: "Category", width: 13 },
    { header: "Description", width: 36 },
    { header: "Accrued", width: 12 },
    { header: "Paid", width: 12 },
    { header: "Paid date", width: 12 },
    { header: "Reference", width: 22 },
    { header: "Source", width: 34 },
  ];
  t.getRow(1).font = { bold: true };
  t.getRow(1).eachCell((cellRef) => { cellRef.fill = HEADER_FILL; });
  t.views = [{ state: "frozen", ySplit: 1 }];
  t.autoFilter = "A1:I1";
  const sorted = [...lines].sort((a, b) => a.creator_name.localeCompare(b.creator_name) || a.category.localeCompare(b.category));
  for (const l of sorted) {
    t.addRow([l.period, l.creator_name, l.category, l.description, cell(l.accrued), cell(l.paid), l.paid_date ?? "", l.reference ?? "", l.source]);
  }
  t.getColumn(5).numFmt = MONEY;
  t.getColumn(6).numFmt = MONEY;

  return Buffer.from(await wb.xlsx.writeBuffer());
}

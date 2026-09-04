// Data Sharing / medication-stock export — CSV, generated entirely
// client-side (no Supabase Storage upload, no database writes/records).
// Excel opens a UTF-8 CSV natively as a normal spreadsheet with the correct
// columns; this is deliberately NOT a binary .xlsx file — the only
// npm-published `xlsx` (SheetJS) package carries a known high-severity
// advisory (prototype pollution / ReDoS in its file PARSER), so this avoids
// that dependency entirely rather than ship a flagged package for a
// write-only need.
//
// All the underlying numbers reuse the exact same helpers used everywhere
// else in the app (medAvailableQty/medExpiredQty/medTotalQty/medUrgency) —
// nothing here recomputes stock math, so the export can never disagree with
// what the dashboard/medication cards already show.

import { todayISO, formatFullDate } from "./dates";
import { medAvailableQty, medExpiredQty, medTotalQty, medUrgency } from "./medications";

// Fixed display/column order — selection never changes this order, only
// which of these rows are included (see buildExportTable() below).
export const EXPORT_FIELDS = [
  { key: "name", label: "اسم الدواء", required: true },
  { key: "category", label: "الفئة" },
  { key: "availableQty", label: "الكمية المتوفرة" },
  { key: "expiredQty", label: "الكمية منتهية الصلاحية" },
  { key: "totalQty", label: "الكمية الإجمالية" },
  { key: "stockStatus", label: "حالة المخزون" },
  { key: "exportDate", label: "تاريخ التصدير" },
];

// Same urgency buckets medUrgency()/URGENCY_STYLE already use elsewhere —
// just given an export-friendly Arabic label instead of a UI color/icon.
const STOCK_STATUS_LABEL = {
  expired: "منتهي الصلاحية",
  critical: "حرج (أقل من شهر)",
  warning: "تحذير (أقل من ٣ أشهر)",
  ok: "جيد",
  empty: "لا يوجد مخزون",
};

function fieldValue(key, med, ctx) {
  switch (key) {
    case "name":
      return med.name;
    case "category":
      return ctx.categoryName(med.categoryId);
    case "availableQty":
      return medAvailableQty(med, ctx.referenceISO);
    case "expiredQty":
      return medExpiredQty(med, ctx.referenceISO);
    case "totalQty":
      return medTotalQty(med);
    case "stockStatus":
      return STOCK_STATUS_LABEL[medUrgency(med)];
    case "exportDate":
      return ctx.exportDateLabel;
    default:
      return "";
  }
}

// Builds { headers, rows } for exactly the selected fields, in
// EXPORT_FIELDS' fixed order (never the order `selectedKeys` was passed in,
// never alphabetical, never object/DB key order) — "name" is always
// included regardless of whether it's present in `selectedKeys`, since it
// is `required` and can never actually be deselected by the UI anyway.
//
// Pure and DOM-free: takes the medications/categories collections already
// loaded by the app and a reference date, returns plain data. Never mutates
// `medications`/`categories`.
export function buildExportTable(medications, categories, selectedKeys, referenceISO = todayISO()) {
  const fields = EXPORT_FIELDS.filter((f) => f.required || selectedKeys.includes(f.key));
  const categoryName = (id) => categories.find((c) => c.id === id)?.name || "بدون فئة";
  const exportDateLabel = formatFullDate(referenceISO);
  const ctx = { categoryName, referenceISO, exportDateLabel };

  return {
    headers: fields.map((f) => f.label),
    rows: medications.map((med) => fields.map((f) => String(fieldValue(f.key, med, ctx)))),
  };
}

function escapeCsvCell(value) {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// RFC 4180-ish CSV (CRLF line endings, quote-escaped cells) — Excel's own
// native expectation for a CSV it opens directly.
export function rowsToCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

// U+FEFF, built via fromCharCode (not a literal character in the source
// file) so it can never be silently stripped/mangled by an editor or
// encoding conversion — prepended so Excel (which otherwise guesses the
// legacy system codepage for a plain CSV) renders Arabic text correctly
// instead of as mojibake.
const UTF8_BOM = String.fromCharCode(0xfeff);

// The only DOM-touching piece here: builds a Blob and clicks a throwaway
// <a download> — no upload, no network call, no Supabase Storage, nothing
// written to any database.
export function downloadCsvFile(filename, csvContent) {
  const blob = new Blob([UTF8_BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

import { describe, it, expect } from "vitest";
import { EXPORT_FIELDS, buildExportTable, rowsToCsv } from "./exportMedications";

const REFERENCE = "2026-08-15";
const categories = [{ id: "cat1", name: "مسكنات" }];

const medFull = {
  id: "m1",
  name: "Panadol",
  categoryId: "cat1",
  batches: [
    { id: "b1", expiry: "2029-01-01", qty: 12 }, // available
    { id: "b2", expiry: "2026-07-01", qty: 8 }, // expired (before August 2026)
  ],
};
const medNoCategory = {
  id: "m2",
  name: "Zinc",
  categoryId: null,
  batches: [{ id: "b3", expiry: "2026-06-01", qty: 5 }], // expired -> critical/expired status
};

describe("EXPORT_FIELDS — fixed column order", () => {
  it("declares fields in the exact required order, with only name required", () => {
    expect(EXPORT_FIELDS.map((f) => f.key)).toEqual([
      "name",
      "category",
      "availableQty",
      "expiredQty",
      "totalQty",
      "stockStatus",
      "exportDate",
    ]);
    expect(EXPORT_FIELDS.filter((f) => f.required).map((f) => f.key)).toEqual(["name"]);
  });
});

describe("buildExportTable() — column selection and ordering", () => {
  it("with only 'name' selected: exports just the name column", () => {
    const { headers, rows } = buildExportTable([medFull], categories, ["name"], REFERENCE);
    expect(headers).toEqual(["اسم الدواء"]);
    expect(rows).toEqual([["Panadol"]]);
  });

  it("always includes 'name' even if it is NOT present in selectedKeys", () => {
    const { headers, rows } = buildExportTable([medFull], categories, ["category"], REFERENCE);
    expect(headers).toEqual(["اسم الدواء", "الفئة"]);
    expect(rows[0][0]).toBe("Panadol");
  });

  it("preserves the fixed EXPORT_FIELDS order regardless of the order fields were selected in", () => {
    // selected out of order: stockStatus, then availableQty, then category
    const { headers } = buildExportTable(
      [medFull],
      categories,
      ["stockStatus", "availableQty", "category"],
      REFERENCE,
    );
    expect(headers).toEqual(["اسم الدواء", "الفئة", "الكمية المتوفرة", "حالة المخزون"]);
  });

  it("with all fields selected: exports every column in the specified order", () => {
    const allKeys = EXPORT_FIELDS.map((f) => f.key);
    const { headers } = buildExportTable([medFull], categories, allKeys, REFERENCE);
    expect(headers).toEqual([
      "اسم الدواء",
      "الفئة",
      "الكمية المتوفرة",
      "الكمية منتهية الصلاحية",
      "الكمية الإجمالية",
      "حالة المخزون",
      "تاريخ التصدير",
    ]);
  });
});

describe("buildExportTable() — data reuses the app's existing calculations", () => {
  it("availableQty/expiredQty/totalQty match medAvailableQty()/medExpiredQty()/medTotalQty() exactly", () => {
    const allKeys = ["name", "availableQty", "expiredQty", "totalQty"];
    const { rows } = buildExportTable([medFull], categories, allKeys, REFERENCE);
    // 12 available (2029 batch), 8 expired (07/2026, before reference month 08/2026), 20 total
    expect(rows[0]).toEqual(["Panadol", "12", "8", "20"]);
  });

  it("category falls back to 'بدون فئة' for a medication with no category, matching MedCard's own fallback", () => {
    const { rows } = buildExportTable([medNoCategory], categories, ["name", "category"], REFERENCE);
    expect(rows[0]).toEqual(["Zinc", "بدون فئة"]);
  });

  it("category resolves the category's name for a medication that has one", () => {
    const { rows } = buildExportTable([medFull], categories, ["name", "category"], REFERENCE);
    expect(rows[0]).toEqual(["Panadol", "مسكنات"]);
  });

  it("stockStatus reflects medUrgency()'s bucket for the medication", () => {
    const { rows } = buildExportTable([medNoCategory], categories, ["name", "stockStatus"], REFERENCE);
    expect(rows[0]).toEqual(["Zinc", "منتهي الصلاحية"]);
  });

  it("exportDate is the reference date, day-precision formatted (formatFullDate), not the medication's expiry", () => {
    const { rows } = buildExportTable([medFull], categories, ["name", "exportDate"], REFERENCE);
    expect(rows[0]).toEqual(["Panadol", "15/08/2026"]);
  });

  it("does not mutate the medications or categories arrays/objects passed in", () => {
    const medsCopy = [medFull, medNoCategory];
    const catsCopy = [...categories];
    const medsSnapshot = JSON.parse(JSON.stringify(medsCopy));
    const catsSnapshot = JSON.parse(JSON.stringify(catsCopy));

    buildExportTable(medsCopy, catsCopy, EXPORT_FIELDS.map((f) => f.key), REFERENCE);

    expect(medsCopy).toEqual(medsSnapshot);
    expect(catsCopy).toEqual(catsSnapshot);
  });

  it("exports one row per medication, in the input array's order", () => {
    const { rows } = buildExportTable([medFull, medNoCategory], categories, ["name"], REFERENCE);
    expect(rows).toEqual([["Panadol"], ["Zinc"]]);
  });

  it("with zero medications: returns headers with no rows (never throws)", () => {
    const { headers, rows } = buildExportTable([], categories, ["name"], REFERENCE);
    expect(headers).toEqual(["اسم الدواء"]);
    expect(rows).toEqual([]);
  });
});

describe("rowsToCsv() — CSV serialization", () => {
  it("joins headers and rows with commas and CRLF line endings", () => {
    const csv = rowsToCsv(["اسم الدواء", "الفئة"], [["Panadol", "مسكنات"]]);
    expect(csv).toBe("اسم الدواء,الفئة\r\nPanadol,مسكنات");
  });

  it("quotes and escapes a cell containing a comma", () => {
    const csv = rowsToCsv(["اسم الدواء"], [["Panadol, 500mg"]]);
    expect(csv).toBe('اسم الدواء\r\n"Panadol, 500mg"');
  });

  it("quotes and doubles internal quotes in a cell containing a quote character", () => {
    const csv = rowsToCsv(["اسم الدواء"], [['Say "Hi"']]);
    expect(csv).toBe('اسم الدواء\r\n"Say ""Hi"""');
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// downloadCsvFile is the only DOM-touching piece (Blob + <a download>,
// unsupported in jsdom's URL implementation) — mocked here so tests can
// assert on exactly what would have been downloaded without needing a real
// browser. buildExportTable/rowsToCsv/EXPORT_FIELDS stay real (importOriginal),
// so these tests exercise the actual column-selection/ordering/data logic.
const mockDownloadCsvFile = vi.hoisted(() => vi.fn());
vi.mock("../../lib/exportMedications", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, downloadCsvFile: mockDownloadCsvFile };
});

const { ExportMedsForm } = await import("./ExportMedsForm");

afterEach(cleanup);

const categories = [{ id: "cat1", name: "مسكنات" }];
const medications = [
  { id: "m1", name: "Amoxicillin", categoryId: "cat1", batches: [{ id: "b1", expiry: "2030-01-01", qty: 10 }] },
  { id: "m2", name: "Zinc", categoryId: null, batches: [{ id: "b2", expiry: "2030-01-01", qty: 5 }] },
];

function renderForm(overrides = {}) {
  const props = {
    medications,
    categories,
    onCancel: vi.fn(),
    onExported: vi.fn(),
    ...overrides,
  };
  return { ...render(<ExportMedsForm {...props} />), props };
}

function exportBtn() {
  return screen.getByRole("button", { name: /تصدير/ });
}

describe("ExportMedsForm — Medication Name is required and locked", () => {
  it("Medication Name is checked and its checkbox is disabled", () => {
    renderForm();
    const nameCheckbox = screen.getByRole("checkbox", { name: /اسم الدواء/ });
    expect(nameCheckbox.checked).toBe(true);
    expect(nameCheckbox.disabled).toBe(true);
  });

  it("clicking the Medication Name row does not uncheck it", () => {
    renderForm();
    const nameCheckbox = screen.getByRole("checkbox", { name: /اسم الدواء/ });
    fireEvent.click(nameCheckbox);
    expect(nameCheckbox.checked).toBe(true);
  });
});

describe("ExportMedsForm — optional fields are freely selectable", () => {
  it("all optional fields start unchecked", () => {
    renderForm();
    const optionalLabels = ["الفئة", "الكمية المتوفرة", "الكمية منتهية الصلاحية", "الكمية الإجمالية", "حالة المخزون", "تاريخ التصدير"];
    for (const label of optionalLabels) {
      expect(screen.getByRole("checkbox", { name: new RegExp(label) }).checked).toBe(false);
    }
  });

  it("an optional field toggles on then off on repeated clicks", () => {
    renderForm();
    const categoryCheckbox = screen.getByRole("checkbox", { name: /الفئة/ });
    fireEvent.click(categoryCheckbox);
    expect(categoryCheckbox.checked).toBe(true);
    fireEvent.click(categoryCheckbox);
    expect(categoryCheckbox.checked).toBe(false);
  });
});

describe("ExportMedsForm — export output: column selection and ordering", () => {
  it("exporting with only Medication Name selected includes just that column", async () => {
    mockDownloadCsvFile.mockClear();
    renderForm();
    fireEvent.click(exportBtn());

    await waitFor(() => expect(mockDownloadCsvFile).toHaveBeenCalledTimes(1));
    const [, csv] = mockDownloadCsvFile.mock.calls[0];
    expect(csv.split("\r\n")[0]).toBe("اسم الدواء");
    expect(csv).toContain("Amoxicillin");
    expect(csv).toContain("Zinc");
  });

  it("exporting with all fields selected includes every column, in the fixed order", async () => {
    mockDownloadCsvFile.mockClear();
    renderForm();
    for (const label of ["الفئة", "الكمية المتوفرة", "الكمية منتهية الصلاحية", "الكمية الإجمالية", "حالة المخزون", "تاريخ التصدير"]) {
      fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(label) }));
    }
    fireEvent.click(exportBtn());

    await waitFor(() => expect(mockDownloadCsvFile).toHaveBeenCalledTimes(1));
    const [, csv] = mockDownloadCsvFile.mock.calls[0];
    expect(csv.split("\r\n")[0]).toBe(
      "اسم الدواء,الفئة,الكمية المتوفرة,الكمية منتهية الصلاحية,الكمية الإجمالية,حالة المخزون,تاريخ التصدير",
    );
  });

  it("selecting fields out of on-screen click order still produces columns in the fixed spec order", async () => {
    mockDownloadCsvFile.mockClear();
    renderForm();
    // click stock status, then available quantity — reverse of their column order
    fireEvent.click(screen.getByRole("checkbox", { name: /حالة المخزون/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /الكمية المتوفرة/ }));
    fireEvent.click(exportBtn());

    await waitFor(() => expect(mockDownloadCsvFile).toHaveBeenCalledTimes(1));
    const [, csv] = mockDownloadCsvFile.mock.calls[0];
    expect(csv.split("\r\n")[0]).toBe("اسم الدواء,الكمية المتوفرة,حالة المخزون");
  });

  it("only the selected optional fields appear — an unselected field's column is absent", async () => {
    mockDownloadCsvFile.mockClear();
    renderForm();
    fireEvent.click(screen.getByRole("checkbox", { name: /الفئة/ }));
    fireEvent.click(exportBtn());

    await waitFor(() => expect(mockDownloadCsvFile).toHaveBeenCalledTimes(1));
    const [, csv] = mockDownloadCsvFile.mock.calls[0];
    expect(csv.split("\r\n")[0]).toBe("اسم الدواء,الفئة");
    expect(csv).not.toContain("الكمية المتوفرة");
  });
});

describe("ExportMedsForm — quantities reuse existing calculations", () => {
  it("Available/Expired Quantity columns match medAvailableQty()/medExpiredQty() for each medication", async () => {
    mockDownloadCsvFile.mockClear();
    const meds = [
      {
        id: "m1",
        name: "Mixed",
        categoryId: "cat1",
        batches: [
          { id: "b1", expiry: "2099-01-01", qty: 10 }, // available
          { id: "b2", expiry: "2000-01-01", qty: 4 }, // expired
        ],
      },
    ];
    renderForm({ medications: meds });
    fireEvent.click(screen.getByRole("checkbox", { name: /الكمية المتوفرة/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /الكمية منتهية الصلاحية/ }));
    fireEvent.click(exportBtn());

    await waitFor(() => expect(mockDownloadCsvFile).toHaveBeenCalledTimes(1));
    const [, csv] = mockDownloadCsvFile.mock.calls[0];
    expect(csv.split("\r\n")[1]).toBe("Mixed,10,4");
  });
});

describe("ExportMedsForm — success/cancel/error flow", () => {
  it("Export is disabled and no download happens when there is nothing to export", () => {
    mockDownloadCsvFile.mockClear();
    renderForm({ medications: [] });
    expect(exportBtn().disabled).toBe(true);
    fireEvent.click(exportBtn());
    expect(mockDownloadCsvFile).not.toHaveBeenCalled();
    expect(screen.getByText(/لا يوجد أدوية/)).toBeTruthy();
  });

  it("calls onExported after a successful export (so the caller can close the modal and show success feedback)", async () => {
    mockDownloadCsvFile.mockClear();
    const onExported = vi.fn();
    renderForm({ onExported });
    fireEvent.click(exportBtn());

    await waitFor(() => expect(onExported).toHaveBeenCalledTimes(1));
  });

  it("Cancel calls onCancel and never triggers a download", () => {
    mockDownloadCsvFile.mockClear();
    const onCancel = vi.fn();
    renderForm({ onCancel });
    fireEvent.click(screen.getByRole("button", { name: /إلغاء/ }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mockDownloadCsvFile).not.toHaveBeenCalled();
  });

  it("shows an error and does not call onExported when generation throws", async () => {
    mockDownloadCsvFile.mockClear();
    mockDownloadCsvFile.mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const onExported = vi.fn();
    renderForm({ onExported });
    fireEvent.click(exportBtn());

    expect(await screen.findByText("تعذر إنشاء ملف التصدير. حاول مرة أخرى.")).toBeTruthy();
    expect(onExported).not.toHaveBeenCalled();
  });
});

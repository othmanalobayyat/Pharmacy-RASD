// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

// Vitest hoists vi.mock() above imports — anything the factories close over
// must be created inside vi.hoisted(). Mocking the hooks directly (rather
// than the Supabase layer underneath them) keeps this test focused on
// App.jsx's own KPI-click -> navigation/filter wiring, which is what this
// feature actually changed.
const mockUseAuth = vi.hoisted(() => vi.fn());
const mockUsePharmacyData = vi.hoisted(() => vi.fn());
// LogSection (سجلّ الصرف, grouped) self-fetches from pharmacyApi directly,
// the same way MedHistory already does — mock it so mounting that tab in
// these tests never hits a real network call.
const mockFetchAllWithdrawalLogs = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
// downloadCsvFile is the only DOM-touching piece of the export feature
// (Blob + <a download>, unsupported in jsdom) — mocked so mounting/using the
// Data Sharing modal here never hits real browser download APIs. The real
// buildExportTable()/rowsToCsv() still run (see importOriginal below), so
// these tests exercise real column-selection/data logic end to end.
const mockDownloadCsvFile = vi.hoisted(() => vi.fn());

vi.mock("./hooks/useAuth", () => ({ useAuth: mockUseAuth }));
vi.mock("./hooks/usePharmacyData", () => ({ usePharmacyData: mockUsePharmacyData }));
vi.mock("./lib/pharmacyApi", () => ({
  fetchAllWithdrawalLogs: mockFetchAllWithdrawalLogs,
}));
vi.mock("./lib/exportMedications", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, downloadCsvFile: mockDownloadCsvFile };
});

const { default: PharmacyApp } = await import("./App");

afterEach(cleanup);

// Deterministic relative months, computed from the real "today" the same
// way the app's own expiry helpers are actually called (no reference-date
// override in App.jsx) — never a hardcoded calendar date that goes stale.
function monthISO(offset) {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1))
    .toISOString()
    .slice(0, 10);
}
const LAST_MONTH = monthISO(-1);
const THIS_MONTH = monthISO(0);
const FAR_FUTURE_MONTH = monthISO(4); // safely outside the "critical" (<=30 days) window

const categories = [{ id: "cat1", name: "مسكنات" }];

const medExpired = {
  id: "m-expired",
  name: "دواء منتهي الصلاحية",
  categoryId: "cat1",
  batches: [{ id: "b1", expiry: LAST_MONTH, qty: 5 }],
};
const medCritical = {
  id: "m-critical",
  name: "دواء قريب الانتهاء",
  categoryId: "cat1",
  batches: [{ id: "b2", expiry: THIS_MONTH, qty: 5 }],
};
const medOk = {
  id: "m-ok",
  name: "دواء سليم المخزون",
  categoryId: "cat1",
  batches: [{ id: "b3", expiry: FAR_FUTURE_MONTH, qty: 5 }],
};
// Only batch is expired but its quantity is 0 — physically nothing expired
// stock is actually on the shelf, so it must not count as "expired stock"
// anywhere, even though the batch record itself must still be retained
// (traceability) rather than deleted.
const medZeroQtyExpired = {
  id: "m-zero-qty-expired",
  name: "دواء منتهي بكمية صفر",
  categoryId: "cat1",
  batches: [{ id: "b-zero", expiry: LAST_MONTH, qty: 0 }],
};

const firstAidLow = { id: "f1", name: "شاش ناقص", qty: 1, threshold: 5 };
const firstAidOk = { id: "f2", name: "ضمادات كافية", qty: 20, threshold: 5 };

const baseState = {
  categories,
  medications: [medExpired, medCritical, medOk],
  firstAid: [firstAidLow, firstAidOk],
  log: [],
  uiLabels: {},
};

function pharmacyDataMock(overrides = {}) {
  return {
    state: baseState,
    loading: false,
    loadError: "",
    retryLoad: vi.fn(),
    cloudStatus: "idle",
    error: "",
    refetch: vi.fn(),
    addCategory: vi.fn(),
    editCategory: vi.fn(),
    addMedication: vi.fn(),
    editMedication: vi.fn(),
    deleteMedication: vi.fn(),
    addBatch: vi.fn(),
    deleteBatch: vi.fn(),
    adjustBatchQty: vi.fn(),
    withdrawStock: vi.fn(),
    quickWithdrawOne: vi.fn(),
    addFirstAid: vi.fn(),
    editFirstAid: vi.fn(),
    adjustFirstAid: vi.fn(),
    deleteFirstAid: vi.fn(),
    saveUiLabels: vi.fn(),
    logHasMore: false,
    loadingMoreLog: false,
    logMoreError: "",
    loadMoreLog: vi.fn(),
    logRefreshTick: 0,
    ...overrides,
  };
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({
    configured: true,
    user: { id: "u1", email: "admin@clinic.test" },
    profile: { clinicId: "c1", role: "admin" },
    isAdmin: true,
    loading: false,
    authError: "",
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    changePassword: vi.fn(),
    updateProfile: vi.fn().mockResolvedValue({}),
  });
  mockUsePharmacyData.mockReturnValue(pharmacyDataMock());
});

describe("KPI cards — clickable dashboard shortcuts", () => {
  it("'منتهية الصلاحية' opens Medications filtered to medications with expired stock only", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /منتهية الصلاحية/ }));

    expect(screen.getByText("دواء منتهي الصلاحية")).toBeTruthy();
    expect(screen.queryByText("دواء قريب الانتهاء")).toBeNull();
    expect(screen.queryByText("دواء سليم المخزون")).toBeNull();
    // filter is explained and reversible from the same screen
    expect(
      screen.getByText("عرض الأدوية التي تحتوي على مخزون منتهي الصلاحية فقط."),
    ).toBeTruthy();
  });

  it("a medication whose only expired batch has qty = 0 is excluded from the expired KPI count and filter", () => {
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({
        state: {
          ...baseState,
          medications: [medExpired, medZeroQtyExpired],
        },
      }),
    );
    render(<PharmacyApp />);
    const kpiBtn = screen.getByRole("button", { name: /منتهية الصلاحية/ });
    // count reflects only medExpired (qty=5) — the zero-qty batch adds nothing
    expect(kpiBtn.getAttribute("aria-label")).toContain(": 1");

    fireEvent.click(kpiBtn);
    expect(screen.getByText("دواء منتهي الصلاحية")).toBeTruthy();
    expect(screen.queryByText("دواء منتهي بكمية صفر")).toBeNull();
  });

  it("'أقل من شهر' opens Medications filtered to approaching-expiry stock, excluding already-expired medications", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /أقل من شهر/ }));

    expect(screen.getByText("دواء قريب الانتهاء")).toBeTruthy();
    expect(screen.queryByText("دواء منتهي الصلاحية")).toBeNull();
    expect(screen.queryByText("دواء سليم المخزون")).toBeNull();
  });

  it("'مواد إسعاف قاربت على الانتهاء' opens First Aid filtered to items at/below their threshold", () => {
    render(<PharmacyApp />);
    fireEvent.click(
      screen.getByRole("button", { name: /مواد إسعاف قاربت على الانتهاء/ }),
    );

    expect(screen.getByText("شاش ناقص")).toBeTruthy();
    expect(screen.queryByText("ضمادات كافية")).toBeNull();
  });

  it("'نوع دواء مسجل' opens Medications with the COMPLETE list — no expiry/stock filter applied", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /نوع دواء/ }));

    expect(screen.getByText("دواء منتهي الصلاحية")).toBeTruthy();
    expect(screen.getByText("دواء قريب الانتهاء")).toBeTruthy();
    expect(screen.getByText("دواء سليم المخزون")).toBeTruthy();
    expect(
      screen.queryByText("عرض الأدوية التي تحتوي على مخزون منتهي الصلاحية فقط."),
    ).toBeNull();
  });

  it("the normal 'كل الأدوية' view is reachable again from the existing sidebar after a KPI filter is active", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /منتهية الصلاحية/ }));
    expect(screen.queryByText("دواء سليم المخزون")).toBeNull();

    fireEvent.click(screen.getByText("كل الأدوية"));

    expect(screen.getByText("دواء منتهي الصلاحية")).toBeTruthy();
    expect(screen.getByText("دواء قريب الانتهاء")).toBeTruthy();
    expect(screen.getByText("دواء سليم المخزون")).toBeTruthy();
  });

  it("shows the existing empty state (not a blank area) when a KPI filter matches nothing", () => {
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({ state: { ...baseState, medications: [medOk] } }),
    );
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /منتهية الصلاحية/ }));

    expect(screen.getByText("لا يوجد أدوية منتهية الصلاحية")).toBeTruthy();
  });

  it("shows the existing empty state for the low-stock first-aid filter when nothing matches", () => {
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({ state: { ...baseState, firstAid: [firstAidOk] } }),
    );
    render(<PharmacyApp />);
    fireEvent.click(
      screen.getByRole("button", { name: /مواد إسعاف قاربت على الانتهاء/ }),
    );

    expect(screen.getByText("لا يوجد مواد إسعاف ناقصة")).toBeTruthy();
  });
});

describe("KPI cards — medFilter and firstAidFilter stay independent", () => {
  it("clicking the first-aid KPI activates the first-aid low-stock filter, not the medication lowStock filter", () => {
    render(<PharmacyApp />);
    // starts on the default "meds" tab — sanity check before the click
    expect(screen.getByText("كل الأدوية")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /مواد إسعاف قاربت على الانتهاء/ }),
    );

    // navigated to First Aid (the medications sidebar is gone)...
    expect(screen.queryByText("كل الأدوية")).toBeNull();
    // ...the low-stock filter banner is actually rendered (proof
    // firstAidFilter === "low" was really set, not just a lucky item match)...
    expect(
      screen.getByText("عرض مواد الإسعافات الأولية الناقصة عن حد التنبيه فقط."),
    ).toBeTruthy();
    // ...and only the low item is shown, the normal-stock item is not.
    expect(screen.getByText("شاش ناقص")).toBeTruthy();
    expect(screen.queryByText("ضمادات كافية")).toBeNull();

    // switching over to Medications shows the FULL unfiltered list — proof
    // that medFilter was never set to "lowStock" (or anything else) by the
    // first-aid KPI click.
    fireEvent.click(screen.getByText("الأدوية"));
    expect(screen.getByText("دواء منتهي الصلاحية")).toBeTruthy();
    expect(screen.getByText("دواء قريب الانتهاء")).toBeTruthy();
    expect(screen.getByText("دواء سليم المخزون")).toBeTruthy();
    expect(
      screen.queryByText("عرض الأدوية التي قاربت الكمية المتوفرة منها على الانتهاء (أقل من 5 عينات).", {
        exact: false,
      }),
    ).toBeNull();
  });

  it("a medication filter left active before switching to First Aid is cleared once the first-aid KPI is clicked", () => {
    render(<PharmacyApp />);
    // activate a medication filter first
    fireEvent.click(screen.getByRole("button", { name: /منتهية الصلاحية/ }));
    expect(screen.queryByText("دواء سليم المخزون")).toBeNull();

    // now use the first-aid KPI
    fireEvent.click(
      screen.getByRole("button", { name: /مواد إسعاف قاربت على الانتهاء/ }),
    );

    // back on Medications, the stale "expired" filter must be gone
    fireEvent.click(screen.getByText("الأدوية"));
    expect(screen.getByText("دواء منتهي الصلاحية")).toBeTruthy();
    expect(screen.getByText("دواء قريب الانتهاء")).toBeTruthy();
    expect(screen.getByText("دواء سليم المخزون")).toBeTruthy();
  });

  it("clicking the medication low-stock KPI does not activate the first-aid low-stock filter", () => {
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({
        state: {
          ...baseState,
          medications: [
            {
              id: "m-low",
              name: "دواء بوحدة واحدة",
              categoryId: "cat1",
              batches: [{ id: "b1", expiry: FAR_FUTURE_MONTH, qty: 1 }],
            },
          ],
        },
      }),
    );
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /قاربت الكمية على الانتهاء/ }));

    // firstAidFilter must remain "all" — both items still show on First Aid
    fireEvent.click(screen.getByText("الإسعافات الأولية"));
    expect(screen.getByText("شاش ناقص")).toBeTruthy();
    expect(screen.getByText("ضمادات كافية")).toBeTruthy();
  });

  it("the two KPI filters can never be restrictive at the same time", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /منتهية الصلاحية/ })); // medFilter = "expired"
    fireEvent.click(
      screen.getByRole("button", { name: /مواد إسعاف قاربت على الانتهاء/ }),
    ); // should reset medFilter to "all"

    // First Aid is correctly filtered...
    expect(screen.getByText("شاش ناقص")).toBeTruthy();
    expect(screen.queryByText("ضمادات كافية")).toBeNull();
    // ...and Medications is confirmed unfiltered (both cannot be
    // simultaneously restrictive).
    fireEvent.click(screen.getByText("الأدوية"));
    expect(screen.getByText("دواء منتهي الصلاحية")).toBeTruthy();
    expect(screen.getByText("دواء قريب الانتهاء")).toBeTruthy();
    expect(screen.getByText("دواء سليم المخزون")).toBeTruthy();
  });
});

describe("First Aid tab navigation vs. KPI navigation — filter lifecycle", () => {
  const lowStockBanner = "عرض مواد الإسعافات الأولية الناقصة عن حد التنبيه فقط.";
  const firstAidKpiButton = () =>
    screen.getByRole("button", { name: /مواد إسعاف قاربت على الانتهاء/ });

  it("Test 1 — normal First Aid tab navigation resets an active low-stock filter", () => {
    render(<PharmacyApp />);
    // reach firstAidFilter === "low" through the actual UI
    fireEvent.click(firstAidKpiButton());
    expect(screen.getByText(lowStockBanner)).toBeTruthy();

    // leave, then use the NORMAL tab button (not the KPI) to come back
    fireEvent.click(screen.getByText("الأدوية"));
    fireEvent.click(screen.getByText("الإسعافات الأولية"));

    expect(screen.queryByText(lowStockBanner)).toBeNull();
    expect(screen.getByText("شاش ناقص")).toBeTruthy();
    expect(screen.getByText("ضمادات كافية")).toBeTruthy();
  });

  it("Test 2 — the KPI still applies the low-stock filter on a fresh click", () => {
    render(<PharmacyApp />);
    fireEvent.click(firstAidKpiButton());

    expect(screen.getByText(lowStockBanner)).toBeTruthy();
    expect(screen.getByText("شاش ناقص")).toBeTruthy();
    expect(screen.queryByText("ضمادات كافية")).toBeNull();
  });

  it("Test 3 — First Aid -> KPI -> another tab -> First Aid tab ends unfiltered", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByText("الإسعافات الأولية")); // start in First Aid normally
    fireEvent.click(firstAidKpiButton()); // apply the low-stock filter
    fireEvent.click(screen.getByText("الأدوية")); // leave
    fireEvent.click(screen.getByText("الإسعافات الأولية")); // come back normally

    expect(screen.queryByText(lowStockBanner)).toBeNull();
    expect(screen.getByText("شاش ناقص")).toBeTruthy();
    expect(screen.getByText("ضمادات كافية")).toBeTruthy();
  });

  it("Test 4 — clicking the First Aid tab again while already there (filter active) resets it", () => {
    render(<PharmacyApp />);
    fireEvent.click(firstAidKpiButton());
    expect(screen.getByText(lowStockBanner)).toBeTruthy();

    // same tab, clicked again, without leaving first
    fireEvent.click(screen.getByText("الإسعافات الأولية"));

    expect(screen.queryByText(lowStockBanner)).toBeNull();
    expect(screen.getByText("شاش ناقص")).toBeTruthy();
    expect(screen.getByText("ضمادات كافية")).toBeTruthy();
  });

  it("Test 5 — medication filtering stays independent through this whole lifecycle", () => {
    render(<PharmacyApp />);
    // normal navigation to meds never activates a medication KPI filter
    fireEvent.click(screen.getByText("الأدوية"));
    expect(screen.getByText("دواء منتهي الصلاحية")).toBeTruthy();
    expect(screen.getByText("دواء قريب الانتهاء")).toBeTruthy();
    expect(screen.getByText("دواء سليم المخزون")).toBeTruthy();

    // the First Aid KPI/tab lifecycle above must never affect medFilter
    fireEvent.click(firstAidKpiButton());
    fireEvent.click(screen.getByText("الأدوية"));
    expect(screen.getByText("دواء منتهي الصلاحية")).toBeTruthy();
    expect(screen.getByText("دواء قريب الانتهاء")).toBeTruthy();
    expect(screen.getByText("دواء سليم المخزون")).toBeTruthy();

    // and a real medication KPI filter still works as before, independent
    // of anything First Aid did
    fireEvent.click(screen.getByRole("button", { name: /منتهية الصلاحية/ }));
    expect(screen.queryByText("دواء سليم المخزون")).toBeNull();
    fireEvent.click(screen.getByText("الإسعافات الأولية"));
    expect(screen.getByText("شاش ناقص")).toBeTruthy();
    expect(screen.getByText("ضمادات كافية")).toBeTruthy();
  });
});

describe("KPI — 'قاربت الكمية على الانتهاء' (available quantity < 5, using medAvailableQty())", () => {
  const med4Available = {
    id: "m-4-avail",
    name: "دواء بأربع وحدات",
    categoryId: "cat1",
    batches: [{ id: "b1", expiry: FAR_FUTURE_MONTH, qty: 4 }],
  };
  const med1Available = {
    id: "m-1-avail",
    name: "دواء بوحدة واحدة",
    categoryId: "cat1",
    batches: [{ id: "b1", expiry: FAR_FUTURE_MONTH, qty: 1 }],
  };
  const med5Available = {
    id: "m-5-avail",
    name: "دواء بخمس وحدات",
    categoryId: "cat1",
    batches: [{ id: "b1", expiry: FAR_FUTURE_MONTH, qty: 5 }],
  };
  const medZeroAvailable = {
    id: "m-zero-avail",
    name: "دواء بدون كمية",
    categoryId: "cat1",
    batches: [],
  };
  const medMixedValidExpired = {
    id: "m-mixed",
    name: "دواء بمخزون مختلط",
    categoryId: "cat1",
    // 4 valid + 20 expired -> available is 4 (< 5) -> included
    batches: [
      { id: "b-valid", expiry: FAR_FUTURE_MONTH, qty: 4 },
      { id: "b-expired", expiry: LAST_MONTH, qty: 20 },
    ],
  };
  const medExpiredOnly = {
    id: "m-expired-only",
    name: "دواء منتهي بالكامل",
    categoryId: "cat1",
    // 0 valid + 10 expired -> available is 0 -> excluded
    batches: [{ id: "b-expired", expiry: LAST_MONTH, qty: 10 }],
  };

  it("includes medications with 4, 1, mixed-valid-4, but excludes 5-available, 0-available, and expired-only", () => {
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({
        state: {
          ...baseState,
          medications: [
            med4Available,
            med1Available,
            med5Available,
            medZeroAvailable,
            medMixedValidExpired,
            medExpiredOnly,
          ],
        },
      }),
    );
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /قاربت الكمية على الانتهاء/ }));

    // included: available quantity is 1..4
    expect(screen.getByText("دواء بأربع وحدات")).toBeTruthy();
    expect(screen.getByText("دواء بوحدة واحدة")).toBeTruthy();
    // mixed valid+expired must use ONLY the valid (available) quantity
    expect(screen.getByText("دواء بمخزون مختلط")).toBeTruthy();

    // excluded: 5 or more available
    expect(screen.queryByText("دواء بخمس وحدات")).toBeNull();
    // excluded: 0 available (no batches at all)
    expect(screen.queryByText("دواء بدون كمية")).toBeNull();
    // excluded: fully expired -> 0 available, expired stock must not count
    expect(screen.queryByText("دواء منتهي بالكامل")).toBeNull();
  });

  it("the KPI's own count matches exactly the included set (not total medications, not expired units)", () => {
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({
        state: {
          ...baseState,
          medications: [
            med4Available,
            med1Available,
            med5Available,
            medZeroAvailable,
            medMixedValidExpired,
            medExpiredOnly,
          ],
        },
      }),
    );
    render(<PharmacyApp />);
    const kpiBtn = screen.getByRole("button", { name: /قاربت الكمية على الانتهاء/ });
    // 3 qualify: med4Available, med1Available, medMixedValidExpired
    expect(kpiBtn.getAttribute("aria-label")).toContain("3");
  });

  it("shows the existing empty state when nothing is low on available stock", () => {
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({ state: { ...baseState, medications: [med5Available] } }),
    );
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /قاربت الكمية على الانتهاء/ }));

    expect(screen.getByText("لا يوجد أدوية قاربت على النفاد")).toBeTruthy();
  });

  it("does not change the meaning of the other existing KPIs", () => {
    render(<PharmacyApp />);
    // medOk in the default fixture has exactly 5 available units (a
    // boundary case) — it must still show up under "نوع دواء مسجل" (no
    // filter) exactly as before, unaffected by the new KPI.
    fireEvent.click(screen.getByRole("button", { name: /نوع دواء/ }));
    expect(screen.getByText("دواء سليم المخزون")).toBeTruthy();
  });
});

describe("navigation — سجل الصرف اليومي (Daily Withdrawal Log) has been removed; other tabs are untouched", () => {
  it("the existing 'سجلّ الصرف' tab still opens (the grouped-by-medication overview)", async () => {
    mockFetchAllWithdrawalLogs.mockResolvedValueOnce([
      {
        id: "log-1",
        medId: "m-ok",
        medName: "دواء سليم المخزون",
        batchId: "b3",
        expiry: FAR_FUTURE_MONTH,
        qty: 4,
        date: "2026-08-10",
        createdAt: "2026-08-10T10:00:00.000Z",
        performedByEmail: "staff@clinic.test",
      },
    ]);
    render(<PharmacyApp />);

    fireEvent.click(screen.getByText("سجلّ الصرف"));

    expect(await screen.findByText("دواء سليم المخزون")).toBeTruthy();
    // count now shows as its own table cell ("1"), not a combined label string
    expect(
      screen
        .getByText("دواء سليم المخزون")
        .closest("tr")
        .textContent.includes("1"),
    ).toBe(true);
  });

  it("'سجل الصرف اليومي' no longer exists as a tab, and the remaining tabs are all still present", () => {
    render(<PharmacyApp />);

    expect(screen.queryByText("سجل الصرف اليومي")).toBeNull();

    expect(screen.getByText("اليوم")).toBeTruthy();
    expect(screen.getByText("الأدوية")).toBeTruthy();
    expect(screen.getByText("الإسعافات الأولية")).toBeTruthy();
    expect(screen.getByText("سجلّ الصرف")).toBeTruthy();
  });

  it("normal tab navigation (meds / first aid / log) still works with the daily-log tab gone", async () => {
    mockFetchAllWithdrawalLogs.mockResolvedValueOnce([]);
    render(<PharmacyApp />);

    fireEvent.click(screen.getByText("الإسعافات الأولية"));
    expect(screen.getByText("شاش ناقص")).toBeTruthy();

    fireEvent.click(screen.getByText("الأدوية"));
    expect(screen.getByText("كل الأدوية")).toBeTruthy();

    fireEvent.click(screen.getByText("سجلّ الصرف"));
    await screen.findByText("لا توجد عمليات صرف مسجلة");
  });
});

describe("navigation — Profile", () => {
  it("the profile icon button opens the Profile modal for the currently signed-in user, for both admin and staff", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByTitle("الملف الشخصي"));

    expect(screen.getByText("معلومات الحساب")).toBeTruthy();
    // the authenticated user's own email, never another user's — shown once
    // in the header (already there) and once in the new profile section
    expect(screen.getAllByText("admin@clinic.test").length).toBe(2);
    expect(screen.getByText("الأمان — تغيير كلمة المرور")).toBeTruthy();
    expect(screen.getByText("فريق التطوير")).toBeTruthy();
  });

  it("closing the Profile modal returns to the previous screen without touching session/tab state", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByTitle("الملف الشخصي"));
    expect(screen.getByText("معلومات الحساب")).toBeTruthy();

    // Modal's own close (X) button lives in the modal header, alongside the
    // modal's title span ("الملف الشخصي" — distinct from the header's own
    // profile-icon button, which carries that text as its `title` attribute
    // rather than visible text).
    const modalTitle = screen.getByText("الملف الشخصي", { selector: "span" });
    const closeBtn = modalTitle.parentElement.querySelector("button");
    fireEvent.click(closeBtn);

    expect(screen.queryByText("معلومات الحساب")).toBeNull();
    // still on the same dashboard, still signed in
    expect(screen.getByText("كل الأدوية")).toBeTruthy();
  });
});

describe("Medications tab — alphabetical (A -> Z) list ordering", () => {
  // English names, deliberately not fetched/declared in alphabetical order
  // below — the rendered order must come entirely from the app's own sort,
  // never from fetch/array order.
  const medZinc = {
    id: "m-zinc",
    name: "Zinc",
    categoryId: "cat1",
    batches: [{ id: "b-zinc", expiry: FAR_FUTURE_MONTH, qty: 5 }],
  };
  const medAmoxLower = {
    id: "m-amox",
    name: "amoxicillin", // lowercase, to prove case-insensitivity below
    categoryId: "cat1",
    batches: [{ id: "b-amox", expiry: FAR_FUTURE_MONTH, qty: 5 }],
  };
  const medMetformin = {
    id: "m-met",
    name: "Metformin",
    categoryId: "cat1",
    batches: [{ id: "b-met", expiry: FAR_FUTURE_MONTH, qty: 5 }],
  };

  it("renders medications A -> Z by name, case-insensitively, regardless of fetch order", () => {
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({
        state: { ...baseState, medications: [medZinc, medMetformin, medAmoxLower] },
      }),
    );
    render(<PharmacyApp />);

    const text = document.body.textContent;
    // lowercase "amoxicillin" still sorts before "Metformin" before "Zinc"
    expect(text.indexOf("amoxicillin")).toBeLessThan(text.indexOf("Metformin"));
    expect(text.indexOf("Metformin")).toBeLessThan(text.indexOf("Zinc"));
  });

  it("alphabetical ordering is preserved after searching", () => {
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({
        state: { ...baseState, medications: [medZinc, medMetformin, medAmoxLower] },
      }),
    );
    render(<PharmacyApp />);

    // "m" matches "aMoxicillin" and "Metformin" (case-insensitive substring
    // search), excluding "Zinc" — exercises search + sort together.
    fireEvent.change(screen.getByPlaceholderText("ابحث عن دواء…"), {
      target: { value: "m" },
    });

    expect(screen.getByText("amoxicillin")).toBeTruthy();
    expect(screen.getByText("Metformin")).toBeTruthy();
    expect(screen.queryByText("Zinc")).toBeNull();
    const text = document.body.textContent;
    expect(text.indexOf("amoxicillin")).toBeLessThan(text.indexOf("Metformin"));
  });

  it("alphabetical ordering is preserved under the 'قاربت الكمية على الانتهاء' (low-stock) KPI filter", () => {
    const medZincLow = {
      ...medZinc,
      batches: [{ id: "b-zinc", expiry: FAR_FUTURE_MONTH, qty: 2 }], // < 5, included
    };
    const medMetLow = {
      ...medMetformin,
      batches: [{ id: "b-met", expiry: FAR_FUTURE_MONTH, qty: 3 }], // < 5, included
    };
    const medAmoxPlenty = {
      ...medAmoxLower,
      batches: [{ id: "b-amox", expiry: FAR_FUTURE_MONTH, qty: 50 }], // excluded
    };
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({
        state: { ...baseState, medications: [medZincLow, medMetLow, medAmoxPlenty] },
      }),
    );
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /قاربت الكمية على الانتهاء/ }));

    expect(screen.getByText("Metformin")).toBeTruthy();
    expect(screen.getByText("Zinc")).toBeTruthy();
    // filtered out — plenty of stock
    expect(screen.queryByText("amoxicillin")).toBeNull();
    const text = document.body.textContent;
    expect(text.indexOf("Metformin")).toBeLessThan(text.indexOf("Zinc"));
  });

  it("alphabetical ordering is preserved under category filtering", () => {
    const catA = { id: "cat-a", name: "فئة أ" };
    const catB = { id: "cat-b", name: "فئة ب" };
    const medInA1 = { ...medZinc, categoryId: "cat-a" };
    const medInA2 = { ...medAmoxLower, categoryId: "cat-a" };
    const medInB = { ...medMetformin, categoryId: "cat-b" };
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({
        state: {
          ...baseState,
          categories: [catA, catB],
          medications: [medInA1, medInB, medInA2],
        },
      }),
    );
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /^فئة أ/ }));

    expect(screen.getByText("amoxicillin")).toBeTruthy();
    expect(screen.getByText("Zinc")).toBeTruthy();
    expect(screen.queryByText("Metformin")).toBeNull(); // different category
    const text = document.body.textContent;
    expect(text.indexOf("amoxicillin")).toBeLessThan(text.indexOf("Zinc"));
  });

  it("alphabetical ordering is preserved under the expired-stock KPI filter, and is not urgency-based", () => {
    const medZincExpired = {
      ...medZinc,
      batches: [{ id: "b-zinc", expiry: LAST_MONTH, qty: 5 }], // expired
    };
    const medAmoxExpired = {
      ...medAmoxLower,
      batches: [{ id: "b-amox", expiry: LAST_MONTH, qty: 5 }], // expired, more urgent by no measure than the other — same bucket
    };
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({
        state: { ...baseState, medications: [medZincExpired, medAmoxExpired] },
      }),
    );
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /منتهية الصلاحية/ }));

    expect(screen.getByText("amoxicillin")).toBeTruthy();
    expect(screen.getByText("Zinc")).toBeTruthy();
    const text = document.body.textContent;
    // alphabetical, not e.g. reverse-fetch-order or any urgency tie-break
    expect(text.indexOf("amoxicillin")).toBeLessThan(text.indexOf("Zinc"));
  });

  it("does not reorder batches within a medication's own card (still earliest-expiry-first)", () => {
    const laterMonth = monthISO(6);
    const earlierMonth = FAR_FUTURE_MONTH; // monthISO(4) — earlier than monthISO(6)
    const labelFor = (iso) => {
      const [year, month] = iso.split("-");
      return `${month}/${year}`;
    };
    const medMultiBatch = {
      id: "m-multi",
      name: "Multivitamin",
      categoryId: "cat1",
      // declared LATEST-expiry batch first, to prove the card doesn't just
      // echo array order either — MedCard sorts its own batches by expiry.
      batches: [
        { id: "b-late", expiry: laterMonth, qty: 5 },
        { id: "b-early", expiry: earlierMonth, qty: 3 },
      ],
    };
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({ state: { ...baseState, medications: [medMultiBatch] } }),
    );
    render(<PharmacyApp />);

    const text = document.body.textContent;
    expect(text.indexOf(labelFor(earlierMonth))).toBeLessThan(text.indexOf(labelFor(laterMonth)));
  });

  it("First Aid items are unaffected — still shown in their existing (non-alphabetical) order", () => {
    const firstAidZ = { id: "f-z", name: "Zzz Item", qty: 1, threshold: 5 };
    const firstAidA = { id: "f-a", name: "Aaa Item", qty: 1, threshold: 5 };
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({
        state: { ...baseState, firstAid: [firstAidZ, firstAidA] },
      }),
    );
    render(<PharmacyApp />);
    fireEvent.click(screen.getByText("الإسعافات الأولية"));

    expect(screen.getByText("Zzz Item")).toBeTruthy();
    expect(screen.getByText("Aaa Item")).toBeTruthy();
    // fetch order preserved — "Zzz Item" (declared/fetched first) still
    // renders before "Aaa Item"; First Aid was never touched by this change
    const text = document.body.textContent;
    expect(text.indexOf("Zzz Item")).toBeLessThan(text.indexOf("Aaa Item"));
  });
});

describe("Data Sharing / Excel export", () => {
  beforeEach(() => mockDownloadCsvFile.mockClear());

  it("clicking 'مشاركة البيانات' opens the export column-selection modal, with Medication Name locked on", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /مشاركة البيانات/ }));

    expect(screen.getByText("تصدير مخزون الأدوية")).toBeTruthy();
    const nameCheckbox = screen.getByRole("checkbox", { name: /اسم الدواء/ });
    expect(nameCheckbox.checked).toBe(true);
    expect(nameCheckbox.disabled).toBe(true);
  });

  it("exports the COMPLETE medication inventory even while a KPI filter (e.g. 'منتهية الصلاحية') is active", () => {
    render(<PharmacyApp />);
    // filter down to the expired-only medication first — on-screen view is
    // now just medExpired, but the export must still cover all three.
    fireEvent.click(screen.getByRole("button", { name: /منتهية الصلاحية/ }));
    expect(screen.queryByText("دواء سليم المخزون")).toBeNull(); // on-screen filter is in effect

    fireEvent.click(screen.getByRole("button", { name: /مشاركة البيانات/ }));
    fireEvent.click(screen.getByRole("button", { name: /^تصدير/ }));

    expect(mockDownloadCsvFile).toHaveBeenCalledTimes(1);
    const [, csv] = mockDownloadCsvFile.mock.calls[0];
    expect(csv).toContain("دواء منتهي الصلاحية");
    expect(csv).toContain("دواء قريب الانتهاء");
    expect(csv).toContain("دواء سليم المخزون");
    // on-screen filtered view is unchanged by the export itself
    expect(screen.queryByText("دواء سليم المخزون")).toBeNull();
  });

  it("exports the COMPLETE inventory even while a search query is active", () => {
    render(<PharmacyApp />);
    fireEvent.change(screen.getByPlaceholderText("ابحث عن دواء…"), {
      target: { value: "قريب" },
    });
    expect(screen.queryByText("دواء منتهي الصلاحية")).toBeNull(); // on-screen filter is in effect

    fireEvent.click(screen.getByRole("button", { name: /مشاركة البيانات/ }));
    fireEvent.click(screen.getByRole("button", { name: /^تصدير/ }));

    const [, csv] = mockDownloadCsvFile.mock.calls[0];
    expect(csv).toContain("دواء منتهي الصلاحية");
    expect(csv).toContain("دواء قريب الانتهاء");
    expect(csv).toContain("دواء سليم المخزون");
  });

  it("exports the COMPLETE inventory even while a category filter is active, and preserves A -> Z export order", () => {
    const catA = { id: "cat-a", name: "فئة أ" };
    const catB = { id: "cat-b", name: "فئة ب" };
    const medZ = { id: "m-z", name: "Zinc", categoryId: "cat-a", batches: [] };
    const medA = { id: "m-a", name: "Amoxicillin", categoryId: "cat-b", batches: [] };
    mockUsePharmacyData.mockReturnValue(
      pharmacyDataMock({
        state: { ...baseState, categories: [catA, catB], medications: [medZ, medA] },
      }),
    );
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /^فئة أ/ }));
    expect(screen.queryByText("Amoxicillin")).toBeNull(); // on-screen filter is in effect

    fireEvent.click(screen.getByRole("button", { name: /مشاركة البيانات/ }));
    fireEvent.click(screen.getByRole("button", { name: /^تصدير/ }));

    const [, csv] = mockDownloadCsvFile.mock.calls[0];
    const nameLines = csv.split("\r\n").slice(1); // drop header row
    expect(nameLines).toEqual(["Amoxicillin", "Zinc"]); // both meds, A -> Z, despite the category filter
  });

  it("column-selection behavior is unchanged: only the checked optional columns appear, in the fixed order", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /مشاركة البيانات/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /حالة المخزون/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /الفئة/ }));
    fireEvent.click(screen.getByRole("button", { name: /^تصدير/ }));

    const [, csv] = mockDownloadCsvFile.mock.calls[0];
    expect(csv.split("\r\n")[0]).toBe("اسم الدواء,الفئة,حالة المخزون");
  });

  it("after a successful export, the modal closes and the existing success-feedback pattern is shown", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /مشاركة البيانات/ }));
    fireEvent.click(screen.getByRole("button", { name: /^تصدير/ }));

    expect(screen.queryByText("تصدير مخزون الأدوية")).toBeNull(); // modal closed
    expect(screen.getByText("تم تنزيل ملف تصدير المخزون بنجاح.")).toBeTruthy();
  });

  it("Cancel closes the modal without exporting, and does not navigate away from the current tab", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /مشاركة البيانات/ }));
    fireEvent.click(screen.getByRole("button", { name: /إلغاء/ }));

    expect(screen.queryByText("تصدير مخزون الأدوية")).toBeNull();
    expect(mockDownloadCsvFile).not.toHaveBeenCalled();
    // still on the Medications tab
    expect(screen.getByText("كل الأدوية")).toBeTruthy();
  });

  it("export is purely client-side: no pharmacy-data mutation function is called during export", () => {
    const dataMock = pharmacyDataMock();
    mockUsePharmacyData.mockReturnValue(dataMock);
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /مشاركة البيانات/ }));
    fireEvent.click(screen.getByRole("button", { name: /^تصدير/ }));

    // none of the CRUD/mutation functions the app has access to were touched
    for (const fn of [
      dataMock.addMedication,
      dataMock.editMedication,
      dataMock.deleteMedication,
      dataMock.addBatch,
      dataMock.deleteBatch,
      dataMock.adjustBatchQty,
      dataMock.withdrawStock,
      dataMock.refetch,
    ]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("existing Medications tab/dashboard behavior (KPIs, search, filters) is unaffected by the export feature", () => {
    render(<PharmacyApp />);
    expect(screen.getByText("دواء منتهي الصلاحية")).toBeTruthy();
    expect(screen.getByText("دواء قريب الانتهاء")).toBeTruthy();
    expect(screen.getByText("دواء سليم المخزون")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /أقل من شهر/ }));
    expect(screen.getByText("دواء قريب الانتهاء")).toBeTruthy();
    expect(screen.queryByText("دواء منتهي الصلاحية")).toBeNull();
  });
});

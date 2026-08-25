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
// DailyLogView (سجل الصرف اليومي) and LogSection (سجلّ الصرف, grouped) both
// self-fetch from pharmacyApi directly, the same way MedHistory already
// does — mock just those two functions so mounting either tab in these
// tests never hits a real network call.
const mockFetchWithdrawalLogForDate = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
const mockFetchAllWithdrawalLogs = vi.hoisted(() => vi.fn(() => new Promise(() => {})));

vi.mock("./hooks/useAuth", () => ({ useAuth: mockUseAuth }));
vi.mock("./hooks/usePharmacyData", () => ({ usePharmacyData: mockUsePharmacyData }));
vi.mock("./lib/pharmacyApi", () => ({
  fetchWithdrawalLogForDate: mockFetchWithdrawalLogForDate,
  fetchAllWithdrawalLogs: mockFetchAllWithdrawalLogs,
}));

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

  it("'أقل من شهر' opens Medications filtered to approaching-expiry stock, excluding already-expired medications", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /أقل من شهر/ }));

    expect(screen.getByText("دواء قريب الانتهاء")).toBeTruthy();
    expect(screen.queryByText("دواء منتهي الصلاحية")).toBeNull();
    expect(screen.queryByText("دواء سليم المخزون")).toBeNull();
  });

  it("'إسعافات ناقصة' opens First Aid filtered to items at/below their threshold", () => {
    render(<PharmacyApp />);
    fireEvent.click(screen.getByRole("button", { name: /إسعافات ناقصة/ }));

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
    fireEvent.click(screen.getByRole("button", { name: /إسعافات ناقصة/ }));

    expect(screen.getByText("لا يوجد مواد إسعاف ناقصة")).toBeTruthy();
  });
});

describe("navigation — سجل الصرف اليومي is a new tab, existing tabs are untouched", () => {
  it("the existing 'سجلّ الصرف' tab still opens (now showing the grouped-by-medication overview)", async () => {
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

  it("a new 'سجل الصرف اليومي' tab exists alongside الأدوية/الإسعافات الأولية/سجلّ الصرف and opens the daily view", () => {
    render(<PharmacyApp />);

    expect(screen.getByText("الأدوية")).toBeTruthy();
    expect(screen.getByText("الإسعافات الأولية")).toBeTruthy();
    expect(screen.getByText("سجلّ الصرف")).toBeTruthy();

    fireEvent.click(screen.getByText("سجل الصرف اليومي"));

    // DailyLogView's own fetch never resolves in this test (see the mocked
    // fetchWithdrawalLogForDate above) — asserting its loading state is
    // proof the correct component actually mounted, not LogSection/MedCard.
    expect(screen.getByText("جارٍ التحميل…")).toBeTruthy();
    expect(mockFetchWithdrawalLogForDate).toHaveBeenCalled();
  });
});

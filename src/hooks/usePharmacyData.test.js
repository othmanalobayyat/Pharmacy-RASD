// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Vitest hoists vi.mock() above imports — anything the factories close over
// must be created inside vi.hoisted().
const mockApi = vi.hoisted(() => ({
  fetchClinicData: vi.fn(),
  fetchWithdrawalLogPage: vi.fn(),
  subscribeToClinicData: vi.fn(() => () => {}),
  createCategory: vi.fn(),
  withdrawStock: vi.fn(),
  saveUiLabels: vi.fn(),
}));

vi.mock("../lib/pharmacyApi", () => mockApi);
vi.mock("../lib/supabase", () => ({ isSupabaseConfigured: true }));

const { usePharmacyData } = await import("./usePharmacyData");

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.subscribeToClinicData.mockReturnValue(() => {});
});

const emptyDataset = { categories: [], medications: [], firstAid: [], log: [], uiLabels: {} };

describe("usePharmacyData — loading/success/empty/error must all be distinguishable", () => {
  it("starts in a loading state with no data and no error", () => {
    mockApi.fetchClinicData.mockReturnValue(new Promise(() => {})); // never resolves during this test
    const { result } = renderHook(() => usePharmacyData("clinic-1"));

    expect(result.current.loading).toBe(true);
    expect(result.current.loadError).toBe("");
    expect(result.current.state).toBeNull();
  });

  it("a successful load with zero medications is a legitimate empty state, not an error", async () => {
    mockApi.fetchClinicData.mockResolvedValue(emptyDataset);
    const { result } = renderHook(() => usePharmacyData("clinic-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadError).toBe("");
    expect(result.current.state).toEqual(emptyDataset);
  });

  it("a failed initial load does NOT fall back to an empty-looking dataset", async () => {
    mockApi.fetchClinicData.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => usePharmacyData("clinic-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    // The critical assertion for this improvement: state must stay null
    // (distinctly "we don't know"), never silently become emptyState()
    // (which would be indistinguishable from a real empty pharmacy).
    expect(result.current.state).toBeNull();
    expect(result.current.loadError).toBe("network error");
  });

  it("falls back to a generic Arabic message when the failure has no error message", async () => {
    mockApi.fetchClinicData.mockRejectedValue(new Error());
    const { result } = renderHook(() => usePharmacyData("clinic-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.loadError).toBe("تعذر تحميل بيانات الصيدلية");
    expect(result.current.state).toBeNull();
  });

  it("retryLoad() can recover from a previous failure", async () => {
    mockApi.fetchClinicData
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({ ...emptyDataset, categories: [{ id: "c1", name: "مسكنات" }] });

    const { result } = renderHook(() => usePharmacyData("clinic-1"));
    await waitFor(() => expect(result.current.loadError).toBe("network error"));

    await act(async () => {
      await result.current.retryLoad();
    });

    expect(result.current.loadError).toBe("");
    expect(result.current.state.categories).toHaveLength(1);
  });
});

describe("usePharmacyData — withdrawal-log pagination (Improvement #7)", () => {
  const logRow = (i) => ({ id: `log-${i}`, medId: "med-1", qty: 1, date: "2026-08-01" });

  it("exposes logHasMore from the initial page load", async () => {
    mockApi.fetchClinicData.mockResolvedValue({
      ...emptyDataset,
      log: [logRow(1)],
      logHasMore: true,
    });
    const { result } = renderHook(() => usePharmacyData("clinic-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.logHasMore).toBe(true);
    expect(result.current.state.log).toEqual([logRow(1)]);
  });

  it("loadMoreLog() appends older rows to the existing list rather than replacing it", async () => {
    mockApi.fetchClinicData.mockResolvedValue({
      ...emptyDataset,
      log: [logRow(1), logRow(2)],
      logHasMore: true,
    });
    mockApi.fetchWithdrawalLogPage.mockResolvedValue({
      logs: [logRow(3), logRow(4)],
      hasMore: false,
    });

    const { result } = renderHook(() => usePharmacyData("clinic-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.loadMoreLog();
    });

    // fetched starting exactly where the already-loaded list left off
    expect(mockApi.fetchWithdrawalLogPage).toHaveBeenCalledWith(2);
    // existing rows are still first (newest-first order preserved), new
    // (older) rows appended after them
    expect(result.current.state.log).toEqual([
      logRow(1),
      logRow(2),
      logRow(3),
      logRow(4),
    ]);
    expect(result.current.logHasMore).toBe(false);
  });

  it("a failed loadMoreLog() surfaces a safe error without discarding already-loaded rows", async () => {
    mockApi.fetchClinicData.mockResolvedValue({
      ...emptyDataset,
      log: [logRow(1)],
      logHasMore: true,
    });
    mockApi.fetchWithdrawalLogPage.mockRejectedValue(
      new Error("⚠️ تعذر الاتصال بالنظام. تحقق من اتصال الإنترنت وحاول مرة أخرى."),
    );

    const { result } = renderHook(() => usePharmacyData("clinic-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.loadMoreLog();
    });

    expect(result.current.logMoreError).toBe(
      "⚠️ تعذر الاتصال بالنظام. تحقق من اتصال الإنترنت وحاول مرة أخرى.",
    );
    expect(result.current.state.log).toEqual([logRow(1)]);
  });

  it("loadMoreLog() is a no-op once there are no more records", async () => {
    mockApi.fetchClinicData.mockResolvedValue({
      ...emptyDataset,
      log: [logRow(1)],
      logHasMore: false,
    });
    const { result } = renderHook(() => usePharmacyData("clinic-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.loadMoreLog();
    });

    expect(mockApi.fetchWithdrawalLogPage).not.toHaveBeenCalled();
  });
});

// Real timers (not fake ones) so this exercises the actual 300ms debounce,
// consistent with the rest of this file's async style.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEBOUNCE_SETTLE_MS = 400; // > REALTIME_REFETCH_DEBOUNCE_MS (300)

describe("usePharmacyData — double-refetch fix: a local mutation's own realtime echo must not cause a second refetch", () => {
  it("addCategory (1 table) causes exactly one refetch even after its own realtime echo arrives", async () => {
    mockApi.fetchClinicData.mockResolvedValue(emptyDataset);
    mockApi.createCategory.mockResolvedValue({ id: "c1", name: "مسكنات" });

    const { result } = renderHook(() => usePharmacyData("clinic-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(1); // initial load

    await act(async () => {
      await result.current.addCategory("مسكنات");
    });
    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(2); // the mutation's own refetch

    const handlers = mockApi.subscribeToClinicData.mock.calls[0][1];
    act(() => handlers.onCategoriesChange()); // the expected realtime echo of this write
    await act(() => wait(DEBOUNCE_SETTLE_MS));

    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(2); // NOT 3 — echo was suppressed
  });

  it("withdrawStock (2 tables) suppresses exactly its two expected echoes, no more", async () => {
    mockApi.fetchClinicData.mockResolvedValue(emptyDataset);
    mockApi.withdrawStock.mockResolvedValue({ id: "log-1", medId: "m1", qty: 1, date: "2026-08-20" });

    const { result } = renderHook(() => usePharmacyData("clinic-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.withdrawStock("m1", null, 1, "2026-08-20");
    });
    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(2);

    const handlers = mockApi.subscribeToClinicData.mock.calls[0][1];
    // withdraw_stock() writes to BOTH batches and withdrawal_logs — both
    // echoes must be swallowed by this ONE mutation.
    act(() => {
      handlers.onBatchesChange();
      handlers.onLogChange();
    });
    await act(() => wait(DEBOUNCE_SETTLE_MS));
    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(2);

    // A third, genuinely unrelated realtime event (e.g. another device
    // editing a category) is NOT covered by those two credits and must
    // still refresh normally.
    act(() => handlers.onCategoriesChange());
    await act(() => wait(DEBOUNCE_SETTLE_MS));
    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(3);
  });

  it("a change from another device (no local mutation in flight) still triggers a normal debounced refetch", async () => {
    mockApi.fetchClinicData.mockResolvedValue(emptyDataset);
    const { result } = renderHook(() => usePharmacyData("clinic-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(1);

    const handlers = mockApi.subscribeToClinicData.mock.calls[0][1];
    act(() => handlers.onMedicationsChange());
    await act(() => wait(DEBOUNCE_SETTLE_MS));

    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(2);
  });

  it("saveUiLabels (a table with no realtime publication) arms no suppression at all", async () => {
    mockApi.fetchClinicData.mockResolvedValue(emptyDataset);
    mockApi.saveUiLabels.mockResolvedValue(undefined);

    const { result } = renderHook(() => usePharmacyData("clinic-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveUiLabels({ appTitle: "x" });
    });
    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(2); // its own refetch

    // Nothing should have been armed, so an unrelated real event right
    // after must refresh normally, not get silently swallowed.
    const handlers = mockApi.subscribeToClinicData.mock.calls[0][1];
    act(() => handlers.onCategoriesChange());
    await act(() => wait(DEBOUNCE_SETTLE_MS));
    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(3);
  });

  it("a failed mutation releases its suppression credit instead of leaking it", async () => {
    mockApi.fetchClinicData.mockResolvedValue(emptyDataset);
    mockApi.createCategory.mockRejectedValue(new Error("⚠️ هذه الفئة موجودة بالفعل."));

    const { result } = renderHook(() => usePharmacyData("clinic-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addCategory("مسكنات").catch(() => {});
    });
    // the write never committed, so no own-refetch happened either
    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(1);

    const handlers = mockApi.subscribeToClinicData.mock.calls[0][1];
    act(() => handlers.onCategoriesChange());
    await act(() => wait(DEBOUNCE_SETTLE_MS));

    // the credit was released on failure, so this real event is NOT
    // suppressed and refreshes normally
    expect(mockApi.fetchClinicData).toHaveBeenCalledTimes(2);
  });

  it("does not create a duplicate realtime subscription across the mutations above", async () => {
    mockApi.fetchClinicData.mockResolvedValue(emptyDataset);
    mockApi.createCategory.mockResolvedValue({ id: "c1", name: "مسكنات" });

    const { result } = renderHook(() => usePharmacyData("clinic-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addCategory("مسكنات");
    });

    expect(mockApi.subscribeToClinicData).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

// Vitest hoists vi.mock() above imports — anything the factories close over
// must be created inside vi.hoisted().
const mockApi = vi.hoisted(() => ({
  fetchClinicData: vi.fn(),
  subscribeToClinicData: vi.fn(() => () => {}),
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

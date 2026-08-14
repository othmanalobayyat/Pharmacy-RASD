import { describe, it, expect, beforeEach, vi } from "vitest";

// Vitest hoists vi.mock() above imports, so anything the factory closes over
// must itself be created inside vi.hoisted().
const { mockSupabase, chain, setChainResult, setRpcResult } = vi.hoisted(() => {
  const chainObj = { data: null, error: null };
  for (const method of ["insert", "update", "delete", "select", "eq", "order", "single", "maybeSingle", "upsert"]) {
    chainObj[method] = vi.fn(() => chainObj);
  }
  const supabase = {
    from: vi.fn(() => chainObj),
    rpc: vi.fn(),
  };
  return {
    mockSupabase: supabase,
    chain: chainObj,
    setChainResult: (data, error = null) => {
      chainObj.data = data;
      chainObj.error = error;
    },
    setRpcResult: (data, error = null) => {
      supabase.rpc.mockResolvedValue({ data, error });
    },
  };
});

vi.mock("./supabase", () => ({
  supabase: mockSupabase,
  isSupabaseConfigured: true,
}));

const api = await import("./pharmacyApi");

beforeEach(() => {
  vi.clearAllMocks();
  chain.data = null;
  chain.error = null;
});

describe("createCategory()", () => {
  it("inserts with the given clinic id and name, and maps the returned row", async () => {
    setChainResult({ id: "uuid-1", name: "مسكنات" });

    const result = await api.createCategory("clinic-1", "مسكنات");

    expect(mockSupabase.from).toHaveBeenCalledWith("categories");
    expect(chain.insert).toHaveBeenCalledWith({
      clinic_id: "clinic-1",
      name: "مسكنات",
    });
    expect(result).toEqual({ id: "uuid-1", name: "مسكنات" });
  });
});

describe("withdrawStock() — atomic FEFO RPC", () => {
  it("calls withdraw_stock with batchId=null for an auto-FEFO (quick) withdrawal", async () => {
    setRpcResult({
      id: "log-1",
      medication_id: "med-1",
      med_name: "بنادول",
      batch_id: "batch-1",
      expiry: "2026-01-01",
      qty: 1,
      withdrawn_on: "2026-08-14",
      performed_by_email: "staff@clinic.test",
    });

    const log = await api.withdrawStock({
      medicationId: "med-1",
      qty: 1,
      withdrawnOn: "2026-08-14",
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith("withdraw_stock", {
      p_medication_id: "med-1",
      p_qty: 1,
      p_withdrawn_on: "2026-08-14",
      p_batch_id: null,
    });
    expect(log).toEqual({
      id: "log-1",
      medId: "med-1",
      medName: "بنادول",
      batchId: "batch-1",
      expiry: "2026-01-01",
      qty: 1,
      date: "2026-08-14",
      performedByEmail: "staff@clinic.test",
    });
  });

  it("passes an explicit batchId through for the custom-withdraw form", async () => {
    setRpcResult({
      id: "log-2",
      medication_id: "med-1",
      med_name: "بنادول",
      batch_id: "batch-9",
      expiry: "2026-03-01",
      qty: 4,
      withdrawn_on: "2026-08-14",
      performed_by_email: "staff@clinic.test",
    });

    await api.withdrawStock({
      medicationId: "med-1",
      qty: 4,
      withdrawnOn: "2026-08-14",
      batchId: "batch-9",
    });

    expect(mockSupabase.rpc).toHaveBeenCalledWith("withdraw_stock", {
      p_medication_id: "med-1",
      p_qty: 4,
      p_withdrawn_on: "2026-08-14",
      p_batch_id: "batch-9",
    });
  });

  it("throws a normal Error (not a silent failure) when the database rejects insufficient stock", async () => {
    setRpcResult(null, { message: "insufficient stock: available 2 but requested 5" });

    await expect(
      api.withdrawStock({ medicationId: "med-1", qty: 5, withdrawnOn: "2026-08-14" }),
    ).rejects.toThrow(/insufficient stock/);
  });
});

describe("adjustFirstAid() — atomic +/-1 RPC", () => {
  it("sends the delta and maps the resulting row", async () => {
    setRpcResult({ id: "fa-1", name: "شاش معقم", qty: 4, threshold: 5 });

    const item = await api.adjustFirstAid("fa-1", -1);

    expect(mockSupabase.rpc).toHaveBeenCalledWith("adjust_first_aid", {
      p_id: "fa-1",
      p_delta: -1,
    });
    expect(item).toEqual({ id: "fa-1", name: "شاش معقم", qty: 4, threshold: 5 });
  });
});

describe("deleteCategory() / deleteMedication() / deleteBatch()", () => {
  it("propagates a database error instead of swallowing it", async () => {
    setChainResult(null, { message: "permission denied for table categories" });
    await expect(api.deleteCategory("cat-1")).rejects.toThrow(/permission denied/);
  });
});

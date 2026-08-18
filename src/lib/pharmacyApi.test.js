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

  it("throws a normal Error (not a silent failure) when the database rejects insufficient stock, mapped to a safe Arabic message", async () => {
    setRpcResult(null, { message: "insufficient stock: available 2 but requested 5" });

    const err = await api
      .withdrawStock({ medicationId: "med-1", qty: 5, withdrawnOn: "2026-08-14" })
      .catch((e) => e);
    expect(err.message).toBe("⚠️ الكمية المطلوبة غير متوفرة في المخزون.");
    expect(err.message).not.toMatch(/insufficient stock|available|requested/i);
  });

  it("fails safely (no silent success) when every batch is expired", async () => {
    // withdraw_stock() (0007_block_expired_stock.sql) raises this exact
    // message when the auto-FEFO query finds no non-expired batch with stock.
    setRpcResult(null, { message: "لا يوجد مخزون صالح (غير منتهي الصلاحية) لهذا الدواء" });

    await expect(
      api.withdrawStock({ medicationId: "med-1", qty: 1, withdrawnOn: "2026-08-14" }),
    ).rejects.toThrow(/لا يوجد مخزون صالح/);
  });

  it("fails safely when an explicitly chosen batch is expired", async () => {
    setRpcResult(null, { message: "لا يمكن صرف دفعة منتهية الصلاحية" });

    await expect(
      api.withdrawStock({
        medicationId: "med-1",
        qty: 1,
        withdrawnOn: "2026-08-14",
        batchId: "expired-batch",
      }),
    ).rejects.toThrow(/منتهية الصلاحية/);
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

describe("duplicate-name prevention", () => {
  // Postgres SQLSTATE 23505 = unique_violation, raised by the
  // (clinic_id, lower(btrim(name))) unique indexes added in
  // 0008_prevent_duplicate_names.sql. These tests verify the client maps
  // that specific error into a clear, duplicate-specific Arabic message
  // instead of surfacing the raw "duplicate key value violates unique
  // constraint ..." Postgres text.
  const DUPLICATE_ERROR = {
    message: 'duplicate key value violates unique constraint "medications_clinic_norm_name_idx"',
    code: "23505",
  };

  it("createMedication() rejects a duplicate with a clear Arabic message, not the raw Postgres error", async () => {
    setChainResult(null, DUPLICATE_ERROR);
    const err = await api.createMedication("clinic-1", { name: "Paracetamol", categoryId: null }).catch((e) => e);
    expect(err.message).toBe("⚠️ هذا الدواء موجود بالفعل.");
    expect(err.message).not.toMatch(/duplicate key|constraint|postgres/i);
  });

  it("updateMedication() also rejects a rename that collides with an existing name", async () => {
    setChainResult(null, DUPLICATE_ERROR);
    await expect(
      api.updateMedication("med-1", { name: "Existing Medication", categoryId: null }),
    ).rejects.toThrow("⚠️ هذا الدواء موجود بالفعل.");
  });

  it("createCategory() maps the same error code to a category-specific message", async () => {
    setChainResult(null, { ...DUPLICATE_ERROR, message: "duplicate key value violates unique constraint \"categories_clinic_norm_name_idx\"" });
    await expect(api.createCategory("clinic-1", "مسكنات")).rejects.toThrow(
      "⚠️ هذه الفئة موجودة بالفعل.",
    );
  });

  it("updateCategory() rejects a rename that collides with an existing category (0009_categories_unique_name.sql)", async () => {
    setChainResult(null, DUPLICATE_ERROR);
    await expect(api.updateCategory("cat-1", "مسكنات")).rejects.toThrow(
      "⚠️ هذه الفئة موجودة بالفعل.",
    );
  });

  it("createFirstAid() maps the same error code to a first-aid-specific message", async () => {
    setChainResult(null, DUPLICATE_ERROR);
    await expect(
      api.createFirstAid("clinic-1", { name: "شاش", qty: 1, threshold: 1 }),
    ).rejects.toThrow("⚠️ مادة الإسعاف هذه موجودة بالفعل.");
  });

  it("a non-duplicate error is NOT rewritten into the duplicate message — it gets its own correct mapping instead", async () => {
    setChainResult(null, { message: "permission denied for table medications", code: "42501" });
    const err = await api.createMedication("clinic-1", { name: "X", categoryId: null }).catch((e) => e);
    expect(err.message).toBe("⚠️ ليس لديك صلاحية لتنفيذ هذا الإجراء.");
    expect(err.message).not.toContain("هذا الدواء موجود بالفعل");
    expect(err.message).not.toMatch(/permission denied|table|postgres/i);
  });
});

describe("deleteCategory() / deleteMedication() / deleteBatch() — errors are mapped, never swallowed", () => {
  it("an RLS/permission failure maps to the safe permission message", async () => {
    setChainResult(null, { message: "new row violates row-level security policy for table \"categories\"", code: "42501" });
    await expect(api.deleteCategory("cat-1")).rejects.toThrow(
      "⚠️ ليس لديك صلاحية لتنفيذ هذا الإجراء.",
    );
  });

  it("an unrecognized technical error still reaches the caller as a safe generic message, never silently", async () => {
    setChainResult(null, { message: "could not connect to server: Connection refused" });
    const err = await api.deleteMedication("med-1").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe(
      "⚠️ حدث خطأ غير متوقع. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع الدعم الفني.",
    );
  });

  it("a real network failure (rejected promise, not a resolved {error}) is also mapped, not left as a raw TypeError", async () => {
    // deleteMedication's last chained call is .eq(...) — override it for
    // just this one call (mockImplementationOnce) so no other test's shared
    // `chain` mock is affected.
    chain.eq.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(api.deleteMedication("med-1")).rejects.toThrow(
      "⚠️ تعذر الاتصال بالنظام. تحقق من اتصال الإنترنت وحاول مرة أخرى.",
    );
  });
});

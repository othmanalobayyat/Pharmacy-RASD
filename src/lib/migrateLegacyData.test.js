import { describe, it, expect, beforeEach, vi } from "vitest";

// migrateLegacyData.js reads/writes window.localStorage directly (it's a
// browser-only concern by design — see its own file header). The test
// environment here is plain Node (no jsdom dependency needed for the rest of
// the suite), so a minimal in-memory localStorage is polyfilled just for
// this file rather than pulling in a DOM environment for the whole project.
const store = new Map();
const localStorageMock = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.window = { localStorage: localStorageMock };

const mockApi = vi.hoisted(() => ({
  createCategory: vi.fn(),
  createMedication: vi.fn(),
  createBatch: vi.fn(),
  createFirstAid: vi.fn(),
  importLegacyWithdrawalLog: vi.fn(),
  saveUiLabels: vi.fn(),
  hasAnyClinicData: vi.fn(),
}));

vi.mock("./pharmacyApi", () => mockApi);

const {
  LEGACY_STORAGE_KEY,
  hasMigrationRun,
  hasLegacyData,
  migrateLegacyDataToSupabase,
} = await import("./migrateLegacyData");

const CLINIC_ID = "clinic-1";

function seedLegacy(data) {
  store.set(LEGACY_STORAGE_KEY, JSON.stringify(data));
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  mockApi.hasAnyClinicData.mockResolvedValue(false);
  mockApi.createCategory.mockImplementation(async (_clinicId, name) => ({
    id: `new-cat-${name}`,
    name,
  }));
  mockApi.createMedication.mockImplementation(async (_clinicId, { name }) => ({
    id: `new-med-${name}`,
    name,
    batches: [],
  }));
  mockApi.createBatch.mockImplementation(async (_clinicId, medicationId, b) => ({
    id: `new-batch-${medicationId}-${b.expiry}`,
    ...b,
  }));
  mockApi.createFirstAid.mockResolvedValue({});
  mockApi.importLegacyWithdrawalLog.mockResolvedValue({});
  mockApi.saveUiLabels.mockResolvedValue();
});

describe("hasLegacyData() / hasMigrationRun()", () => {
  it("is false when nothing is stored", () => {
    expect(hasLegacyData()).toBe(false);
    expect(hasMigrationRun()).toBe(false);
  });

  it("is true once a non-empty legacy blob exists", () => {
    seedLegacy({ categories: [{ id: "c1", name: "x" }], medications: [], firstAid: [], log: [] });
    expect(hasLegacyData()).toBe(true);
  });
});

describe("migrateLegacyDataToSupabase()", () => {
  it("remaps legacy string ids to the freshly created UUIDs for every relationship", async () => {
    seedLegacy({
      categories: [{ id: "cat-legacy-1", name: "مسكنات" }],
      medications: [
        {
          id: "med-legacy-1",
          name: "بنادول",
          categoryId: "cat-legacy-1",
          batches: [{ id: "batch-legacy-1", expiry: "2026-01-01", qty: 10 }],
        },
      ],
      firstAid: [{ id: "fa-legacy-1", name: "شاش", qty: 3, threshold: 5 }],
      log: [
        {
          id: "log-legacy-1",
          medId: "med-legacy-1",
          medName: "بنادول",
          batchId: "batch-legacy-1",
          expiry: "2026-01-01",
          qty: 2,
          date: "2026-08-01",
        },
      ],
      uiLabels: {},
    });

    const result = await migrateLegacyDataToSupabase(CLINIC_ID);

    expect(result.migrated).toBe(true);
    expect(result.counts).toEqual({
      categories: 1,
      medications: 1,
      batches: 1,
      firstAid: 1,
      log: 1,
    });

    expect(mockApi.createMedication).toHaveBeenCalledWith(CLINIC_ID, {
      name: "بنادول",
      categoryId: "new-cat-مسكنات",
    });
    expect(mockApi.createBatch).toHaveBeenCalledWith(
      CLINIC_ID,
      "new-med-بنادول",
      { expiry: "2026-01-01", qty: 10 },
    );
    expect(mockApi.importLegacyWithdrawalLog).toHaveBeenCalledWith({
      medicationId: "new-med-بنادول",
      medName: "بنادول",
      batchId: "new-batch-new-med-بنادول-2026-01-01",
      expiry: "2026-01-01",
      qty: 2,
      withdrawnOn: "2026-08-01",
    });

    expect(hasMigrationRun()).toBe(true);
  });

  it("does nothing and reports 'already-migrated' on a second run", async () => {
    seedLegacy({ categories: [{ id: "c1", name: "x" }], medications: [], firstAid: [], log: [] });

    await migrateLegacyDataToSupabase(CLINIC_ID);
    vi.clearAllMocks();
    const second = await migrateLegacyDataToSupabase(CLINIC_ID);

    expect(second).toEqual({ migrated: false, reason: "already-migrated" });
    expect(mockApi.createCategory).not.toHaveBeenCalled();
  });

  it("refuses to migrate (without setting the done flag) if the clinic already has cloud data", async () => {
    seedLegacy({ categories: [{ id: "c1", name: "x" }], medications: [], firstAid: [], log: [] });
    mockApi.hasAnyClinicData.mockResolvedValue(true);

    const result = await migrateLegacyDataToSupabase(CLINIC_ID);

    expect(result).toEqual({ migrated: false, reason: "clinic-already-has-data" });
    expect(mockApi.createCategory).not.toHaveBeenCalled();
    expect(hasMigrationRun()).toBe(false);
  });

  it("reports 'no-legacy-data' when there is nothing to migrate", async () => {
    const result = await migrateLegacyDataToSupabase(CLINIC_ID);
    expect(result).toEqual({ migrated: false, reason: "no-legacy-data" });
  });

  it("normalizes a legacy day-precision expiry to day=1 of the SAME month, without shifting the month", async () => {
    // Legacy batches were entered through the old day-precision date picker
    // (e.g. day=15). Expiry is now month/year only — this must become
    // "2026-08-01", never silently roll into July or September.
    seedLegacy({
      categories: [],
      medications: [
        {
          id: "med-legacy-1",
          name: "بنادول",
          categoryId: null,
          batches: [{ id: "batch-legacy-1", expiry: "2026-08-15", qty: 7 }],
        },
      ],
      firstAid: [],
      log: [
        {
          id: "log-legacy-1",
          medId: "med-legacy-1",
          medName: "بنادول",
          batchId: "batch-legacy-1",
          expiry: "2026-08-31", // same month, different day than the batch above
          qty: 1,
          date: "2026-08-20",
        },
      ],
      uiLabels: {},
    });

    await migrateLegacyDataToSupabase(CLINIC_ID);

    expect(mockApi.createBatch).toHaveBeenCalledWith(
      CLINIC_ID,
      "new-med-بنادول",
      { expiry: "2026-08-01", qty: 7 },
    );
    expect(mockApi.importLegacyWithdrawalLog).toHaveBeenCalledWith(
      expect.objectContaining({ expiry: "2026-08-01" }),
    );
  });
});

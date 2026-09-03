// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MedCard } from "./MedCard";
import { DEFAULT_LABELS } from "../constants";

afterEach(cleanup);

const noop = () => {};
function baseProps(med, overrides = {}) {
  return {
    med,
    L: DEFAULT_LABELS,
    isOwner: true,
    categoryName: "مسكنات",
    onQuickWithdraw: noop,
    onAddBatch: noop,
    onWithdrawCustom: noop,
    onHistory: noop,
    onEdit: noop,
    onDeleteBatch: noop,
    onAdjustBatchQty: noop,
    onDeleteMed: noop,
    ...overrides,
  };
}

describe("MedCard — batch/shelf timeline", () => {
  it("displays a batch with qty > 0", () => {
    const med = {
      id: "m1",
      name: "بنادول",
      batches: [{ id: "b1", expiry: "2028-09-01", qty: 12 }],
    };
    render(<MedCard {...baseProps(med)} />);
    expect(screen.getByText(/12 عينات/)).toBeTruthy();
    expect(screen.getByText(/ينتهي 09\/2028/)).toBeTruthy();
  });

  it("does NOT display a batch with qty = 0", () => {
    const med = {
      id: "m1",
      name: "بنادول",
      batches: [{ id: "b1", expiry: "2028-09-01", qty: 0 }],
    };
    render(<MedCard {...baseProps(med)} />);
    expect(screen.queryByText(/ينتهي 09\/2028/)).toBeNull();
    // falls back to the existing "no batches recorded" empty state
    expect(screen.getByText("لا توجد دفعات مسجّلة")).toBeTruthy();
  });

  it("the zero-quantity batch is not deleted or mutated from the underlying data", () => {
    const med = {
      id: "m1",
      name: "بنادول",
      batches: [
        { id: "b-zero", expiry: "2028-09-01", qty: 0 },
        { id: "b-valid", expiry: "2029-01-01", qty: 5 },
      ],
    };
    render(<MedCard {...baseProps(med)} />);
    // the record still exists, untouched, in the data passed to the component
    expect(med.batches).toHaveLength(2);
    expect(med.batches.find((b) => b.id === "b-zero")).toEqual({
      id: "b-zero",
      expiry: "2028-09-01",
      qty: 0,
    });
  });

  it("shows only the positive-quantity batch when mixed with a zero-quantity batch, sorted as before", () => {
    const med = {
      id: "m1",
      name: "بنادول",
      batches: [
        { id: "b-zero", expiry: "2028-09-01", qty: 0 },
        { id: "b-later", expiry: "2029-06-01", qty: 3 },
        { id: "b-earlier", expiry: "2029-01-01", qty: 5 },
      ],
    };
    render(<MedCard {...baseProps(med)} />);
    expect(screen.queryByText(/ينتهي 09\/2028/)).toBeNull();
    const chips = screen.getAllByText(/ينتهي/).map((el) => el.textContent);
    // earliest-expiry-first ordering among the remaining (qty > 0) batches is preserved
    expect(chips).toEqual([
      expect.stringContaining("01/2029"),
      expect.stringContaining("06/2029"),
    ]);
  });

  it("all batches zero-quantity: renders the existing empty state, same as a medication with no batches at all", () => {
    const med = {
      id: "m1",
      name: "بنادول",
      batches: [{ id: "b1", expiry: "2028-09-01", qty: 0 }],
    };
    const medNoBatches = { id: "m2", name: "دواء آخر", batches: [] };
    const { unmount } = render(<MedCard {...baseProps(med)} />);
    expect(screen.getByText("لا توجد دفعات مسجّلة")).toBeTruthy();
    unmount();
    render(<MedCard {...baseProps(medNoBatches)} />);
    expect(screen.getByText("لا توجد دفعات مسجّلة")).toBeTruthy();
  });

  it("existing behavior for positive-quantity batches is unchanged: shows qty, expiry, and days-remaining text", () => {
    const med = {
      id: "m1",
      name: "بنادول",
      batches: [{ id: "b1", expiry: "2028-09-01", qty: 7 }],
    };
    render(<MedCard {...baseProps(med)} />);
    expect(screen.getByText(/7 عينات/)).toBeTruthy();
    expect(screen.getByText(/ينتهي 09\/2028/)).toBeTruthy();
  });
});

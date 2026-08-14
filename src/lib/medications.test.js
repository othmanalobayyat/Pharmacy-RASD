import { describe, it, expect } from "vitest";
import { urgency, medEarliestBatch, medTotalQty, medUrgency } from "./medications";

describe("urgency()", () => {
  it("classifies a past date as expired", () => {
    expect(urgency(-1)).toBe("expired");
    expect(urgency(-30)).toBe("expired");
  });
  it("classifies 0-30 days as critical", () => {
    expect(urgency(0)).toBe("critical");
    expect(urgency(30)).toBe("critical");
  });
  it("classifies 31-90 days as warning", () => {
    expect(urgency(31)).toBe("warning");
    expect(urgency(90)).toBe("warning");
  });
  it("classifies more than 90 days as ok", () => {
    expect(urgency(91)).toBe("ok");
    expect(urgency(400)).toBe("ok");
  });
});

describe("medEarliestBatch() — FEFO selection", () => {
  it("selects the batch with the earliest expiry among batches with stock", () => {
    const med = {
      batches: [
        { id: "b-late", expiry: "2027-01-01", qty: 5 },
        { id: "b-early", expiry: "2026-06-01", qty: 3 },
        { id: "b-mid", expiry: "2026-09-01", qty: 10 },
      ],
    };
    expect(medEarliestBatch(med).id).toBe("b-early");
  });

  it("ignores batches with zero quantity even if they expire soonest", () => {
    const med = {
      batches: [
        { id: "b-empty-earliest", expiry: "2025-01-01", qty: 0 },
        { id: "b-has-stock", expiry: "2026-01-01", qty: 4 },
      ],
    };
    expect(medEarliestBatch(med).id).toBe("b-has-stock");
  });

  it("returns null when there is no batch with available stock", () => {
    const med = {
      batches: [
        { id: "b1", expiry: "2026-01-01", qty: 0 },
        { id: "b2", expiry: "2026-02-01", qty: 0 },
      ],
    };
    expect(medEarliestBatch(med)).toBeNull();
  });

  it("returns null for a medication with no batches at all", () => {
    expect(medEarliestBatch({ batches: [] })).toBeNull();
  });
});

describe("medTotalQty()", () => {
  it("sums quantity across all batches", () => {
    const med = { batches: [{ qty: 2 }, { qty: 5 }, { qty: 0 }] };
    expect(medTotalQty(med)).toBe(7);
  });
  it("is 0 for a medication with no batches", () => {
    expect(medTotalQty({ batches: [] })).toBe(0);
  });
});

describe("medUrgency()", () => {
  it("is 'empty' when there is no batch with stock", () => {
    expect(medUrgency({ batches: [] })).toBe("empty");
    expect(medUrgency({ batches: [{ expiry: "2020-01-01", qty: 0 }] })).toBe("empty");
  });

  it("reflects the urgency of the earliest-expiring in-stock batch", () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 400);
    const iso = farFuture.toISOString().slice(0, 10);
    const med = { batches: [{ expiry: iso, qty: 3 }] };
    expect(medUrgency(med)).toBe("ok");
  });
});

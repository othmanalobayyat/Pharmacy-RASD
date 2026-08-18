import { describe, it, expect } from "vitest";
import {
  urgency,
  medEarliestBatch,
  medTotalQty,
  medUrgency,
  withdrawableBatches,
} from "./medications";

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

describe("withdrawableBatches() — expired stock must never be offered for withdrawal", () => {
  // All dates here are absolute, with an explicit reference ("today") date,
  // so these never depend on which real day the suite happens to run on —
  // see lib/dates.test.js for why that matters under month/year expiry
  // (a day-relative "yesterday" is usually still in the SAME expiry month).
  const REFERENCE = "2026-08-15"; // "today" for every test in this block

  it("selects the earliest-expiring NON-EXPIRED batch as the first (FEFO) choice", () => {
    // Mirrors the exact example from the business rule: 07/2026 expired,
    // 08/2026 valid and selected first, 11/2026 valid and selected after.
    const med = {
      batches: [
        { id: "batch-a-07-2026", expiry: "2026-07-01", qty: 10 }, // earliest overall, but expired
        { id: "batch-b-08-2026", expiry: "2026-08-01", qty: 20 },
        { id: "batch-c-11-2026", expiry: "2026-11-01", qty: 5 },
      ],
    };
    const result = withdrawableBatches(med, REFERENCE);
    expect(result.map((b) => b.id)).toEqual(["batch-b-08-2026", "batch-c-11-2026"]);
  });

  it("ignores an expired batch even though it has plenty of quantity", () => {
    const med = {
      batches: [{ id: "b-expired", expiry: "2026-07-01", qty: 999 }],
    };
    expect(withdrawableBatches(med, REFERENCE)).toEqual([]);
  });

  it("ignores a batch with zero quantity even if it is not expired", () => {
    const med = {
      batches: [{ id: "b-empty", expiry: "2026-10-01", qty: 0 }],
    };
    expect(withdrawableBatches(med, REFERENCE)).toEqual([]);
  });

  it("returns an empty list when every batch is expired (withdrawal must fail safely)", () => {
    const med = {
      batches: [
        { id: "b1", expiry: "2026-06-01", qty: 5 },
        { id: "b2", expiry: "2026-07-01", qty: 3 },
      ],
    };
    expect(withdrawableBatches(med, REFERENCE)).toEqual([]);
  });

  it("a batch expiring in the current month is still fully withdrawable, on any day of that month", () => {
    const med = { batches: [{ id: "b-this-month", expiry: "2026-08-01", qty: 4 }] };
    // "today" as the 1st, the 15th, and the last day of the same expiry month
    expect(withdrawableBatches(med, "2026-08-01").map((b) => b.id)).toEqual(["b-this-month"]);
    expect(withdrawableBatches(med, "2026-08-15").map((b) => b.id)).toEqual(["b-this-month"]);
    expect(withdrawableBatches(med, "2026-08-31").map((b) => b.id)).toEqual(["b-this-month"]);
  });

  it("that same batch becomes unwithdrawable the instant the next month starts", () => {
    const med = { batches: [{ id: "b-this-month", expiry: "2026-08-01", qty: 4 }] };
    expect(withdrawableBatches(med, "2026-09-01")).toEqual([]);
  });

  it("is unaffected by the legacy stored day-of-month (e.g. day=17 from the old picker)", () => {
    const med = { batches: [{ id: "b-legacy-day17", expiry: "2026-08-17", qty: 4 }] };
    expect(withdrawableBatches(med, "2026-08-31").map((b) => b.id)).toEqual(["b-legacy-day17"]);
    expect(withdrawableBatches(med, "2026-09-01")).toEqual([]);
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

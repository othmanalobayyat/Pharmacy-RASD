import { describe, it, expect } from "vitest";
import {
  isExpired,
  isExpiringThisMonth,
  daysUntilMonthEnd,
  formatMonthYear,
  monthInputToISO,
  isoToMonthInput,
  todayISO,
  formatFullDate,
} from "./dates";

describe("formatFullDate() — for WITHDRAWAL date displays (day precision), never for expiry", () => {
  it("formats an ISO date as DD/MM/YYYY", () => {
    expect(formatFullDate("2026-08-25")).toBe("25/08/2026");
  });
  it("keeps a single-digit day/month zero-padded as stored", () => {
    expect(formatFullDate("2026-01-05")).toBe("05/01/2026");
  });
});

describe("isExpired() — legacy day-based smoke test (uses real 'today')", () => {
  it("is true for a date in the past", () => {
    expect(isExpired("2020-01-01")).toBe(true);
  });
  it("is false for today", () => {
    expect(isExpired(todayISO())).toBe(false);
  });
});

// Business rule (confirmed with the business owner): expiry is month/year
// only. A batch expiring "08/2026" is valid through the entire month of
// August 2026 and only becomes expired starting 2026-09-01. All tests below
// use an explicit reference date so they never depend on when the suite is
// actually run.
describe("isExpired() — month/year semantics", () => {
  it("08/2026 is NOT expired at any point during August 2026 (day 1)", () => {
    expect(isExpired("2026-08-01", "2026-08-01")).toBe(false);
  });
  it("08/2026 is NOT expired during August 2026 (day 15)", () => {
    expect(isExpired("2026-08-01", "2026-08-15")).toBe(false);
  });
  it("08/2026 is NOT expired on the very last day of August 2026", () => {
    expect(isExpired("2026-08-01", "2026-08-31")).toBe(false);
  });
  it("08/2026 IS expired starting September 2026", () => {
    expect(isExpired("2026-08-01", "2026-09-01")).toBe(true);
  });
  it("07/2026 is expired during August 2026", () => {
    expect(isExpired("2026-07-01", "2026-08-01")).toBe(true);
  });
  it("09/2026 is valid (not expired) during August 2026", () => {
    expect(isExpired("2026-09-01", "2026-08-15")).toBe(false);
  });
  it("is not affected by the stored day-of-month — a legacy batch stored with day=15 still expires by month only", () => {
    expect(isExpired("2026-08-15", "2026-08-31")).toBe(false);
    expect(isExpired("2026-08-15", "2026-09-01")).toBe(true);
  });
});

describe("isExpiringThisMonth() — used by the Today/Triage view", () => {
  it("is true when the batch's month matches the reference month, on any day of it", () => {
    expect(isExpiringThisMonth("2026-08-01", "2026-08-01")).toBe(true);
    expect(isExpiringThisMonth("2026-08-01", "2026-08-31")).toBe(true);
  });
  it("is false for a past (already-expired) month", () => {
    expect(isExpiringThisMonth("2026-07-01", "2026-08-15")).toBe(false);
  });
  it("is false for a future month", () => {
    expect(isExpiringThisMonth("2026-09-01", "2026-08-15")).toBe(false);
  });
  it("is unaffected by the stored day-of-month", () => {
    expect(isExpiringThisMonth("2026-08-17", "2026-08-01")).toBe(true);
  });
});

describe("daysUntilMonthEnd()", () => {
  it("counts down to the last day of the expiry month, not day 1", () => {
    // 2026-08-01 -> 2026-08-31 is 30 days away as of 2026-08-01
    expect(daysUntilMonthEnd("2026-08-01", "2026-08-01")).toBe(30);
  });
  it("is 0 on the last day of the expiry month itself", () => {
    expect(daysUntilMonthEnd("2026-08-01", "2026-08-31")).toBe(0);
  });
  it("is negative once the expiry month has ended", () => {
    expect(daysUntilMonthEnd("2026-08-01", "2026-09-05")).toBe(-5);
  });
});

describe("formatMonthYear()", () => {
  it("formats an ISO date as MM/YYYY, never showing a day", () => {
    expect(formatMonthYear("2026-08-01")).toBe("08/2026");
  });
  it("formats correctly even for a legacy non-day-1 value", () => {
    expect(formatMonthYear("2026-08-15")).toBe("08/2026");
  });
});

describe("monthInputToISO() / isoToMonthInput()", () => {
  it("converts a native <input type='month'> value to a day-01 ISO date", () => {
    expect(monthInputToISO("2026-08")).toBe("2026-08-01");
  });
  it("round-trips back to the month value", () => {
    expect(isoToMonthInput(monthInputToISO("2026-08"))).toBe("2026-08");
  });
});

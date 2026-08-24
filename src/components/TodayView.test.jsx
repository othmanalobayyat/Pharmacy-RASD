// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { TodayView } from "./TodayView";
import { todayISO } from "../lib/dates";

afterEach(cleanup);

// Deterministic relative months, computed from the real "today" the same
// way the component itself does (it has no reference-date override — this
// mirrors real usage in App.jsx) — never hardcoded to a fixed calendar date
// that would eventually go stale.
function monthISO(offset) {
  const [y, m] = todayISO().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 10);
}
const THIS_MONTH = monthISO(0);
const LAST_MONTH = monthISO(-1);
const NEXT_MONTH = monthISO(1);

const categories = [
  { id: "cat-pain", name: "مسكنات" },
  { id: "cat-abx", name: "مضادات حيوية" },
];

function med(overrides) {
  return { id: "m", name: "دواء", categoryId: "cat-pain", batches: [], ...overrides };
}

describe("TodayView — Today/Triage screen", () => {
  it("an already-expired batch puts its medication in the 'Expired' section", () => {
    // also has a valid batch, so this test stays isolated to the Expired
    // section only (a fully-expired medication also lands in Low Stock —
    // covered separately below).
    const medication = med({
      id: "m-expired",
      name: "بنادول قديم",
      batches: [
        { id: "b1", expiry: LAST_MONTH, qty: 5 },
        { id: "b2", expiry: NEXT_MONTH, qty: 10 },
      ],
    });
    render(
      <TodayView
        categories={categories}
        medications={[medication]}
        firstAid={[]}
        onGoToMed={() => {}}
        onGoToFirstAid={() => {}}
      />,
    );
    expect(screen.getByText("بنادول قديم")).toBeTruthy();
    expect(screen.getByText("لا يوجد أدوية تنتهي صلاحيتها هذا الشهر.")).toBeTruthy();
  });

  it("a batch expiring THIS month puts its medication in 'Expiring This Month', not 'Expired'", () => {
    const medication = med({
      id: "m-this-month",
      name: "أموكسيسيلين",
      categoryId: "cat-abx",
      batches: [{ id: "b1", expiry: THIS_MONTH, qty: 10 }],
    });
    render(
      <TodayView
        categories={categories}
        medications={[medication]}
        firstAid={[]}
        onGoToMed={() => {}}
        onGoToFirstAid={() => {}}
      />,
    );
    expect(screen.getByText("أموكسيسيلين")).toBeTruthy();
    expect(screen.getByText("لا يوجد أدوية منتهية الصلاحية حاليًا.")).toBeTruthy();
  });

  it("a batch expiring NEXT month does NOT appear in Expired or Expiring-This-Month", () => {
    const medication = med({
      id: "m-future",
      name: "فيتامين سي",
      batches: [{ id: "b1", expiry: NEXT_MONTH, qty: 10 }],
    });
    render(
      <TodayView
        categories={categories}
        medications={[medication]}
        firstAid={[]}
        onGoToMed={() => {}}
        onGoToFirstAid={() => {}}
      />,
    );
    expect(screen.queryByText("فيتامين سي")).toBeNull();
    expect(screen.getByText("لا يوجد أدوية منتهية الصلاحية حاليًا.")).toBeTruthy();
    expect(screen.getByText("لا يوجد أدوية تنتهي صلاحيتها هذا الشهر.")).toBeTruthy();
  });

  it("uses AVAILABLE quantity (not raw total) for the low/out-of-stock section — fully expired stock counts as unavailable", () => {
    const medication = med({
      id: "m-expired-only",
      name: "دواء منتهي بالكامل",
      batches: [{ id: "b1", expiry: LAST_MONTH, qty: 20 }],
    });
    render(
      <TodayView
        categories={categories}
        medications={[medication]}
        firstAid={[]}
        onGoToMed={() => {}}
        onGoToFirstAid={() => {}}
      />,
    );
    // appears in both Expired (has expired qty) AND Low/out-of-stock
    // (available === 0) — both facts are independently true
    const matches = screen.getAllByText("دواء منتهي بالكامل");
    expect(matches.length).toBe(2);
  });

  it("mixed valid + expired batches: medication is NOT flagged as low/out-of-stock (still has available stock)", () => {
    const medication = med({
      id: "m-mixed",
      name: "دواء مختلط",
      batches: [
        { id: "b-expired", expiry: LAST_MONTH, qty: 8 },
        { id: "b-valid", expiry: NEXT_MONTH, qty: 12 },
      ],
    });
    render(
      <TodayView
        categories={categories}
        medications={[medication]}
        firstAid={[]}
        onGoToMed={() => {}}
        onGoToFirstAid={() => {}}
      />,
    );
    // appears exactly once — in Expired only, not in low-stock (available=12>0)
    expect(screen.getAllByText("دواء مختلط").length).toBe(1);
    expect(screen.getByText(/8 وحدة منتهية/)).toBeTruthy();
  });

  it("all-valid inventory renders every section's friendly empty state", () => {
    const medication = med({
      id: "m-fine",
      name: "دواء سليم",
      batches: [{ id: "b1", expiry: NEXT_MONTH, qty: 50 }],
    });
    render(
      <TodayView
        categories={categories}
        medications={[medication]}
        firstAid={[{ id: "f1", name: "شاش", qty: 20, threshold: 5 }]}
        onGoToMed={() => {}}
        onGoToFirstAid={() => {}}
      />,
    );
    expect(screen.getByText("لا يوجد أدوية منتهية الصلاحية حاليًا.")).toBeTruthy();
    expect(screen.getByText("لا يوجد أدوية تنتهي صلاحيتها هذا الشهر.")).toBeTruthy();
    expect(screen.getByText("لا يوجد نقص حاليًا في الأدوية أو مواد الإسعاف.")).toBeTruthy();
  });

  it("low first-aid stock (qty <= threshold) appears in the low-stock section and is clickable", () => {
    const onGoToFirstAid = vi.fn();
    render(
      <TodayView
        categories={categories}
        medications={[]}
        firstAid={[{ id: "f1", name: "ضمادات", qty: 2, threshold: 5 }]}
        onGoToMed={() => {}}
        onGoToFirstAid={onGoToFirstAid}
      />,
    );
    const item = screen.getByText("ضمادات");
    expect(item).toBeTruthy();
    fireEvent.click(item.closest("button"));
    expect(onGoToFirstAid).toHaveBeenCalledTimes(1);
  });

  it("medications from multiple categories are all included, with their category name shown", () => {
    const meds = [
      med({
        id: "m1",
        name: "دواء أ",
        categoryId: "cat-pain",
        batches: [
          { id: "b1", expiry: LAST_MONTH, qty: 3 },
          { id: "b1v", expiry: NEXT_MONTH, qty: 1 },
        ],
      }),
      med({
        id: "m2",
        name: "دواء ب",
        categoryId: "cat-abx",
        batches: [
          { id: "b2", expiry: LAST_MONTH, qty: 4 },
          { id: "b2v", expiry: NEXT_MONTH, qty: 1 },
        ],
      }),
    ];
    render(
      <TodayView
        categories={categories}
        medications={meds}
        firstAid={[]}
        onGoToMed={() => {}}
        onGoToFirstAid={() => {}}
      />,
    );
    expect(screen.getByText(/مسكنات/)).toBeTruthy();
    expect(screen.getByText(/مضادات حيوية/)).toBeTruthy();
  });

  it("clicking an expired-medication item calls onGoToMed with that medication", () => {
    const onGoToMed = vi.fn();
    const medication = med({
      id: "m-click",
      name: "دواء للنقر",
      batches: [
        { id: "b1", expiry: LAST_MONTH, qty: 1 },
        { id: "b2", expiry: NEXT_MONTH, qty: 1 },
      ],
    });
    render(
      <TodayView
        categories={categories}
        medications={[medication]}
        firstAid={[]}
        onGoToMed={onGoToMed}
        onGoToFirstAid={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("دواء للنقر").closest("button"));
    expect(onGoToMed).toHaveBeenCalledWith(medication);
  });
});

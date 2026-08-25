// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mockApi = vi.hoisted(() => ({ fetchAllWithdrawalLogs: vi.fn() }));
vi.mock("../lib/pharmacyApi", () => mockApi);

const { LogSection } = await import("./LogSection");

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const L = { logTitle: "سجلّ عمليات الصرف من الرفوف (كل الأدوية)" };

// Newest-first, matching what fetchAllWithdrawalLogs() actually returns
// (order("created_at", { ascending: false })).
const row = (overrides) => ({
  id: "log-x",
  medId: "m1",
  medName: "بنادول",
  batchId: "b1",
  expiry: "2026-09-01",
  qty: 1,
  date: "2026-08-20",
  createdAt: "2026-08-20T10:00:00.000Z",
  performedByEmail: "staff@clinic.test",
  ...overrides,
});

describe("LogSection — سجل الصرف grouped by medication", () => {
  it("multiple withdrawals of the same medication are grouped into ONE card with the correct count", async () => {
    mockApi.fetchAllWithdrawalLogs.mockResolvedValue([
      row({ id: "l4", qty: 5, createdAt: "2026-08-25T09:00:00.000Z", date: "2026-08-25" }),
      row({ id: "l3", qty: 3, createdAt: "2026-08-20T09:00:00.000Z", date: "2026-08-20" }),
      row({ id: "l2", qty: 2, createdAt: "2026-08-14T09:00:00.000Z", date: "2026-08-14" }),
      row({ id: "l1", qty: 1, createdAt: "2026-08-10T09:00:00.000Z", date: "2026-08-10" }),
    ]);
    render(<LogSection L={L} refreshSignal={0} />);

    expect(await screen.findByText("بنادول")).toBeTruthy();
    // appears exactly once in the main list, not four times
    expect(screen.getAllByText("بنادول")).toHaveLength(1);
    expect(screen.getByText("عدد مرات الصرف: 4")).toBeTruthy();
  });

  it("shows total quantity as a secondary figure, never as the operation count", async () => {
    mockApi.fetchAllWithdrawalLogs.mockResolvedValue([
      row({ id: "l1", qty: 2 }),
      row({ id: "l2", qty: 5 }),
      row({ id: "l3", qty: 1 }),
    ]);
    render(<LogSection L={L} refreshSignal={0} />);

    await screen.findByText("عدد مرات الصرف: 3");
    expect(screen.getByText("إجمالي المصروف: 8 وحدة")).toBeTruthy();
  });

  it("different medications remain separate groups", async () => {
    mockApi.fetchAllWithdrawalLogs.mockResolvedValue([
      row({ id: "l1", medId: "m1", medName: "بنادول" }),
      row({ id: "l2", medId: "m2", medName: "Nexium 40" }),
      row({ id: "l3", medId: "m2", medName: "Nexium 40" }),
    ]);
    render(<LogSection L={L} refreshSignal={0} />);

    await screen.findByText("بنادول");
    expect(screen.getByText("عدد مرات الصرف: 1")).toBeTruthy();
    expect(screen.getByText("Nexium 40")).toBeTruthy();
    expect(screen.getByText("عدد مرات الصرف: 2")).toBeTruthy();
  });

  it("two different (deleted) medications with a null medication_id but different names are NOT merged together", async () => {
    mockApi.fetchAllWithdrawalLogs.mockResolvedValue([
      row({ id: "l1", medId: null, medName: "دواء محذوف أ" }),
      row({ id: "l2", medId: null, medName: "دواء محذوف ب" }),
    ]);
    render(<LogSection L={L} refreshSignal={0} />);

    await screen.findByText("دواء محذوف أ");
    expect(screen.getByText("دواء محذوف ب")).toBeTruthy();
    // each is its own group of 1, not merged into a single group of 2
    expect(screen.getAllByText("عدد مرات الصرف: 1")).toHaveLength(2);
  });

  it("clicking a medication opens its details with ALL individual withdrawal records, newest first", async () => {
    mockApi.fetchAllWithdrawalLogs.mockResolvedValue([
      row({ id: "l-new", qty: 5, date: "2026-08-25", createdAt: "2026-08-25T09:00:00.000Z" }),
      row({ id: "l-old", qty: 1, date: "2026-08-10", createdAt: "2026-08-10T09:00:00.000Z" }),
    ]);
    render(<LogSection L={L} refreshSignal={0} />);

    fireEvent.click(await screen.findByText("بنادول"));

    expect(screen.getByText("تفاصيل عمليات الصرف")).toBeTruthy();
    const qtyCells = screen.getAllByRole("row").map((r) => r.textContent);
    // header row + 2 data rows; newest (qty 5) must come before oldest (qty 1)
    const newIdx = qtyCells.findIndex((t) => t.includes("25/08/2026"));
    const oldIdx = qtyCells.findIndex((t) => t.includes("10/08/2026"));
    expect(newIdx).toBeGreaterThan(-1);
    expect(oldIdx).toBeGreaterThan(newIdx);
  });

  it("the details view uses createdAt for the time column, formatted, not invented from withdrawn_on", async () => {
    mockApi.fetchAllWithdrawalLogs.mockResolvedValue([
      row({ id: "l1", createdAt: "2026-08-20T10:35:00.000Z" }),
    ]);
    render(<LogSection L={L} refreshSignal={0} />);
    fireEvent.click(await screen.findByText("بنادول"));

    const expectedTime = new Date("2026-08-20T10:35:00.000Z").toLocaleTimeString("ar", {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(screen.getByText(expectedTime)).toBeTruthy();
  });

  it("a withdrawal date/expiry are shown with their own distinct formats — full DD/MM/YYYY for the date, MM/YYYY only for expiry", async () => {
    mockApi.fetchAllWithdrawalLogs.mockResolvedValue([
      row({ id: "l1", date: "2026-08-20", expiry: "2026-09-01" }),
    ]);
    render(<LogSection L={L} refreshSignal={0} />);
    fireEvent.click(await screen.findByText("بنادول"));

    expect(screen.getByText("20/08/2026")).toBeTruthy();
    expect(screen.getByText("09/2026")).toBeTruthy();
  });

  it("an empty history shows the correct empty state, not a blank screen", async () => {
    mockApi.fetchAllWithdrawalLogs.mockResolvedValue([]);
    render(<LogSection L={L} refreshSignal={0} />);

    expect(await screen.findByText("لا توجد عمليات صرف مسجلة")).toBeTruthy();
  });

  it("a loading failure is NOT mistaken for an empty history, and offers retry", async () => {
    mockApi.fetchAllWithdrawalLogs.mockRejectedValue(
      new Error("⚠️ ليس لديك صلاحية لتنفيذ هذا الإجراء."),
    );
    render(<LogSection L={L} refreshSignal={0} />);

    expect(await screen.findByText("⚠️ ليس لديك صلاحية لتنفيذ هذا الإجراء.")).toBeTruthy();
    expect(screen.queryByText("لا توجد عمليات صرف مسجلة")).toBeNull();
    expect(screen.getByText("إعادة المحاولة")).toBeTruthy();
  });

  it("retry re-issues the request", async () => {
    mockApi.fetchAllWithdrawalLogs
      .mockRejectedValueOnce(new Error("⚠️ خطأ"))
      .mockResolvedValueOnce([row()]);
    render(<LogSection L={L} refreshSignal={0} />);

    fireEvent.click(await screen.findByText("إعادة المحاولة"));

    expect(await screen.findByText("بنادول")).toBeTruthy();
    expect(mockApi.fetchAllWithdrawalLogs).toHaveBeenCalledTimes(2);
  });

  it("a bumped refreshSignal (realtime) re-fetches", async () => {
    mockApi.fetchAllWithdrawalLogs.mockResolvedValue([row()]);
    const { rerender } = render(<LogSection L={L} refreshSignal={0} />);
    await screen.findByText("بنادول");

    rerender(<LogSection L={L} refreshSignal={1} />);

    await waitFor(() => expect(mockApi.fetchAllWithdrawalLogs).toHaveBeenCalledTimes(2));
  });
});

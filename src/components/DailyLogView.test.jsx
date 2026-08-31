// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

// Vitest hoists vi.mock() above imports — anything the factory closes over
// must be created inside vi.hoisted().
const mockApi = vi.hoisted(() => ({
  fetchWithdrawalLogForDate: vi.fn(),
}));
vi.mock("../lib/pharmacyApi", () => mockApi);

const { DailyLogView } = await import("./DailyLogView");
const { todayISO } = await import("../lib/dates");

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

const row = (overrides) => ({
  id: "log-1",
  medId: "m1",
  medName: "بنادول",
  batchId: "b1",
  expiry: "2026-08-01",
  qty: 2,
  date: todayISO(),
  createdAt: `${todayISO()}T10:35:00.000Z`,
  performedByEmail: "staff@clinic.test",
  ...overrides,
});

describe("DailyLogView — سجل الصرف اليومي", () => {
  it("loads and shows today's withdrawals by default", async () => {
    mockApi.fetchWithdrawalLogForDate.mockResolvedValue([row()]);
    render(<DailyLogView refreshSignal={0} />);

    await waitFor(() =>
      expect(mockApi.fetchWithdrawalLogForDate).toHaveBeenCalledWith(todayISO()),
    );
    expect(await screen.findByText("بنادول")).toBeTruthy();
  });

  it("selecting another date fetches and displays only that date's withdrawals", async () => {
    mockApi.fetchWithdrawalLogForDate.mockImplementation((date) =>
      Promise.resolve(date === "2026-08-10" ? [row({ id: "log-10", medName: "أموكسيسيلين" })] : []),
    );
    render(<DailyLogView refreshSignal={0} />);
    await waitFor(() => expect(mockApi.fetchWithdrawalLogForDate).toHaveBeenCalledTimes(1));

    const dateInput = document.querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: "2026-08-10" } });

    await waitFor(() =>
      expect(mockApi.fetchWithdrawalLogForDate).toHaveBeenLastCalledWith("2026-08-10"),
    );
    expect(await screen.findByText("أموكسيسيلين")).toBeTruthy();
  });

  it("an empty day shows the correct empty state, not a blank area", async () => {
    mockApi.fetchWithdrawalLogForDate.mockResolvedValue([]);
    render(<DailyLogView refreshSignal={0} />);

    expect(await screen.findByText("لا توجد عمليات صرف لهذا اليوم")).toBeTruthy();
    expect(
      screen.getByText("لم يتم تسجيل أي عملية صرف في التاريخ المحدد."),
    ).toBeTruthy();
  });

  it("the daily operation count and total withdrawn quantity are correct", async () => {
    mockApi.fetchWithdrawalLogForDate.mockResolvedValue([
      row({ id: "log-1", qty: 2 }),
      row({ id: "log-2", qty: 5, medName: "فيتامين سي" }),
      row({ id: "log-3", qty: 1, medName: "أسبرين" }),
    ]);
    render(<DailyLogView refreshSignal={0} />);

    await screen.findByText("بنادول");
    expect(screen.getByText("عدد عمليات الصرف").previousSibling.textContent).toBe("3");
    expect(screen.getByText("إجمالي العينات المصروفة").previousSibling.textContent).toBe("8");
  });

  it("changing the date updates the displayed records (old ones are cleared, not merged)", async () => {
    mockApi.fetchWithdrawalLogForDate
      .mockResolvedValueOnce([row({ id: "log-a", medName: "دواء أ" })])
      .mockResolvedValueOnce([row({ id: "log-b", medName: "دواء ب" })]);
    render(<DailyLogView refreshSignal={0} />);
    await screen.findByText("دواء أ");

    fireEvent.change(document.querySelector('input[type="date"]'), {
      target: { value: "2026-08-11" },
    });

    await screen.findByText("دواء ب");
    expect(screen.queryByText("دواء أ")).toBeNull();
  });

  it("a loading failure shows a retry option and is NOT mistaken for an empty day", async () => {
    mockApi.fetchWithdrawalLogForDate.mockRejectedValue(
      new Error("⚠️ تعذر الاتصال بالنظام. تحقق من اتصال الإنترنت وحاول مرة أخرى."),
    );
    render(<DailyLogView refreshSignal={0} />);

    expect(
      await screen.findByText("⚠️ تعذر الاتصال بالنظام. تحقق من اتصال الإنترنت وحاول مرة أخرى."),
    ).toBeTruthy();
    // the empty-day message must NOT appear — a failed load is a distinct state
    expect(screen.queryByText("لا توجد عمليات صرف لهذا اليوم")).toBeNull();
    expect(screen.getByText("إعادة المحاولة")).toBeTruthy();
  });

  it("retry re-issues the request for the same date", async () => {
    mockApi.fetchWithdrawalLogForDate
      .mockRejectedValueOnce(new Error("⚠️ خطأ"))
      .mockResolvedValueOnce([row()]);
    render(<DailyLogView refreshSignal={0} />);

    await screen.findByText("إعادة المحاولة");
    fireEvent.click(screen.getByText("إعادة المحاولة"));

    expect(await screen.findByText("بنادول")).toBeTruthy();
    expect(mockApi.fetchWithdrawalLogForDate).toHaveBeenCalledTimes(2);
  });

  it("a bumped refreshSignal (realtime) re-fetches the currently selected date", async () => {
    mockApi.fetchWithdrawalLogForDate.mockResolvedValue([row()]);
    const { rerender } = render(<DailyLogView refreshSignal={0} />);
    await waitFor(() => expect(mockApi.fetchWithdrawalLogForDate).toHaveBeenCalledTimes(1));

    rerender(<DailyLogView refreshSignal={1} />);
    await waitFor(() => expect(mockApi.fetchWithdrawalLogForDate).toHaveBeenCalledTimes(2));
  });
});

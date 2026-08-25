// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Kpi } from "./Kpi";

afterEach(cleanup);

describe("Kpi — clickable dashboard shortcut", () => {
  it("renders as a real, keyboard-activatable <button> when onClick is given", () => {
    const onClick = vi.fn();
    render(<Kpi icon={<span />} value={3} label="منتهية الصلاحية" tone="expired" onClick={onClick} />);

    const btn = screen.getByRole("button", { name: /منتهية الصلاحية/ });
    expect(btn.tagName).toBe("BUTTON");

    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("still shows the value and label", () => {
    render(<Kpi icon={<span />} value={7} label="أقل من شهر" tone="critical" onClick={() => {}} />);
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("أقل من شهر")).toBeTruthy();
  });

  it("renders as a plain, non-interactive div when no onClick is given (backward compatible)", () => {
    render(<Kpi icon={<span />} value={2} label="نوع دواء مسجل" tone="ok" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

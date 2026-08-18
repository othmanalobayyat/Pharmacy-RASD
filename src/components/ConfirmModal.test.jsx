// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ConfirmModal } from "./ConfirmModal";

afterEach(cleanup);

describe("ConfirmModal — destructive-action confirmation", () => {
  it("shows the given title and message", () => {
    render(
      <ConfirmModal
        title="حذف الدواء"
        message='هل أنت متأكد من حذف "بنادول"؟'
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("حذف الدواء")).toBeTruthy();
    expect(screen.getByText('هل أنت متأكد من حذف "بنادول"؟')).toBeTruthy();
  });

  it("cancel calls onCancel and does NOT call onConfirm — nothing is mutated", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmModal title="t" message="m" onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByText("إلغاء"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("confirm calls onConfirm and does NOT call onCancel — the intended action proceeds", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmModal title="t" message="m" onConfirm={onConfirm} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByText("حذف"));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("clicking the modal's own close (X) button behaves like cancel", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { container } = render(
      <ConfirmModal title="t" message="m" onConfirm={onConfirm} onCancel={onCancel} />,
    );

    // Modal's header close button has no accessible name beyond the icon;
    // it's the only <button> inside the header row.
    const headerButtons = container.querySelectorAll("button");
    fireEvent.click(headerButtons[0]);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

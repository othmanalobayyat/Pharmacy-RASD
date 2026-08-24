// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AdjustBatchQtyForm } from "./AdjustBatchQtyForm";

afterEach(cleanup);

const batch = { id: "b1", qty: 500, expiry: "2026-08-01" };

describe("AdjustBatchQtyForm — client-side validation (RPC remains the real authority)", () => {
  it("shows the medication name, expiry, and current quantity", () => {
    render(
      <AdjustBatchQtyForm medName="Panadol" batch={batch} onSubmit={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByText("Panadol")).toBeTruthy();
    expect(screen.getByText("08/2026")).toBeTruthy();
    expect(screen.getByText("500")).toBeTruthy();
  });

  it("the save button is disabled until a different, non-negative integer quantity AND a reason are both given", () => {
    render(
      <AdjustBatchQtyForm medName="Panadol" batch={batch} onSubmit={() => {}} onCancel={() => {}} />,
    );
    const saveBtn = screen.getByText("حفظ التعديل").closest("button");
    // starts prefilled with the current quantity (500) and no reason -> disabled
    expect(saveBtn.disabled).toBe(true);
  });

  it("submitting the same quantity as current is blocked, with a clear Arabic hint, and creates no audit entry", () => {
    const onSubmit = vi.fn();
    render(
      <AdjustBatchQtyForm medName="Panadol" batch={batch} onSubmit={onSubmit} onCancel={() => {}} />,
    );
    fireEvent.change(screen.getByDisplayValue("500"), { target: { value: "500" } });
    fireEvent.change(screen.getByPlaceholderText("مثال: تصحيح خطأ عند إدخال الكمية"), {
      target: { value: "تصحيح خطأ عند إدخال الكمية" },
    });
    expect(
      screen.getByText("الكمية الجديدة تطابق الكمية الحالية — لا حاجة للتعديل."),
    ).toBeTruthy();
    const saveBtn = screen.getByText("حفظ التعديل").closest("button");
    expect(saveBtn.disabled).toBe(true);
    fireEvent.click(saveBtn);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("a negative quantity keeps the save button disabled (never reaches the RPC)", () => {
    render(
      <AdjustBatchQtyForm medName="Panadol" batch={batch} onSubmit={() => {}} onCancel={() => {}} />,
    );
    fireEvent.change(screen.getByDisplayValue("500"), { target: { value: "-5" } });
    fireEvent.change(screen.getByPlaceholderText("مثال: تصحيح خطأ عند إدخال الكمية"), {
      target: { value: "سبب" },
    });
    expect(screen.getByText("حفظ التعديل").closest("button").disabled).toBe(true);
  });

  it("a valid correction with a reason submits the parsed integer quantity and trimmed reason", () => {
    const onSubmit = vi.fn();
    render(
      <AdjustBatchQtyForm medName="Panadol" batch={batch} onSubmit={onSubmit} onCancel={() => {}} />,
    );
    fireEvent.change(screen.getByDisplayValue("500"), { target: { value: "50" } });
    fireEvent.change(screen.getByPlaceholderText("مثال: تصحيح خطأ عند إدخال الكمية"), {
      target: { value: "  تصحيح خطأ عند إدخال الكمية  " },
    });
    fireEvent.click(screen.getByText("حفظ التعديل").closest("button"));
    expect(onSubmit).toHaveBeenCalledWith(50, "تصحيح خطأ عند إدخال الكمية");
  });

  it("zero is a valid new quantity (not blocked like negative numbers)", () => {
    const onSubmit = vi.fn();
    render(
      <AdjustBatchQtyForm medName="Panadol" batch={batch} onSubmit={onSubmit} onCancel={() => {}} />,
    );
    fireEvent.change(screen.getByDisplayValue("500"), { target: { value: "0" } });
    fireEvent.change(screen.getByPlaceholderText("مثال: تصحيح خطأ عند إدخال الكمية"), {
      target: { value: "نفدت الكمية فعليًا" },
    });
    fireEvent.click(screen.getByText("حفظ التعديل").closest("button"));
    expect(onSubmit).toHaveBeenCalledWith(0, "نفدت الكمية فعليًا");
  });

  it("cancel calls onCancel without submitting anything", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <AdjustBatchQtyForm medName="Panadol" batch={batch} onSubmit={onSubmit} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByText("إلغاء"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
